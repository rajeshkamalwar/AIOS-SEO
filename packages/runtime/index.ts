import { createHash } from "node:crypto";
import { canonical } from "../contracts/index.js";

export type DeploymentMode = "local-synthetic-v1" | "production";

export type DeploymentProfile = {
  mode: DeploymentMode;
  processingRegion?: string;
  storageRegion?: string;
  backupRegion?: string;
  retentionPolicyId?: string;
  deletionPolicyId?: string;
  providerDataUsePolicyId?: string;
  operatorSubject?: string;
  reviewerSubject?: string;
  secretManagerRef?: string;
  backupPolicyId?: string;
  recoveryRunbookRef?: string;
  oidc?: { issuer: string; audience: string; clientId: string; secretRef: string };
};

export type ActivationResult =
  | { ok: true; profileHash: string; mode: DeploymentMode }
  | { ok: false; code: "profile_invalid"; reasons: string[] };

const requiredProduction: (keyof DeploymentProfile)[] = [
  "processingRegion", "storageRegion", "backupRegion", "retentionPolicyId",
  "deletionPolicyId", "providerDataUsePolicyId", "operatorSubject",
  "reviewerSubject", "secretManagerRef", "backupPolicyId", "recoveryRunbookRef",
];

function has(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 4096; }
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function secretReference(value: unknown): boolean {
  return typeof value === "string" && /^secret:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{0,4095}$/.test(value);
}
function issuer(value: unknown): boolean {
  if (!has(value) || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function validateDeploymentProfile(profile: DeploymentProfile): string[] {
  const reasons: string[] = [];
  if (!plain(profile) || !["local-synthetic-v1", "production"].includes(profile.mode)) return ["mode_invalid"];
  if (Object.keys(profile).some(key => !["mode", "oidc", ...requiredProduction].includes(key as keyof DeploymentProfile))) reasons.push("profile_fields_invalid");
  if (profile.mode === "local-synthetic-v1") {
    if (Object.keys(profile).some(key => key !== "mode")) reasons.push("local_profile_must_not_include_production_configuration");
    return reasons;
  }
  for (const key of requiredProduction) if (!has(profile[key])) reasons.push(`${key}_required`);
  if (profile.operatorSubject === profile.reviewerSubject) reasons.push("operator_and_reviewer_must_be_distinct");
  const oidc = profile.oidc;
  if (!plain(oidc) || Object.keys(oidc).some(key => !["issuer", "audience", "clientId", "secretRef"].includes(key)) ||
      !issuer(oidc.issuer) || !has(oidc.audience) || !has(oidc.clientId) || !has(oidc.secretRef)) reasons.push("oidc_profile_invalid");
  if (!secretReference(profile.secretManagerRef)) reasons.push("secret_manager_reference_invalid");
  if (!plain(oidc) || !secretReference(oidc.secretRef)) reasons.push("oidc_secret_reference_invalid");
  return reasons;
}

export function activateProfile(profile: DeploymentProfile): ActivationResult {
  const reasons = validateDeploymentProfile(profile);
  // Configuration syntax is not independent deployment approval or deployed health.
  // No production activation adapter is installed yet; never authorize with strings alone.
  if (profile?.mode === "production") reasons.push("production_activation_not_installed");
  if (reasons.length) return { ok: false, code: "profile_invalid", reasons };
  const profileHash = createHash("sha256").update(canonical(profile)).digest("hex");
  return { ok: true, profileHash, mode: profile.mode };
}

export type AuthIdentity = { issuer: string; subject: string };
export interface AuthAdapter { authenticate(input: unknown): Promise<AuthIdentity>; }

export class LocalSyntheticAuthAdapter implements AuthAdapter {
  async authenticate(input: unknown): Promise<AuthIdentity> {
    if (!input || typeof input !== "object" || !("subject" in input) || typeof input.subject !== "string" || !input.subject) throw new Error("local_identity_invalid");
    return { issuer: "local://synthetic", subject: input.subject };
  }
}

export function identityKey(identity: AuthIdentity): string {
  if (!identity || !has(identity.issuer) || !has(identity.subject) || identity.issuer.includes("\u0000") || identity.subject.includes("\u0000")) throw new Error("identity_invalid");
  return `${identity.issuer}\u0000${identity.subject}`;
}

export type RecoveryChecks = {
  deletionLedgerReplayed: boolean;
  artifactsReconciled: boolean;
  tenantIsolationProbed: boolean;
  backupRestoreReceipt: boolean;
};

export function recoveryReadiness(checks: RecoveryChecks): { state: "ready" | "quarantined"; reasons: string[] } {
  const required: (keyof RecoveryChecks)[] = ["deletionLedgerReplayed", "artifactsReconciled", "tenantIsolationProbed", "backupRestoreReceipt"];
  const reasons = required.filter(key => !plain(checks) || !Object.hasOwn(checks, key) || checks[key] !== true).map(key => `${key}_missing`);
  if (!plain(checks) || Object.keys(checks).some(key => !required.includes(key as keyof RecoveryChecks))) reasons.push("recovery_checks_invalid");
  return reasons.length ? { state: "quarantined", reasons } : { state: "ready", reasons: [] };
}

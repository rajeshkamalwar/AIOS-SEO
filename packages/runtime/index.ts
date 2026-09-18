import { createHash } from "node:crypto";

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

function has(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

export function validateDeploymentProfile(profile: DeploymentProfile): string[] {
  const reasons: string[] = [];
  if (!profile || !["local-synthetic-v1", "production"].includes(profile.mode)) return ["mode_invalid"];
  if (profile.mode === "local-synthetic-v1") {
    if (Object.entries(profile).some(([key, value]) => key !== "mode" && value !== undefined)) reasons.push("local_profile_must_not_include_production_configuration");
    return reasons;
  }
  for (const key of requiredProduction) if (!has(profile[key])) reasons.push(`${key}_required`);
  if (profile.operatorSubject === profile.reviewerSubject) reasons.push("operator_and_reviewer_must_be_distinct");
  const oidc = profile.oidc;
  if (!oidc || !/^https:\/\//.test(oidc.issuer) || !has(oidc.audience) || !has(oidc.clientId) || !has(oidc.secretRef)) reasons.push("oidc_profile_invalid");
  if (oidc?.secretRef !== profile.secretManagerRef && !oidc?.secretRef.startsWith("secret://")) reasons.push("oidc_secret_reference_invalid");
  return reasons;
}

export function activateProfile(profile: DeploymentProfile): ActivationResult {
  const reasons = validateDeploymentProfile(profile);
  if (reasons.length) return { ok: false, code: "profile_invalid", reasons };
  const profileHash = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
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
  if (!has(identity.issuer) || !has(identity.subject)) throw new Error("identity_invalid");
  return `${identity.issuer}\u0000${identity.subject}`;
}

export type RecoveryChecks = {
  deletionLedgerReplayed: boolean;
  artifactsReconciled: boolean;
  tenantIsolationProbed: boolean;
  backupRestoreReceipt: boolean;
};

export function recoveryReadiness(checks: RecoveryChecks): { state: "ready" | "quarantined"; reasons: string[] } {
  const reasons = Object.entries(checks).filter(([, value]) => value !== true).map(([key]) => `${key}_missing`);
  return reasons.length ? { state: "quarantined", reasons } : { state: "ready", reasons: [] };
}

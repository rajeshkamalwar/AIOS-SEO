import assert from "node:assert/strict";
import { test } from "node:test";
import { activateProfile, identityKey, LocalSyntheticAuthAdapter, recoveryReadiness, validateDeploymentProfile } from "../packages/runtime/index.js";

test("local profile is explicit and production configuration is rejected", () => {
  assert.deepEqual(validateDeploymentProfile({ mode: "local-synthetic-v1" }), []);
  assert.ok(validateDeploymentProfile({ mode: "local-synthetic-v1", processingRegion: "test" }).includes("local_profile_must_not_include_production_configuration"));
});

test("production activation fails closed until every operational gate is present", () => {
  const result = activateProfile({ mode: "production" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.reasons.includes("oidc_profile_invalid"));
});

test("production profile requires distinct operator and reviewer identities", () => {
  const profile = {
    mode: "production" as const, processingRegion: "eu", storageRegion: "eu", backupRegion: "eu",
    retentionPolicyId: "ret-1", deletionPolicyId: "del-1", providerDataUsePolicyId: "provider-1",
    operatorSubject: "same", reviewerSubject: "same", secretManagerRef: "secret://runtime",
    backupPolicyId: "backup-1", recoveryRunbookRef: "runbook-1",
    oidc: { issuer: "https://issuer.example", audience: "aios", clientId: "client", secretRef: "secret://runtime" },
  };
  assert.ok(validateDeploymentProfile(profile).includes("operator_and_reviewer_must_be_distinct"));
  profile.reviewerSubject = "reviewer";
  assert.equal(activateProfile(profile).ok, true);
});

test("local auth uses issuer plus subject and never email matching", async () => {
  const identity = await new LocalSyntheticAuthAdapter().authenticate({ subject: "owner-1", email: "ignored@example.test" });
  assert.equal(identityKey(identity), "local://synthetic\u0000owner-1");
  assert.throws(() => identityKey({ issuer: "local://synthetic", subject: "" }));
});

test("restore remains quarantined until all independent checks pass", () => {
  assert.deepEqual(recoveryReadiness({ deletionLedgerReplayed: true, artifactsReconciled: true, tenantIsolationProbed: false, backupRestoreReceipt: true }), { state: "quarantined", reasons: ["tenantIsolationProbed_missing"] });
  assert.deepEqual(recoveryReadiness({ deletionLedgerReplayed: true, artifactsReconciled: true, tenantIsolationProbed: true, backupRestoreReceipt: true }), { state: "ready", reasons: [] });
});

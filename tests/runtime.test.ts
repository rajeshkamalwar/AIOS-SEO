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
  assert.deepEqual(validateDeploymentProfile(profile), []);
  const inactive = activateProfile(profile);
  assert.equal(inactive.ok, false);
  if (!inactive.ok) assert.ok(inactive.reasons.includes("production_activation_not_installed"));
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

test('missing, malformed or unknown recovery checks never report ready', () => {
  for (const value of [{}, null, [], { deletionLedgerReplayed: true },
    { deletionLedgerReplayed: true, artifactsReconciled: true, tenantIsolationProbed: true, backupRestoreReceipt: true, unexpected: true }]) {
    assert.equal(recoveryReadiness(value as never).state, 'quarantined');
  }
});


test("malformed deployment input and secret/issuer ambiguity fail closed without throwing", () => {
  for (const value of [null, [], {}, {mode:"local-synthetic-v1", processingRegion:undefined}, {mode:"local-synthetic-v1", unknown:true}, {mode:"production", oidc:{issuer:"https://issuer.example"}}]) {
    assert.equal(activateProfile(value as never).ok, false);
  }
  for (const issuer of ["https://", "https://user:secret@issuer.example", "https://issuer.example/#fragment", "https://issuer.example/?token=private", " https://issuer.example"]) {
    assert.ok(validateDeploymentProfile({mode:"production",oidc:{issuer,audience:"a",clientId:"b",secretRef:"secret://runtime"}}).includes("oidc_profile_invalid"));
  }
  assert.ok(validateDeploymentProfile({mode:"production",secretManagerRef:"literal-secret",oidc:{issuer:"https://issuer.example",audience:"a",clientId:"b",secretRef:"literal-secret"}}).includes("oidc_secret_reference_invalid"));
  assert.equal(activateProfile({mode:"local-synthetic-v1"}).ok,true);
  assert.throws(()=>identityKey({issuer:"a\u0000b",subject:"c"}),/identity_invalid/);
  assert.throws(()=>identityKey({issuer:"a",subject:"b\u0000c"}),/identity_invalid/);
});

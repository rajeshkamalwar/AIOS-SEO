import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalBlobs } from "../packages/evidence/index.js";
import { hash } from "../packages/contracts/index.js";
test("private artifacts reject traversal, overwrite, symlinks and tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "aios-blob-"));
  try {
    const store = await LocalBlobs.create(root, "local-synthetic-v1");
    const key = store.key(randomUUID(), randomUUID(), randomUUID());
    const data = Buffer.from("real fixture bytes");
    await store.put(key, data);
    assert.deepEqual(await store.read(key, hash(data), data.length), data);
    await assert.rejects(store.put(key, data));
    await assert.rejects(store.read("../../etc/passwd", "", 0));
    await writeFile(join(root, key.replaceAll("/", "_")), "changed");
    await assert.rejects(store.read(key, hash(data), data.length), /integrity/);
    const linkkey = store.key(randomUUID(), randomUUID(), randomUUID());
    await symlink("/etc/passwd", join(root, linkkey.replaceAll("/", "_")));
    await assert.rejects(store.read(linkkey, "", 0));
    await assert.rejects(
      LocalBlobs.create(root, "production"),
      /policy_blocked/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

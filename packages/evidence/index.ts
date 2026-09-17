import { constants } from "node:fs";
import {
  open,
  mkdir,
  realpath,
  lstat,
  readdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { hash, uuid } from "../contracts/index.js";

/** Private single-directory synthetic adapter. No HTTP/object-key upload endpoint. */
export class LocalBlobs {
  private constructor(private readonly root: string) {}
  static async create(root: string, profile: string): Promise<LocalBlobs> {
    if (profile !== "local-synthetic-v1") throw new Error("policy_blocked");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
      throw new Error("unsafe_blob_root");
    return new LocalBlobs(await realpath(root));
  }
  key(tenant: string, site: string, evidence: string): string {
    [tenant, site, evidence].forEach(uuid);
    return `${tenant}/${site}/${evidence}`;
  }
  private path(key: string): string {
    const parts = key.split("/");
    if (parts.length !== 3) throw new Error("invalid_blob_key");
    parts.forEach(uuid);
    // Flat filename removes intermediate-directory symlink races; final opens use O_NOFOLLOW.
    return join(this.root, parts.join("_"));
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > 5 * 1024 * 1024)
      throw new Error("response_too_large");
    const file = await open(
      this.path(key),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    const directory = await open(this.root, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async read(
    key: string,
    expectedHash: string,
    expectedBytes: number,
  ): Promise<Buffer> {
    const file = await open(
      this.path(key),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size !== expectedBytes ||
        stat.size > 5 * 1024 * 1024
      )
        throw new Error("artifact_integrity_failed");
      const data = await file.readFile();
      if (hash(data) !== expectedHash)
        throw new Error("artifact_integrity_failed");
      return data;
    } finally {
      await file.close();
    }
  }
  /** Caller holds the ledger's acceptance/maintenance lock for the entire sweep. */
  async removeUnreferenced(referenced: Set<string>): Promise<number> {
    let count = 0;
    for (const name of await readdir(this.root)) {
      const key = name.replaceAll("_", "/");
      this.path(key);
      if (!referenced.has(key)) {
        await unlink(join(this.root, name));
        count++;
      }
    }
    return count;
  }
}

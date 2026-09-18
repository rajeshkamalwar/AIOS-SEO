import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, copyFileSync, cpSync, rmSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc"], {
  stdio: "inherit",
});
mkdirSync("dist/spec", { recursive: true });
for (const name of readdirSync("spec").filter((n) =>
  n.endsWith(".schema.json") || n === "quality-gates.json" || n === "discovery-policy.json",
))
  copyFileSync("spec/" + name, "dist/spec/" + name);
cpSync(
  "packages/persistence/migrations",
  "dist/packages/persistence/migrations",
  { recursive: true },
);

#!/usr/bin/env node
/**
 * Synthetic onboarding probe. Fixtures only. Never prod. Never supabase-pirin-ai.
 * Requires dist/ (npm run build, or npm run probe:onboarding).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, ["--test", "test/onboarding-gate.test.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VERCEL_ENV: "" },
});
if (result.status !== 0) {
  console.error("onboarding probe failed");
  process.exit(result.status ?? 1);
}
console.log("onboarding probe passed (fixtures, never prod)");

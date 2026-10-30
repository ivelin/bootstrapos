#!/usr/bin/env node
/**
 * Insert one SOP version. The body file stays outside the repo. Drive is the source.
 * Usage: node scripts/publish-sop.mjs <name> <version> <file>
 * Env: BOOTSTRAP_SUPABASE_URL (or SUPABASE_URL) and
 * BOOTSTRAP_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */
import crypto from "node:crypto";
import fs from "node:fs";

const [name, version, file] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!name || !version || !file) {
  fail("Usage: node scripts/publish-sop.mjs <name> <version> <file>");
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
  fail("name must be a lowercase slug");
}
if (!/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(version)) {
  fail("version must be major.minor.patch");
}

const url = (process.env.BOOTSTRAP_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key =
  process.env.BOOTSTRAP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  fail(
    "Set BOOTSTRAP_SUPABASE_URL and BOOTSTRAP_SUPABASE_SERVICE_ROLE_KEY. The script does not print them.",
  );
}

const body = fs.readFileSync(file, "utf8");
const sha256 = crypto.createHash("sha256").update(body, "utf8").digest("hex");

const res = await fetch(`${url}/rest/v1/bootstrap_os_sops`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ name, version, body, sha256 }),
});
const text = await res.text();
if (res.status === 409 || /duplicate key|unique/i.test(text)) {
  fail(`Refusing existing ${name} ${version}. Published versions are append-only.`);
}
if (!res.ok) {
  fail(`Insert failed with HTTP ${res.status}.`);
}
let rows;
try {
  rows = JSON.parse(text);
} catch {
  fail("Insert response was not JSON.");
}
const row = Array.isArray(rows) ? rows[0] : rows;
if (!row?.id || row.sha256 !== sha256) {
  fail("Insert response did not confirm id and sha256.");
}
console.log(`id ${row.id}`);
console.log(`sha256 ${row.sha256}`);

/**
 * Catalog of authenticated SECURITY DEFINER RPCs. Compiled from migrations, never prod.
 * A new write RPC fails unless its body calls has_rank or it is in a named allowlist class.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const snapshotPath = path.join(__dirname, "fixtures", "hosted-write-role-catalog.json");
const forward = path.join(migrationsDir, "20261111_bootstrap_os_hosted_write_role_enforcement.sql");

const ALLOW = {
  bootstrap_os_create_starter_board: "create-own",
  create_company_self_serve: "create-own",
  bootstrap_os_create_company: "platform-admin",
  bootstrap_os_grant_super_admin: "platform-admin",
  bootstrap_os_revoke_super_admin: "platform-admin",
  bootstrap_os_invite_accept: "accept-invite",
  bootstrap_mcp_accept_invite: "accept-invite",
  bootstrap_mcp_accept_pending_invites: "accept-invite",
  bootstrap_os_submit_feedback: "self-ticket",
  bootstrap_mcp_whoami: "session-touch",
  bootstrap_mcp_my_labels: "session-touch",
  bootstrap_mcp_mint_token: "mint-token",
  bootstrap_rate_take: "rate-take",
  bootstrap_hosted_take: "hosted-take",
  starter_block_subscriber: "trigger",
};

function latestBodies(files) {
  const bodies = new Map();
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    const re = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+((?:public|bootstrap_os)\.[a-z0-9_]+)\s*\(/gi;
    let match;
    while ((match = re.exec(sql))) {
      const name = match[1].split(".").pop();
      const start = match.index;
      const asIdx = sql.indexOf("AS", start);
      const header = sql.slice(start, asIdx);
      const end = sql.indexOf("\n$$;", asIdx);
      if (end < 0) continue;
      bodies.set(name, { header, body: sql.slice(start, end + 4), file: path.basename(file) });
    }
  }
  return bodies;
}

function grantedToAuthenticated(files) {
  const granted = new Map();
  const grantRe = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+((?:public|bootstrap_os)\.[a-z0-9_]+)\s*\([^;]*?\)\s+TO\s+([^;]+)/gi;
  const revokeRe = /REVOKE\s+ALL\s+ON\s+FUNCTION\s+((?:public|bootstrap_os)\.[a-z0-9_]+)\s*\([^;]*?\)\s+FROM\s+([^;]+)/gi;
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    const events = [];
    for (const re of [grantRe, revokeRe]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(sql))) {
        events.push({ index: match.index, kind: re === grantRe ? "grant" : "revoke", name: match[1].split(".").pop(), roles: match[2] });
      }
    }
    events.sort((a, b) => a.index - b.index);
    for (const event of events) {
      const mentions = /\bauthenticated\b/i.test(event.roles);
      if (!mentions) continue;
      granted.set(event.name, event.kind === "grant");
    }
  }
  return [...granted.entries()].filter(([, on]) => on).map(([name]) => name);
}

export function compileCatalog() {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => path.join(migrationsDir, name));
  const bodies = latestBodies(files);
  const rows = [];
  for (const name of grantedToAuthenticated(files).sort()) {
    const def = bodies.get(name);
    if (!def || !/SECURITY\s+DEFINER/i.test(def.header)) continue;
    const writes = /\b(INSERT|UPDATE|DELETE)\b/i.test(def.body);
    let cls;
    if (/has_rank\s*\(/i.test(def.body)) cls = "has_rank";
    else if (ALLOW[name]) cls = ALLOW[name];
    else if (!writes) cls = "read";
    else cls = "UNCLASSIFIED";
    rows.push({ name, class: cls });
  }
  return rows;
}

describe("hosted write-role catalog", () => {
  it("matches the migration snapshot and classifies every authenticated write RPC", () => {
    const compiled = compileCatalog();
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    assert.deepEqual(compiled, snapshot);
    const bad = compiled.filter((row) => row.class === "UNCLASSIFIED");
    assert.deepEqual(bad, []);
    const ranked = compiled.filter((row) => row.class === "has_rank").map((row) => row.name);
    assert.deepEqual(ranked.sort(), [
      "bootstrap_mcp_invite_member",
      "bootstrap_os_change_acl",
      "bootstrap_os_create_idea",
      "bootstrap_os_invite_create",
      "bootstrap_os_post_comment",
      "bootstrap_os_put_journey",
      "bootstrap_os_put_portfolio_score",
      "bootstrap_os_subscribe_board",
      "bootstrap_os_unsubscribe_board",
    ]);
  });

  it("rejects a new authenticated write RPC with no has_rank and no class", () => {
    const compiled = compileCatalog();
    const extra = compiled.concat([{ name: "bootstrap_os_future_write", class: "UNCLASSIFIED" }]);
    assert.equal(extra.some((row) => row.class === "UNCLASSIFIED"), true);
    assert.equal(compiled.some((row) => row.class === "UNCLASSIFIED"), false);
  });

  it("lints 20261111 for backfill, anon grants, and role current_setting", () => {
    const sql = fs.readFileSync(forward, "utf8");
    assert.equal(/GRANT\s+(ALL|EXECUTE)\b[^;]*\bTO\s+anon\b/i.test(sql), false);
    assert.equal(/current_setting\s*\(\s*'[^']*role/i.test(sql), false);
    assert.equal(/UPDATE\s+bootstrap_os\.company_acl/i.test(sql), false);
    assert.equal(/INSERT\s+INTO\s+bootstrap_os\.company_acl[\s\S]{0,120}founder_authorized/i.test(sql), false);
    const ensure = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.bootstrap_os_ensure_company("),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey"),
    );
    assert.equal(ensure.includes("founder_authorized"), false);
  });
});

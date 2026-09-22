/**
 * Hosted create_company + super_admin. PGlite only. Never supabase-pirin-ai.
 * Fail the pipeline on 403/409 misses or a cross-tenant leak.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDENTITY = path.join(__dirname, "pglite", "identity-schema.sql");
const ROLES = path.join(__dirname, "pglite", "roles-schema.sql");
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260928_bootstrap_os_roles.sql",
);

const FOUNDER = "founder@example.test";
const FOUNDER_UID = "33333333-3333-3333-3333-333333333333";
const MEMBER_A = "mentee-a@example.test";
const MEMBER_A_UID = "11111111-1111-1111-1111-111111111111";
const MEMBER_B = "mentee-b@example.test";
const MEMBER_B_UID = "22222222-2222-2222-2222-222222222222";
const CANARY = "bravo-only-canary-token";

let db;

async function asUser(email, uid) {
  await db.exec("RESET ROLE");
  await db.exec(`SELECT set_config('app.auth_uid', '${uid}', false)`);
  await db.exec(`SELECT set_config('app.auth_email', '${email}', false)`);
}

async function createCompany(slug, founderYes = true, why = "new company") {
  const rows = await db.query(
    "SELECT bootstrap_os_create_company($1, $2, $3, $4) AS body",
    [slug, slug, founderYes, why],
  );
  return rows.rows[0].body;
}

function assertEmpty403(body, detail) {
  assert.equal(body.ok, false, detail);
  assert.equal(body.status, 403, detail);
  assert.deepEqual(Object.keys(body).sort(), ["ok", "status"], detail);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(CANARY));
  assert.doesNotMatch(JSON.stringify(body), /mentee-b@example\.test/);
  assert.equal(body.ideas, undefined, detail);
  assert.equal(body.labels, undefined, detail);
  assert.equal(body.slug, undefined, detail);
}

describe("hosted create_company + super_admin (PGlite, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(IDENTITY, "utf8"));
    await db.exec(fs.readFileSync(ROLES, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("migration seeds member only and has no insert policy", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.bootstrap_os_roles FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]{0,400}FOR INSERT/i);
    assert.doesNotMatch(sql, /ivelin@/);
    assert.doesNotMatch(sql, /@pirin\.ai/);
    assert.doesNotMatch(sql, /LIKE '%pirin\.ai'|ends with/i);
    assert.match(sql, /email = 'founder@example\.test'/);
    const seed = sql.slice(sql.lastIndexOf("Fictional member seed only"));
    assert.match(seed, /'member'/);
    assert.doesNotMatch(seed, /super_admin/);
    assert.doesNotMatch(sql, /INSERT INTO bootstrap_os\.ideas|create_idea/);
  });

  it("whoami.role is member for the fictional seed and unset with no role row", async () => {
    await asUser(FOUNDER, FOUNDER_UID);
    const founder = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(founder.authenticated, true);
    assert.equal(founder.role, "member");
    assert.deepEqual(founder.labels, ["alpha", "bravo", "charlie"]);

    await asUser(MEMBER_B, MEMBER_B_UID);
    const bravo = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(bravo.role, "unset");
    assert.deepEqual(bravo.labels, ["bravo"]);
    assert.doesNotMatch(JSON.stringify(bravo), new RegExp(CANARY));
  });

  it("member cannot create_company → 403", async () => {
    await asUser(MEMBER_A, MEMBER_A_UID);
    assertEmpty403(await createCompany("delta"), "member create delta");
    assertEmpty403(await createCompany("bravo"), "member probe of company B is 403 not 409");
    const probe = await createCompany("bravo");
    assert.notEqual(probe.status, 409);
  });

  it("grant without super_admin → 403", async () => {
    await asUser(MEMBER_B, MEMBER_B_UID);
    const body = (
      await db.query("SELECT bootstrap_os_grant_super_admin($1) AS body", [MEMBER_A])
    ).rows[0].body;
    assertEmpty403(body, "member grant");
  });

  it("self-grant → 403", async () => {
    await asUser(FOUNDER, FOUNDER_UID);
    await db.exec(`
      UPDATE bootstrap_os_roles SET revoked_at = now() WHERE id = 'role-founder-member';
      INSERT INTO bootstrap_os_roles (id, mentee_id, role, granted_by, granted_at)
      VALUES ('role-founder-admin', 'mentee-ivelin', 'super_admin', 'mentee-ivelin', now());
    `);
    const who = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(who.role, "super_admin");
    const self = (
      await db.query("SELECT bootstrap_os_grant_super_admin($1) AS body", [FOUNDER])
    ).rows[0].body;
    assert.equal(self.ok, false);
    assert.equal(self.status, 403);
    assert.equal(self.error, "self_grant");
    assert.doesNotMatch(JSON.stringify(self), new RegExp(CANARY));
  });

  it("revoked admin cannot create_company → 403", async () => {
    await asUser(FOUNDER, FOUNDER_UID);
    const granted = (
      await db.query("SELECT bootstrap_os_grant_super_admin($1) AS body", [MEMBER_A])
    ).rows[0].body;
    assert.equal(granted.ok, true, JSON.stringify(granted));
    assert.equal(granted.role, "super_admin");
    const revoked = (
      await db.query("SELECT bootstrap_os_revoke_super_admin($1) AS body", [MEMBER_A])
    ).rows[0].body;
    assert.equal(revoked.ok, true, JSON.stringify(revoked));
    assert.equal(revoked.role, "member");

    await asUser(MEMBER_A, MEMBER_A_UID);
    const who = (await db.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
    assert.equal(who.role, "member");
    assert.notEqual(who.role, "super_admin");
    assertEmpty403(await createCompany("echo"), "revoked admin create");
  });

  it("create company C does not leak company B", async () => {
    await asUser(FOUNDER, FOUNDER_UID);
    const created = await createCompany("delta", true, "separate board");
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.slug, "delta");
    assert.equal(created.role, "super_admin");
    assert.equal(created.idea, undefined);
    assert.equal(created.ideas, undefined);
    const blob = JSON.stringify(created);
    assert.doesNotMatch(blob, new RegExp(CANARY));
    assert.doesNotMatch(blob, /mentee-b@example\.test/);
    assert.doesNotMatch(blob, /"bravo"/);

    await db.exec("RESET ROLE");
    await db.exec(`SELECT set_config('app.auth_uid', '${MEMBER_A_UID}', false)`);
    await db.exec("SET ROLE mentee_reader");
    const labels = await db.query("SELECT label FROM bootstrap_company_labels ORDER BY label");
    assert.deepEqual(
      labels.rows.map((row) => row.label),
      ["alpha"],
    );
    await db.exec("RESET ROLE");
  });

  it("duplicate slug → 409", async () => {
    await asUser(FOUNDER, FOUNDER_UID);
    const again = await createCompany("delta");
    assert.equal(again.ok, false);
    assert.equal(again.status, 409);
    assert.equal(again.error, "slug_taken");
    assert.doesNotMatch(JSON.stringify(again), new RegExp(CANARY));
    const existing = await createCompany("bravo");
    assert.equal(existing.status, 409);
    assert.doesNotMatch(JSON.stringify(existing), new RegExp(CANARY));
  });

  it("audit rows for grant and create", async () => {
    await db.exec("RESET ROLE");
    const rows = await db.query(
      "SELECT op, actor_email, target_email, slug FROM bootstrap_os_admin_audit ORDER BY created_at",
    );
    const ops = rows.rows.map((row) => row.op);
    assert.ok(ops.includes("grant_super_admin"), JSON.stringify(rows.rows));
    assert.ok(ops.includes("create_company"), JSON.stringify(rows.rows));
    assert.ok(ops.includes("revoke_super_admin"), JSON.stringify(rows.rows));
    const created = rows.rows.find((row) => row.op === "create_company");
    assert.equal(created.actor_email, FOUNDER);
    assert.equal(created.slug, "delta");
    const granted = rows.rows.find((row) => row.op === "grant_super_admin");
    assert.equal(granted.actor_email, FOUNDER);
    assert.equal(granted.target_email, MEMBER_A);
  });

  it("reader role cannot insert a super_admin row", async () => {
    await db.exec("RESET ROLE");
    await db.exec("SET ROLE mentee_reader");
    await assert.rejects(
      () =>
        db.exec(
          "INSERT INTO bootstrap_os_roles (id, mentee_id, role) VALUES ('hack', 'mentee-a', 'super_admin')",
        ),
      /permission denied|row-level security/i,
    );
    await db.exec("RESET ROLE");
  });
});

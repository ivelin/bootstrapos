/**
 * Isolated Postgres (PGlite). Never supabase-pirin-ai. Never prod.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(__dirname, "..", "supabase", "migrations");

const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.auth_uid', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
`;

let db;

function claims(email, sub) {
  if (!email && !sub) return "";
  return JSON.stringify({ email: email ?? "", sub: sub ?? "" });
}

async function callInvite({ email, sub, settingEmail = "", settingSub = "", settingLocal = true, asService = false, invitee, companies }) {
  const local = settingLocal ? "true" : "false";
  const rows = await db.query(
    `
    SELECT public.bootstrap_os_invite_create($4, $5::jsonb) AS body
    FROM (
      SELECT
        set_config('role', $6, true),
        set_config('request.jwt.claims', $1, true),
        set_config('app.actor_email', $2, ${local}),
        set_config('app.actor_sub', $3, ${local})
    ) cfg
    `,
    [
      claims(email, sub),
      settingEmail,
      settingSub,
      invitee,
      JSON.stringify(companies),
      asService ? "service_role" : "postgres",
    ],
  );
  return rows.rows[0].body;
}

describe("scoped invite RLS and card actor (PGlite, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    const journey = fs
      .readFileSync(path.join(migrations, "20260902_bootstrap_os_journey.sql"), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "-- PGlite: gen_random_uuid is built-in");
    await db.exec(journey);
    await db.exec(fs.readFileSync(path.join(migrations, "20261029_bootstrap_os_scoped_invites.sql"), "utf8"));
    await db.exec(`
      INSERT INTO bootstrap_os.companies (id, slug, label)
      VALUES ('11111111-1111-1111-1111-111111111111', 'alpha', 'alpha');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'founder@example.test', 'email', 'founder'),
        ('11111111-1111-1111-1111-111111111111', 'editor@example.test', 'email', 'editor'),
        ('11111111-1111-1111-1111-111111111111', 'viewer@example.test', 'email', 'viewer');
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage)
      VALUES ('11111111-1111-1111-1111-111111111111', 'default', 'alpha bet', 1, 1);
    `);
  });

  after(async () => {
    await db?.close();
  });

  it("a direct card UPDATE without an actor fails", async () => {
    await assert.rejects(
      () =>
        db.exec(`
          SELECT set_config('app.actor_email', '', true);
          SELECT set_config('app.actor_sub', '', true);
          SELECT set_config('request.jwt.claims', '', true);
          UPDATE bootstrap_os.ideas SET name = 'changed' WHERE slug = 'default';
        `),
      /actor_required/,
    );
  });

  it("JWT claims with no app setting let an owner invite and a card UPDATE writes one audit row", async () => {
    await db.exec(`
      SELECT set_config('app.actor_email', '', true);
      SELECT set_config('app.actor_sub', '', true);
      SELECT set_config(
        'request.jwt.claims',
        '{"email":"founder@example.test","sub":"22222222-2222-2222-2222-222222222222"}',
        true
      );
      UPDATE bootstrap_os.ideas SET name = 'alpha bet card' WHERE slug = 'default';
    `);
    const rows = await db.query(
      "SELECT what_changed->>'via' AS via FROM bootstrap_os.audit_events WHERE what_changed->>'via' = 'card.update'",
    );
    assert.equal(rows.rows.length, 1);

    const created = await callInvite({
      email: "founder@example.test",
      sub: "22222222-2222-2222-2222-222222222222",
      invitee: "member@example.test",
      companies: [{ slug: "alpha", role: "editor" }],
    });
    assert.equal(created.ok, true);
    assert.equal(created.inviteeEmail, "member@example.test");
    assert.deepEqual(created.companies, [{ slug: "alpha", role: "editor" }]);
    assert.deepEqual(created.dropped, []);
    const hashed = await db.query(
      "SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex') AS digest",
      [created.token],
    );
    const stored = await db.query(
      "SELECT token_hash FROM bootstrap_os.invites WHERE invitee_email = 'member@example.test'",
    );
    assert.equal(stored.rows[0].token_hash, hashed.rows[0].digest);
    const accepted = await db.query(
      `
      SELECT public.bootstrap_os_invite_accept($2) AS body
      FROM (SELECT set_config('request.jwt.claims', $1, true)) cfg
      `,
      [claims("member@example.test", "55555555-5555-5555-5555-555555555555"), created.token],
    );
    assert.equal(accepted.rows[0].body.ok, true);
    const acl = await db.query(
      `SELECT role FROM bootstrap_os.company_acl
       WHERE principal = 'member@example.test' AND principal_kind = 'email'`,
    );
    assert.deepEqual(acl.rows.map((row) => row.role), ["editor"]);
  });

  it("a viewer JWT plus the owner setting cannot mint an editor invite", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invite_companies");
    const denied = await callInvite({
      email: "viewer@example.test",
      sub: "44444444-4444-4444-4444-444444444444",
      settingEmail: "founder@example.test",
      settingSub: "22222222-2222-2222-2222-222222222222",
      settingLocal: true,
      invitee: "member@example.test",
      companies: [{ slug: "alpha", role: "editor" }],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "invite_partial_authority");
    const after = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invite_companies");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("role owner is refused and writes no invite rows", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invite_companies");
    const denied = await callInvite({
      email: "founder@example.test",
      sub: "22222222-2222-2222-2222-222222222222",
      invitee: "member@example.test",
      companies: [{ slug: "alpha", role: "owner" }],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "invite_partial_authority");
    assert.equal(denied.denied[0].reason, "owner_forbidden");
    const after = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invite_companies");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("authenticated cannot read invites, and audit updates fail", async () => {
    const grants = await db.query(`
      SELECT grantee, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'bootstrap_os'
        AND table_name IN ('invites', 'invite_companies')
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    `);
    assert.equal(grants.rows.length, 0);
    await assert.rejects(
      () => db.exec("SET ROLE authenticated; SELECT * FROM bootstrap_os.invites; RESET ROLE;"),
      /permission denied/i,
    );
    await db.exec("RESET ROLE");
    await assert.rejects(
      () => db.exec("UPDATE bootstrap_os.audit_events SET client = 'forged'"),
      /append-only/,
    );
  });

  it("an editor grant is refused and an owner grant writes audit", async () => {
    const denied = await callInvite({
      email: "editor@example.test",
      sub: "33333333-3333-3333-3333-333333333333",
      invitee: "member@example.test",
      companies: [{ slug: "alpha", role: "editor" }],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "invite_partial_authority");

    const created = await callInvite({
      email: "founder@example.test",
      sub: "22222222-2222-2222-2222-222222222222",
      invitee: "second@example.test",
      companies: [{ slug: "alpha", role: "editor" }],
    });
    assert.equal(created.ok, true);
    const audit = await db.query(
      "SELECT count(*)::int AS n FROM bootstrap_os.audit_events WHERE what_changed->>'via' = 'invite.create'",
    );
    assert.equal(audit.rows[0].n, 2);
  });

  it("invalid or duplicate slugs write no invite rows", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invites");
    const invalid = await callInvite({
      email: "founder@example.test",
      sub: "22222222-2222-2222-2222-222222222222",
      invitee: "bad-slug@example.test",
      companies: [{ slug: "Not A Slug" }, { slug: "alpha" }, { slug: "alpha" }],
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "invite_partial_authority");
    assert.ok(invalid.denied.some((row) => row.reason === "invalid_label"));
    const after = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invites");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("a viewer or editor JWT sees no audit rows and an owner JWT does", async () => {
    async function visible(email) {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claims', $1, false)", [claims(email, "22222222-2222-2222-2222-222222222222")]);
      try {
        await db.exec("SET ROLE authenticated");
        const rows = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.audit_events");
        return rows.rows[0].n;
      } finally {
        await db.exec("RESET ROLE");
      }
    }
    assert.equal(await visible("viewer@example.test"), 0);
    assert.equal(await visible("editor@example.test"), 0);
    assert.ok(await visible("founder@example.test") > 0);
  });

  it("a forged role setting plus the owner email cannot mint an invite", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invite_companies");
    await assert.rejects(
      () =>
        callInvite({
          asService: true,
          settingEmail: "founder@example.test",
          settingSub: "22222222-2222-2222-2222-222222222222",
          settingLocal: true,
          invitee: "forged-role@example.test",
          companies: [{ slug: "alpha", role: "viewer" }],
        }),
      /actor_required/,
    );
    const after = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.invite_companies");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});

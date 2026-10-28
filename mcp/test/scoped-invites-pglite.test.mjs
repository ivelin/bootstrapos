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
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'email', NULLIF(current_setting('app.actor_email', true), ''),
    'sub', NULLIF(current_setting('app.actor_sub', true), '')
  );
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.auth_uid', true), '')::uuid;
$$;
`;

let db;

describe("scoped invite RLS and card actor (PGlite, never prod)", () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    const journey = fs
      .readFileSync(path.join(migrations, "20260902_bootstrap_os_journey.sql"), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "-- PGlite: gen_random_uuid is built-in");
    await db.exec(journey);
    await db.exec(fs.readFileSync(path.join(migrations, "20261028_bootstrap_os_scoped_invites.sql"), "utf8"));
    await db.exec(`
      INSERT INTO bootstrap_os.companies (id, slug, label)
      VALUES ('11111111-1111-1111-1111-111111111111', 'alpha', 'alpha');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES ('11111111-1111-1111-1111-111111111111', 'founder@example.test', 'email', 'founder');
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage)
      VALUES ('11111111-1111-1111-1111-111111111111', 'default', 'alpha bet', 1, 1);
    `);
  });

  after(async () => {
    await db?.close();
  });

  it("a direct card UPDATE without an actor fails", async () => {
    await db.exec("SELECT set_config('app.actor_email', '', false)");
    await db.exec("SELECT set_config('app.actor_sub', '', false)");
    await assert.rejects(
      () => db.exec("UPDATE bootstrap_os.ideas SET name = 'changed' WHERE slug = 'default'"),
      /actor_required/,
    );
  });

  it("a card UPDATE with an actor writes one audit row", async () => {
    await db.query("SELECT set_config('app.actor_email', $1, false)", ["founder@example.test"]);
    await db.query("SELECT set_config('app.actor_sub', $1, false)", ["22222222-2222-2222-2222-222222222222"]);
    await db.exec("UPDATE bootstrap_os.ideas SET name = 'alpha bet card' WHERE slug = 'default'");
    const rows = await db.query(
      "SELECT what_changed->>'via' AS via FROM bootstrap_os.audit_events WHERE what_changed->>'via' = 'card.update'",
    );
    assert.equal(rows.rows.length, 1);
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
    await db.exec(`
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      VALUES ('11111111-1111-1111-1111-111111111111', 'editor@example.test', 'email', 'editor');
    `);
    await db.query("SELECT set_config('app.actor_email', $1, false)", ["editor@example.test"]);
    await db.query("SELECT set_config('app.actor_sub', $1, false)", ["33333333-3333-3333-3333-333333333333"]);
    const denied = await db.query(
      "SELECT public.bootstrap_os_invite_create($1, $2::jsonb) AS body",
      ["member@example.test", JSON.stringify([{ slug: "alpha", role: "editor" }])],
    );
    assert.equal(denied.rows[0].body.ok, false);
    assert.equal(denied.rows[0].body.reason, "invite_partial_authority");

    await db.query("SELECT set_config('app.actor_email', $1, false)", ["founder@example.test"]);
    const created = await db.query(
      "SELECT public.bootstrap_os_invite_create($1, $2::jsonb) AS body",
      ["member@example.test", JSON.stringify([{ slug: "alpha", role: "editor" }])],
    );
    assert.equal(created.rows[0].body.ok, true);
    const audit = await db.query(
      "SELECT count(*)::int AS n FROM bootstrap_os.audit_events WHERE what_changed->>'via' = 'invite.create'",
    );
    assert.equal(audit.rows[0].n, 1);
  });
});

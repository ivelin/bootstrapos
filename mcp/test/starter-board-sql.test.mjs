/**
 * Isolated PGlite for the starter bet board migration.
 * Never supabase-pirin-ai. Never prod. Fictional addresses only.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(__dirname, "..", "supabase", "migrations", "20261021_bootstrap_os_starter_board.sql");

const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS bootstrap_os;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'email', NULLIF(current_setting('app.actor_email', true), ''),
    'sub', NULLIF(current_setting('app.actor_sub', true), '')
  );
$$;
CREATE TABLE bootstrap_os.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL
);
CREATE TABLE bootstrap_os.company_acl (
  company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id),
  principal text NOT NULL,
  principal_kind text NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.bootstrap_mcp_mentees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE
);
CREATE TABLE public.bootstrap_company_labels (
  mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
  label text NOT NULL
);
CREATE TABLE public.bootstrap_mcp_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_label text NOT NULL,
  invitee_email text NOT NULL
);
`;

let db;

async function asEmail(email, sql, params = []) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  const rows = await db.query(sql, params);
  return rows.rows;
}

describe("PGlite starter bet board (isolated, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    const sql = fs
      .readFileSync(SQL, "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "-- PGlite: md5 and gen_random_uuid are built in");
    await db.exec(sql);
  });

  after(async () => {
    await db?.close();
  });

  it("one starter per account, no invites, no promotion", async () => {
    const file = fs.readFileSync(SQL, "utf8");
    assert.match(file, /ENABLE ROW LEVEL SECURITY/);
    assert.match(file, /FORCE ROW LEVEL SECURITY/);
    assert.match(file, /REVOKE ALL ON TABLE bootstrap_os\.starter_boards FROM PUBLIC, anon, authenticated/);
    assert.match(file, /founder_seed invite is the only path to a real company/);
    assert.doesNotMatch(file, /supabase\.co/);

    const first = (
      await asEmail("founder@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(first.ok, true);
    assert.equal(first.created, true);
    assert.equal(first.invites, false);
    assert.equal(first.promotable, false);
    assert.match(first.slug, /^sb[0-9a-f]{8}$/);

    const second = (
      await asEmail("founder@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(second.created, false);
    assert.equal(second.slug, first.slug);
    const rows = (await db.query("SELECT count(*)::int AS n FROM bootstrap_os.starter_boards")).rows[0].n;
    assert.equal(rows, 1);
    const ideas = await db.query(
      "SELECT to_regclass('bootstrap_os.ideas') AS ideas",
    );
    assert.equal(ideas.rows[0].ideas, null);

    const sandbox = (
      await asEmail("founder@example.test", "SELECT public.bootstrap_os_starter_is_sandbox($1) AS sandbox", [
        first.slug,
      ])
    )[0].sandbox;
    assert.equal(sandbox, true);
    const other = (
      await asEmail("stranger@example.test", "SELECT public.bootstrap_os_starter_is_sandbox('alpha') AS sandbox")
    )[0].sandbox;
    assert.equal(other, false);

    await assert.rejects(
      db.query("UPDATE bootstrap_os.starter_boards SET owner_email = owner_email"),
      /cannot be promoted/,
    );
    await assert.rejects(db.query("DELETE FROM bootstrap_os.starter_boards"), /cannot be promoted/);
    await assert.rejects(
      db.query(
        "INSERT INTO public.bootstrap_mcp_invites (company_label, invitee_email) VALUES ($1, 'member@example.test')",
        [first.slug],
      ),
      /cannot send invites/,
    );

    const taken = (
      await db.query("SELECT 'sb' || substr(md5('other@example.test'), 1, 8) AS slug")
    ).rows[0].slug;
    await db.query("INSERT INTO bootstrap_os.companies (slug, label) VALUES ($1, 'taken')", [taken]);
    const capped = (
      await asEmail("other@example.test", "SELECT public.bootstrap_os_create_starter_board() AS body")
    )[0].body;
    assert.equal(capped.ok, false);
    assert.equal(capped.error, "starter_cap");
  });
});

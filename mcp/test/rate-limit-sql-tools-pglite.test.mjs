import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const FOUNDER = "33333333-3333-3333-3333-333333333333";
const FILES = [
  "20260829_bootstrap_mcp_identity.sql",
  "20260902_bootstrap_os_journey.sql",
  "20260910_bootstrap_mcp_invite_accept.sql",
  "20260911_bootstrap_mcp_invite_verify_email_outbox.sql",
  "20260915_bootstrap_os_journey_rpcs.sql",
  "20260920_bootstrap_os_board_subscribers.sql",
  "20260921_bootstrap_os_list_provenance.sql",
  "20260928_bootstrap_os_roles.sql",
  "20261019_bootstrap_rate_limit.sql",
];

const HARNESS = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.auth_uid', true), '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'email', NULLIF(current_setting('app.actor_email', true), ''),
    'sub', NULLIF(current_setting('app.actor_sub', true), '')
  );
$$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(len integer)
RETURNS bytea LANGUAGE sql VOLATILE AS $$
  SELECT decode(substr(repeat(md5(random()::text || clock_timestamp()::text), (len / 16) + 2), 1, len * 2), 'hex');
$$;
CREATE OR REPLACE FUNCTION public.gen_random_bytes(len integer)
RETURNS bytea LANGUAGE sql VOLATILE AS $$
  SELECT extensions.gen_random_bytes(len);
$$;
CREATE OR REPLACE FUNCTION public.digest(data bytea, algo text)
RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT decode(md5(data), 'hex');
$$;
`;

let db;

async function asAuthenticated(sql, params = []) {
  await db.exec("SET ROLE authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("RESET ROLE");
  }
}

async function callTool(sql, params = []) {
  const rows = await asAuthenticated(sql, params);
  return rows.rows[0].body;
}

describe("replaced SQL tools as authenticated", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    for (const file of FILES) {
      const sql = fs
        .readFileSync(path.join(MIGRATIONS, file), "utf8")
        .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, "-- pgcrypto stubbed");
      await db.exec(sql);
    }
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${FOUNDER}', 'founder@example.test');
      UPDATE public.bootstrap_mcp_mentees
      SET auth_user_id = '${FOUNDER}'
      WHERE email = 'founder@example.test';
      UPDATE public.bootstrap_os_roles
      SET role = 'super_admin'
      WHERE mentee_id = (SELECT id FROM public.bootstrap_mcp_mentees WHERE email = 'founder@example.test')
        AND revoked_at IS NULL;
      INSERT INTO bootstrap_os.companies (slug, label) VALUES ('alpha', 'alpha');
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT id, 'founder@example.test', 'email', 'founder' FROM bootstrap_os.companies WHERE slug = 'alpha';
      CREATE OR REPLACE FUNCTION public.bootstrap_os_ensure_company(p_company text)
      RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
      DECLARE
        v_slug text := lower(p_company);
        cid uuid;
        email text := NULLIF(lower(auth.jwt() ->> 'email'), '');
      BEGIN
        IF NOT public.bootstrap_os_held_label(v_slug) THEN
          RAISE EXCEPTION 'company not visible';
        END IF;
        SELECT c.id INTO cid FROM bootstrap_os.companies c WHERE c.slug = v_slug;
        IF cid IS NULL THEN
          INSERT INTO bootstrap_os.companies (slug, label) VALUES (v_slug, v_slug) RETURNING id INTO cid;
        END IF;
        IF email IS NOT NULL THEN
          INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
          VALUES (cid, email, 'email', 'founder_authorized')
          ON CONFLICT (company_id, principal, principal_kind) DO NOTHING;
        END IF;
        RETURN cid;
      END;
      $$;
      GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_company(text, text, boolean, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_invite_member(text, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.bootstrap_os_create_idea(text, text, text, boolean, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.bootstrap_os_post_comment(text, text, text) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.bootstrap_os_list_provenance(text, text, timestamptz, timestamptz, timestamptz) TO authenticated;
    `);
    await db.query("SELECT set_config('app.auth_uid', $1, false)", [FOUNDER]);
    await db.query("SELECT set_config('app.actor_email', $1, false)", ["founder@example.test"]);
  });

  after(async () => {
    await db?.close();
  });

  it("refuses the 6th create_company and does not store the slug", async () => {
    for (let n = 1; n <= 5; n += 1) {
      const body = await callTool(
        "SELECT public.bootstrap_os_create_company($1, $1, true, 'new company') AS body",
        [`c${n}`],
      );
      assert.equal(body.ok, true, JSON.stringify(body));
      assert.equal(body.slug, `c${n}`);
    }
    const blocked = await callTool(
      "SELECT public.bootstrap_os_create_company('c6', 'c6', true, 'new company') AS body",
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "rate_limited");
    assert.match(blocked.message, /Try again after/);
    const count = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_os_companies WHERE slug = 'c6'");
    assert.equal(count.rows[0].n, 0);
  });

  it("refuses the 21st invite and adds no outbox row", async () => {
    for (let n = 1; n <= 20; n += 1) {
      const body = await callTool("SELECT public.bootstrap_mcp_invite_member($1, 'alpha') AS body", [
        `person${n}@example.test`,
      ]);
      assert.equal(body.ok, true, JSON.stringify(body).slice(0, 200));
    }
    const before = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_mcp_invite_outbox");
    const blocked = await callTool(
      "SELECT public.bootstrap_mcp_invite_member('person21@example.test', 'alpha') AS body",
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "rate_limited");
    assert.match(blocked.message, /Try again after/);
    const after = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_mcp_invite_outbox");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("refuses the 51st idea and does not store it", async () => {
    for (let n = 1; n <= 50; n += 1) {
      const slug = `bet${String(n).padStart(2, "0")}`;
      const body = await callTool(
        "SELECT public.bootstrap_os_create_idea('alpha', $1, $1, true, 'new 0-1 board') AS body",
        [slug],
      );
      assert.equal(body.ok, true, JSON.stringify(body).slice(0, 240));
    }
    const blocked = await callTool(
      "SELECT public.bootstrap_os_create_idea('alpha', 'bet51', 'bet51', true, 'new 0-1 board') AS body",
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "rate_limited");
    const count = await db.query(
      "SELECT count(*)::int AS n FROM bootstrap_os.ideas WHERE slug = 'bet51'",
    );
    assert.equal(count.rows[0].n, 0);
  });

  it("refuses a 4097-byte comment and a multibyte comment over 4096 bytes", async () => {
    const okAscii = "a".repeat(4096);
    const longAscii = "a".repeat(4097);
    const okMulti = "é".repeat(2048);
    const longMulti = "é".repeat(2049);
    assert.equal(Buffer.byteLength(okMulti, "utf8"), 4096);
    assert.ok(Buffer.byteLength(longMulti, "utf8") > 4096);
    assert.ok(longMulti.length <= 4096);

    const kept = await callTool(
      "SELECT public.bootstrap_os_post_comment('alpha', 'bet01', $1) AS body",
      [okAscii],
    );
    assert.equal(kept.ok, true, JSON.stringify(kept).slice(0, 200));
    const keptMulti = await callTool(
      "SELECT public.bootstrap_os_post_comment('alpha', 'bet01', $1) AS body",
      [okMulti],
    );
    assert.equal(keptMulti.ok, true, JSON.stringify(keptMulti).slice(0, 200));

    const before = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.comments");
    const ascii = await callTool(
      "SELECT public.bootstrap_os_post_comment('alpha', 'bet01', $1) AS body",
      [longAscii],
    );
    assert.equal(ascii.ok, false);
    assert.equal(ascii.error, "comment_too_long");
    const multi = await callTool(
      "SELECT public.bootstrap_os_post_comment('alpha', 'bet01', $1) AS body",
      [longMulti],
    );
    assert.equal(multi.ok, false);
    assert.equal(multi.error, "comment_too_long");
    const after = await db.query("SELECT count(*)::int AS n FROM bootstrap_os.comments");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("caps list_provenance at 100 rows and advances with p_before", async () => {
    const company = await db.query("SELECT id FROM bootstrap_os.companies WHERE slug = 'alpha'");
    const companyId = company.rows[0].id;
    for (let n = 0; n < 105; n += 1) {
      await db.query(
        `INSERT INTO bootstrap_os.audit_events (company_id, who, client, what_changed, at)
         VALUES ($1, 'founder@example.test', 'mcp', '{"op":"note"}'::jsonb, $2)`,
        [companyId, new Date(Date.UTC(2020, 0, 1, 0, n)).toISOString()],
      );
    }
    const page = await callTool(
      "SELECT public.bootstrap_os_list_provenance('alpha', NULL, NULL, NULL, NULL) AS body",
    );
    assert.equal(page.ok, true, JSON.stringify(page).slice(0, 200));
    assert.equal(page.events.length, 100);
    assert.equal(page.truncated, true);
    const oldest = page.events[0].at;
    const next = await callTool(
      "SELECT public.bootstrap_os_list_provenance('alpha', NULL, NULL, NULL, $1) AS body",
      [oldest],
    );
    assert.equal(next.ok, true);
    assert.ok(next.events.length > 0);
    assert.ok(next.events.length < 100);
    assert.equal(next.truncated, false);
    assert.ok(next.events.every((event) => event.at < oldest));
  });

  it("a thrown limiter returns a refusal and writes no company", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_os_companies");
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(p_action text)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'limiter down';
      END;
      $$;
    `);
    const body = await callTool(
      "SELECT public.bootstrap_os_create_company('c7', 'c7', true, 'new company') AS body",
    );
    assert.equal(body.ok, false);
    assert.equal(body.error, "rate_limiter_unavailable");
    assert.match(body.message, /could not be reached/);
    const after = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_os_companies");
    assert.equal(after.rows[0].n, before.rows[0].n);
    const slug = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_os_companies WHERE slug = 'c7'");
    assert.equal(slug.rows[0].n, 0);
  });

  it("a limiter body without ok is a refusal and writes no company", async () => {
    const before = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_os_companies");
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(p_action text)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    `);
    const body = await callTool(
      "SELECT public.bootstrap_os_create_company('c8', 'c8', true, 'new company') AS body",
    );
    assert.equal(body.ok, false);
    assert.equal(body.error, "rate_limiter_unavailable");
    assert.match(body.message, /could not be reached/);
    const after = await db.query("SELECT count(*)::int AS n FROM public.bootstrap_os_companies");
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});

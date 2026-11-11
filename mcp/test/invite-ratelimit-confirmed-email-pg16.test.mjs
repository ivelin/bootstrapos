/**
 * PostgreSQL 16: confirmed email for held_label grants + create/invite rate takes.
 * Never supabase-pirin-ai. Never prod. Fictional alpha / founder@example.test only.
 */
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = "/usr/lib/postgresql/16/bin";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const UP = path.join(MIGRATIONS, "20261113_bootstrap_os_invite_ratelimit_confirmed_email.sql");

const FOUNDATION = [
  "20260829_bootstrap_mcp_identity.sql",
  "20260902_bootstrap_os_journey.sql",
  "20260910_bootstrap_mcp_invite_accept.sql",
  "20260911_bootstrap_mcp_invite_verify_email_outbox.sql",
  "20260915_bootstrap_os_journey_rpcs.sql",
  "20260920_bootstrap_os_board_subscribers.sql",
  "20260921_bootstrap_os_list_provenance.sql",
  "20260928_bootstrap_os_roles.sql",
  "20261015_bootstrap_mcp_accept_on_verified_signin.sql",
  "20261019_bootstrap_rate_limit.sql",
  "20261021_bootstrap_os_company_founder.sql",
  "20261021_bootstrap_os_starter_board.sql",
  "20261028_create_company_self_serve.sql",
  "20261029_bootstrap_os_scoped_invites.sql",
  "20261031_bootstrap_os_starter_ensure_company.sql",
  "20261108_bootstrap_mcp_membership_labels.sql",
  "20261110_bootstrap_os_ensure_company_founder_email.sql",
  "20261111_bootstrap_os_hosted_write_role_enforcement.sql",
];

let dataDir;
let psqlBin;
let pgCtl;
let port;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const assigned = server.address().port;
      server.close(() => resolve(String(assigned)));
    });
  });
}

function psqlFile(file) {
  return execFileSync(
    psqlBin,
    ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", file],
    { encoding: "utf8" },
  );
}

function psql(sql) {
  const file = path.join(dataDir, `stmt-${process.hrtime.bigint()}.sql`);
  fs.writeFileSync(file, sql);
  return psqlFile(file).trim();
}

function upsertUserSql({ uid, email, confirmed }) {
  const confirmedSql = confirmed === null ? "NULL" : `'${confirmed}'::timestamptz`;
  return `
    INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES ('${uid}'::uuid, '${email}', ${confirmedSql})
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          email_confirmed_at = EXCLUDED.email_confirmed_at;
    SELECT set_config('request.jwt.claims', '{"sub":"${uid}","email":"${email}","role":"authenticated"}', false);
    SELECT set_config('request.jwt.claim.sub', '${uid}', false);
    SELECT set_config('request.jwt.claim.email', '${email}', false);
  `;
}

function lastLine(out) {
  const lines = out.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/** JWT claims only (superuser). For SECURITY DEFINER helpers with no EXECUTE grant. */
function withClaims(sql, actor) {
  return lastLine(psql(`
    RESET ROLE;
    ${upsertUserSql(actor)}
    ${sql}
  `));
}

/** JWT claims + SET ROLE authenticated. For RPCs granted to authenticated. */
function asAuthed(sql, actor) {
  return lastLine(psql(`
    RESET ROLE;
    ${upsertUserSql(actor)}
    SET ROLE authenticated;
    ${sql}
  `));
}

describe("PostgreSQL 16 invite ratelimit + confirmed email", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-confirm-rate-"));
    execFileSync(
      path.join(BIN, "initdb"),
      ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"],
      { stdio: "ignore" },
    );
    pgCtl = path.join(BIN, "pg_ctl");
    psqlBin = path.join(BIN, "psql");
    execFileSync(
      pgCtl,
      [
        "-D",
        dataDir,
        "-w",
        "-t",
        "30",
        "-l",
        path.join(dataDir, "server.log"),
        "-o",
        `-p ${port} -k ${dataDir} -c listen_addresses=`,
        "start",
      ],
      { stdio: "ignore" },
    );

    psql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        email_confirmed_at timestamptz
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(len integer)
      RETURNS bytea LANGUAGE sql VOLATILE AS $$
        SELECT decode(substr(repeat(md5(random()::text || clock_timestamp()::text), (len / 16) + 2), 1, len * 2), 'hex');
      $$;
    `);

    for (const file of FOUNDATION) {
      const sql = fs
        .readFileSync(path.join(MIGRATIONS, file), "utf8")
        .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, "-- pgcrypto already loaded");
      const tmp = path.join(dataDir, `mig-${file}`);
      fs.writeFileSync(tmp, sql);
      psqlFile(tmp);
    }
    psqlFile(UP);

    psql(`
      RESET ROLE;
      INSERT INTO public.bootstrap_mcp_mentees (email)
      VALUES ('founder@example.test')
      ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees WHERE email = 'founder@example.test'
      ON CONFLICT DO NOTHING;
      UPDATE public.bootstrap_os_roles
      SET role = 'super_admin', revoked_at = NULL
      WHERE mentee_id = (SELECT id FROM public.bootstrap_mcp_mentees WHERE email = 'founder@example.test')
        AND revoked_at IS NULL;
      INSERT INTO public.bootstrap_os_roles (mentee_id, role)
      SELECT m.id, 'super_admin'
      FROM public.bootstrap_mcp_mentees AS m
      WHERE m.email = 'founder@example.test'
        AND NOT EXISTS (
          SELECT 1 FROM public.bootstrap_os_roles AS r
          WHERE r.mentee_id = m.id AND r.revoked_at IS NULL
        );
      INSERT INTO bootstrap_os.companies (slug, label) VALUES ('alpha', 'alpha')
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
      SELECT c.id, 'founder@example.test', 'email', 'founder'
      FROM bootstrap_os.companies AS c WHERE c.slug = 'alpha'
      ON CONFLICT DO NOTHING;
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      SELECT c.id, 'default', 'alpha', 1, 1, 'hold',
        '{"schema_version":1,"readyForHumanEyes":{"status":"unknown"},"autonomyPosture":"strict","openQuestions":[],"constraint_this_week":""}'::jsonb
      FROM bootstrap_os.companies AS c WHERE c.slug = 'alpha'
        AND NOT EXISTS (
          SELECT 1 FROM bootstrap_os.ideas AS i WHERE i.company_id = c.id AND i.slug = 'default'
        );
    `);
  });

  after(() => {
    if (pgCtl && dataDir) {
      try {
        execFileSync(pgCtl, ["-D", dataDir, "-w", "-t", "30", "-m", "immediate", "stop"], {
          stdio: "ignore",
        });
      } catch {
        /* already stopped */
      }
    }
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("unconfirmed caller is denied held_label and my_labels grants nothing", () => {
    const actor = {
      uid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      email: "unconfirmed@example.test",
      confirmed: null,
    };
    psql(`
      RESET ROLE;
      INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
      VALUES ('unconfirmed@example.test', '${actor.uid}'::uuid)
      ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees WHERE email = 'unconfirmed@example.test'
      ON CONFLICT DO NOTHING;
    `);
    const held = withClaims(
      "SELECT CASE WHEN public.bootstrap_os_held_label('alpha') THEN 'yes' ELSE 'no' END;",
      actor,
    );
    assert.equal(held, "no");
    const labels = JSON.parse(asAuthed("SELECT public.bootstrap_mcp_my_labels()::text;", actor));
    assert.equal(labels.ok, false);
    assert.equal(labels.error, "email_unconfirmed");
    assert.deepEqual(labels.labels, []);
    const accept = JSON.parse(
      asAuthed("SELECT public.bootstrap_mcp_accept_invite('inv_too_short_token_xx')::text;", actor),
    );
    assert.equal(accept.ok, false);
    assert.equal(accept.error, "email_unconfirmed");
  });

  it("confirmed caller is granted held_label and my_labels returns the label", () => {
    const actor = {
      uid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      email: "confirmed@example.test",
      confirmed: "2026-01-01T00:00:00Z",
    };
    psql(`
      RESET ROLE;
      INSERT INTO public.bootstrap_mcp_mentees (email)
      VALUES ('confirmed@example.test')
      ON CONFLICT (email) DO NOTHING;
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, 'alpha' FROM public.bootstrap_mcp_mentees WHERE email = 'confirmed@example.test'
      ON CONFLICT DO NOTHING;
    `);
    const held = withClaims(
      "SELECT CASE WHEN public.bootstrap_os_held_label('alpha') THEN 'yes' ELSE 'no' END;",
      actor,
    );
    assert.equal(held, "yes");
    const labels = JSON.parse(asAuthed("SELECT public.bootstrap_mcp_my_labels()::text;", actor));
    assert.equal(labels.authenticated, true);
    assert.ok(Array.isArray(labels.labels) && labels.labels.includes("alpha"));
  });

  it("over-limit invite is denied with rate_limited and writes nothing", () => {
    const actor = {
      uid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      email: "founder@example.test",
      confirmed: "2026-01-01T00:00:00Z",
    };
    psql(`
      RESET ROLE;
      UPDATE public.bootstrap_mcp_mentees SET auth_user_id = '${actor.uid}'::uuid
      WHERE email = 'founder@example.test';
      UPDATE public.bootstrap_rate_cap SET max_per_window = 2 WHERE action = 'invite_member';
      DELETE FROM public.bootstrap_rate_window WHERE action = 'invite_member';
    `);
    for (let n = 1; n <= 2; n += 1) {
      const body = JSON.parse(
        asAuthed(
          `SELECT public.bootstrap_mcp_invite_member('person${n}@example.test', 'alpha')::text;`,
          actor,
        ),
      );
      assert.equal(body.ok, true, JSON.stringify(body).slice(0, 200));
    }
    const before = psql("SELECT count(*)::text FROM public.bootstrap_mcp_invite_outbox;");
    const blocked = JSON.parse(
      asAuthed(
        "SELECT public.bootstrap_mcp_invite_member('person3@example.test', 'alpha')::text;",
        actor,
      ),
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "rate_limited");
    const after = psql("SELECT count(*)::text FROM public.bootstrap_mcp_invite_outbox;");
    assert.equal(after, before);
    psql(`
      RESET ROLE;
      UPDATE public.bootstrap_rate_cap SET max_per_window = 20 WHERE action = 'invite_member';
      DELETE FROM public.bootstrap_rate_window WHERE action = 'invite_member';
    `);
  });

  it("limiter failure fails closed on invite_member", () => {
    const actor = {
      uid: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      email: "founder@example.test",
      confirmed: "2026-01-01T00:00:00Z",
    };
    psql(`
      RESET ROLE;
      UPDATE public.bootstrap_mcp_mentees SET auth_user_id = '${actor.uid}'::uuid
      WHERE email = 'founder@example.test';
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(p_action text)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'boom';
      END;
      $$;
    `);
    const blocked = JSON.parse(
      asAuthed(
        "SELECT public.bootstrap_mcp_invite_member('failclosed@example.test', 'alpha')::text;",
        actor,
      ),
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "rate_limiter_unavailable");
    psql(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(p_action text)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $$
      DECLARE
        v_actor text;
        v_cap_max int;
        v_cap_window int;
      BEGIN
        v_actor := nullif(btrim(auth.uid()::text), '');
        IF v_actor IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
        END IF;
        SELECT cap.max_per_window, cap.window_seconds INTO v_cap_max, v_cap_window
        FROM public.bootstrap_rate_cap AS cap WHERE cap.action = p_action;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('ok', false, 'error', 'rate_limiter_unavailable', 'reason', 'rate_limiter_unavailable', 'message', 'The limiter could not be reached. This action was refused.');
        END IF;
        RETURN public.bootstrap_rate_take(v_actor, p_action, v_cap_max, v_cap_window);
      END;
      $$;
      REVOKE ALL ON FUNCTION public.bootstrap_hosted_take(text) FROM PUBLIC, anon, authenticated;
    `);
  });

  it("board creation over limit is denied with rate_limited jsonb", () => {
    const actor = {
      uid: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      email: "founder@example.test",
      confirmed: "2026-01-01T00:00:00Z",
    };
    psql(`
      RESET ROLE;
      UPDATE public.bootstrap_mcp_mentees SET auth_user_id = '${actor.uid}'::uuid
      WHERE email = 'founder@example.test';
      UPDATE public.bootstrap_rate_cap SET max_per_window = 1 WHERE action = 'create_company';
      DELETE FROM public.bootstrap_rate_window WHERE action = 'create_company';
    `);
    const first = withClaims(
      `SELECT (bootstrap_os.ensure_company_for_actor('boardone', 'founder@example.test', true)).created::text;`,
      actor,
    );
    assert.equal(first, "true");
    const second = withClaims(
      `
      DO $$
      DECLARE
        msg text;
      BEGIN
        BEGIN
          PERFORM bootstrap_os.ensure_company_for_actor('boardtwo', 'founder@example.test', true);
          RAISE EXCEPTION 'expected_rate_limit';
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
          msg := SQLERRM;
          PERFORM set_config('app.test_board_rate', msg, false);
        END;
      END $$;
      SELECT current_setting('app.test_board_rate', true);
      `,
      actor,
    );
    assert.equal(second, "rate_limited");
    const count = psql("SELECT count(*)::text FROM bootstrap_os.companies WHERE slug = 'boardtwo';");
    assert.equal(count, "0");
    // put_journey catches the same raise and returns jsonb (no 5xx).
    const mapped = withClaims(
      `
      CREATE OR REPLACE FUNCTION bootstrap_os.read_portfolio_score(p_score jsonb)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
      DROP FUNCTION IF EXISTS bootstrap_os.notify_bundle(uuid, uuid, text);
      CREATE FUNCTION bootstrap_os.notify_bundle(p_company_id uuid, p_idea_id uuid, p_op text)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      SELECT public.bootstrap_os_put_journey(
        'boardthree', 'default', 'open another board', true,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'founder@example.test'
      )::text;
      `,
      actor,
    );
    const body = JSON.parse(mapped);
    assert.equal(body.ok, false);
    assert.equal(body.error, "rate_limited");
    psql(`
      RESET ROLE;
      UPDATE public.bootstrap_rate_cap SET max_per_window = 5 WHERE action = 'create_company';
      DELETE FROM public.bootstrap_rate_window WHERE action = 'create_company';
    `);
  });
});

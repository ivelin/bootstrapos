/**
 * Two PostgreSQL 16 sessions call put_journey on a new slug.
 * Never supabase-pirin-ai. Fictional @example.invalid only.
 * Skips only when PostgreSQL 16 is absent and CI is not set.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(__dirname, "..", "supabase", "migrations");
const BIN = "/usr/lib/postgresql/16/bin";
const hasPg = fs.existsSync(path.join(BIN, "initdb"));
if (process.env.CI === "true" && !hasPg) {
  throw new Error("PostgreSQL 16 initdb is required when CI=true");
}

let dataDir;
let port;
let psqlBin;

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

function psqlSync(args, input) {
  return spawnSync(psqlBin, ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input,
  });
}

function psqlAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn(psqlBin, ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("put_journey first-create race (PostgreSQL 16)", { skip: hasPg ? false : "PostgreSQL 16 is not installed", concurrency: false }, () => {
  before(async () => {
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-write-race-"));
    spawnSync(path.join(BIN, "initdb"), ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"], {
      stdio: "ignore",
    });
    psqlBin = path.join(BIN, "psql");
    const started = spawnSync(
      path.join(BIN, "pg_ctl"),
      ["-D", dataDir, "-w", "-t", "30", "-l", path.join(dataDir, "server.log"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`, "start"],
      { encoding: "utf8" },
    );
    if (started.status !== 0) throw new Error(started.stderr || "pg_ctl start failed");
    const harness = psqlSync(["-c", `
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS bootstrap_os;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object('email', NULLIF(current_setting('app.actor_email', true), ''), 'sub', NULL);
      $$;
      DO $$ BEGIN
        CREATE TYPE bootstrap_os.gate_decision AS ENUM ('advance', 'iterate', 'hold', 'kill');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE bootstrap_os.companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, label text NOT NULL, founder text
      );
      CREATE TABLE bootstrap_os.company_acl (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id),
        principal text NOT NULL, principal_kind text NOT NULL, role text NOT NULL,
        UNIQUE (company_id, principal, principal_kind)
      );
      CREATE TABLE bootstrap_os.ideas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id),
        slug text NOT NULL, name text NOT NULL,
        journey_phase smallint NOT NULL, loop_stage smallint NOT NULL,
        current_gate bootstrap_os.gate_decision NOT NULL DEFAULT 'hold',
        scoreboard jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, slug)
      );
      CREATE TABLE bootstrap_os.comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, body text, who text, at timestamptz DEFAULT now()
      );
      CREATE TABLE bootstrap_os.gate_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idea_id uuid, action text, why text, who text, at timestamptz DEFAULT now()
      );
      CREATE TABLE bootstrap_os.audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, idea_id uuid, at timestamptz DEFAULT now(),
        who text, client text, what_changed jsonb
      );
      CREATE TABLE bootstrap_os.board_subscribers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, idea_id uuid,
        principal text, principal_kind text, webhook_url text, email_opt_in boolean, created_by text
      );
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, auth_user_id uuid
      );
      CREATE TABLE public.bootstrap_company_labels (
        mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id), label text NOT NULL, UNIQUE (mentee_id, label)
      );
      CREATE TABLE public.bootstrap_os_roles (mentee_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE TABLE public.bootstrap_request_cap (name text PRIMARY KEY, max_value int NOT NULL);
      INSERT INTO public.bootstrap_request_cap VALUES ('comment_body_bytes', 4096);
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
      CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.bootstrap_mcp_mentees m
          JOIN public.bootstrap_company_labels l ON l.mentee_id = m.id
          WHERE l.label = lower(p_company) AND m.email = NULLIF(lower(auth.jwt() ->> 'email'), '')
        );
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_email() RETURNS text LANGUAGE sql AS $$
        SELECT NULLIF(lower(auth.jwt() ->> 'email'), '');
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_sub() RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.rank_of(p_role text) RETURNS int LANGUAGE sql AS $$
        SELECT CASE p_role
          WHEN 'founder' THEN 4 WHEN 'owner' THEN 4
          WHEN 'founder_authorized' THEN 3 WHEN 'editor' THEN 3
          WHEN 'advisor' THEN 2 WHEN 'mentor' THEN 2 WHEN 'commenter' THEN 2
          WHEN 'viewer' THEN 1 ELSE 0 END;
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_principal() RETURNS text LANGUAGE sql AS $$ SELECT 'race' $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.notify_bundle(uuid, uuid, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.idea_board_snapshot(smallint, smallint, bootstrap_os.gate_decision, jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.portfolio_view(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.read_portfolio_score(jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.normalize_gate_enrichment(jsonb) RETURNS jsonb LANGUAGE sql AS $$
        SELECT '{"whatChanged":"seed","whatWereNotDoing":"scope"}'::jsonb;
      $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.normalize_kill_postmortem(jsonb, text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_hosted_take(text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"ok":true}'::jsonb $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.require_actor() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_email() RETURNS text LANGUAGE sql AS $$ SELECT bootstrap_os.actor_email() $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.resolved_actor_sub() RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
      CREATE FUNCTION public.bootstrap_os_ensure_company(text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION public.bootstrap_os_put_journey(text, text, text, boolean, int, int, text, text, text, jsonb, text)
        RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    `]);
    if (harness.status !== 0) throw new Error(harness.stderr);
    const base = psqlSync(["-f", path.join(migrations, "20261110_bootstrap_os_ensure_company_founder_email.sql")]);
    if (base.status !== 0) throw new Error(base.stderr);
    const up = psqlSync(["-f", path.join(migrations, "20261111_bootstrap_os_hosted_write_role_enforcement.sql")]);
    if (up.status !== 0) throw new Error(up.stderr);
  });

  after(() => {
    if (dataDir) {
      spawnSync(path.join(BIN, "pg_ctl"), ["-D", dataDir, "-w", "-t", "30", "-m", "immediate", "stop"], { stdio: "ignore" });
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("lets only the inserting session write the first clocks", async () => {
    const statement = `
      SELECT public.bootstrap_os_put_journey(
        'raceco', 'default', 'seed clocks', true, 2, NULL, NULL, 'week', NULL, NULL, NULL, 'founder@example.invalid'
      )::text
      FROM (SELECT set_config('app.actor_email', 'admin@example.invalid', true)) cfg;
    `;
    const [left, right] = await Promise.all([psqlAsync(statement), psqlAsync(statement)]);
    assert.equal(left.code, 0, left.stderr);
    assert.equal(right.code, 0, right.stderr);
    const bodies = [left.stdout, right.stdout].map((text) => JSON.parse(text.trim()));
    assert.equal(bodies.filter((row) => row.ok === true).length, 1);
    assert.equal(bodies.filter((row) => row.error === "forbidden_role").length, 1);
    const phase = psqlSync(["-t", "-A", "-c", `
      SELECT i.journey_phase::text
      FROM bootstrap_os.ideas i
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'raceco' AND i.slug = 'default'
    `]);
    assert.equal(phase.stdout.trim(), "2");
    const gates = psqlSync(["-t", "-A", "-c", `
      SELECT count(*) FROM bootstrap_os.gate_events e
      JOIN bootstrap_os.ideas i ON i.id = e.idea_id
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'raceco'
    `]);
    assert.equal(gates.stdout.trim(), "1");
  });
});

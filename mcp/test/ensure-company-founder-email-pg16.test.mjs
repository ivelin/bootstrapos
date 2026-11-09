/**
 * PostgreSQL 16 round trip for 20261110. Never supabase-pirin-ai. Never prod.
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
const UP = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261110_bootstrap_os_ensure_company_founder_email.sql",
);
const DOWN = path.join(
  __dirname,
  "..",
  "supabase",
  "rollbacks",
  "20261110_bootstrap_os_ensure_company_founder_email.sql",
);

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
  return psqlFile(file);
}

describe("PostgreSQL 16 ensure_company founderEmail round trip", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-founder-email-"));
    execFileSync(
      path.join(BIN, "initdb"),
      ["-D", dataDir, "--auth=trust", "--username", process.env.USER || "postgres", "--no-instructions"],
      { stdio: "ignore" },
    );
    pgCtl = path.join(BIN, "pg_ctl");
    psqlBin = path.join(BIN, "psql");
    execFileSync(
      pgCtl,
      ["-D", dataDir, "-w", "-t", "30", "-l", path.join(dataDir, "server.log"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=`, "start"],
      { stdio: "ignore" },
    );
  });

  after(() => {
    if (pgCtl && dataDir) {
      try {
        execFileSync(pgCtl, ["-D", dataDir, "-w", "-t", "30", "-m", "immediate", "stop"], { stdio: "ignore" });
      } catch {
        /* cluster already stopped */
      }
    }
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("applies the migration, rolls it back, and applies it again", () => {
    psql(`
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
        CONSTRAINT company_acl_unique UNIQUE (company_id, principal, principal_kind)
      );
      CREATE TABLE bootstrap_os.ideas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES bootstrap_os.companies (id),
        slug text NOT NULL, name text NOT NULL,
        journey_phase smallint NOT NULL, loop_stage smallint NOT NULL,
        current_gate bootstrap_os.gate_decision NOT NULL DEFAULT 'hold',
        scoreboard jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, auth_user_id uuid
      );
      CREATE TABLE public.bootstrap_company_labels (
        mentee_id uuid NOT NULL REFERENCES public.bootstrap_mcp_mentees (id),
        label text NOT NULL,
        UNIQUE (mentee_id, label)
      );
      CREATE TABLE public.bootstrap_os_roles (
        mentee_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz
      );
      CREATE TABLE bootstrap_os.audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, idea_id uuid,
        who text, client text, what_changed jsonb
      );
      CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE OR REPLACE FUNCTION public.bootstrap_os_starter_is_sandbox(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.has_role(uuid, VARIADIC text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.actor_principal() RETURNS text LANGUAGE sql AS $$ SELECT 'roundtrip' $$;
      CREATE OR REPLACE FUNCTION bootstrap_os.emit_audit(uuid, uuid, text, text, jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      CREATE FUNCTION public.bootstrap_os_ensure_company(text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION public.bootstrap_os_put_journey(
        text, text, text, boolean, int, int, text, text, text, jsonb, text
      ) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    `);
    psqlFile(UP);
    const upSig = psql(
      "SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'bootstrap_os_ensure_company';",
    ).trim();
    assert.equal(upSig, "bootstrap_os_ensure_company(text,text)");
    psql("SELECT set_config('app.actor_email', 'solo@example.invalid', false); SELECT public.bootstrap_os_ensure_company('roundco');");
    psqlFile(DOWN);
    const downSig = psql(
      "SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'bootstrap_os_ensure_company';",
    ).trim();
    assert.equal(downSig, "bootstrap_os_ensure_company(text)");
    const helper = psql(
      "SELECT count(*) FROM pg_proc WHERE proname = 'bootstrap_os_grant_acl_internal';",
    ).trim();
    assert.equal(helper, "0");
    psqlFile(UP);
    const again = psql(
      "SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'bootstrap_os_ensure_company';",
    ).trim();
    assert.equal(again, "bootstrap_os_ensure_company(text,text)");
  });
});

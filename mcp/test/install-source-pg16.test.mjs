/**
 * PostgreSQL 16. Install source freeze, allowlist, and search_path. Never prod.
 */
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(__dirname, "..", "supabase", "migrations", "20261031_bootstrap_mcp_install_source.sql");
const BIN = "/usr/lib/postgresql/16/bin";
const ALICE = "11111111-1111-4111-8111-111111111111";

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

function psql(sql) {
  const file = path.join(dataDir, `stmt-${process.hrtime.bigint()}.sql`);
  fs.writeFileSync(file, sql);
  return execFileSync(
    psqlBin,
    ["-h", dataDir, "-p", port, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", file],
    { encoding: "utf8" },
  );
}

describe("PostgreSQL 16 install source", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-install-source-pg16-"));
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
      CREATE SCHEMA IF NOT EXISTS auth;
      DO $$ BEGIN CREATE ROLE authenticated NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE anon NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        email_confirmed_at timestamptz
      );
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt()
      RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT '{}'::jsonb
      $$;
      CREATE TABLE public.bootstrap_mcp_mentees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        auth_user_id uuid UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.bootstrap_mcp_mentees ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bootstrap_mcp_mentees FORCE ROW LEVEL SECURITY;
      CREATE POLICY mentees_select_own ON public.bootstrap_mcp_mentees
        FOR SELECT TO authenticated
        USING (auth.uid() IS NOT NULL AND auth.uid() = auth_user_id);
      CREATE TABLE public.bootstrap_os_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mentee_id uuid NOT NULL,
        role text NOT NULL,
        revoked_at timestamptz
      );
      CREATE TABLE public.bootstrap_os_admin_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        op text NOT NULL CHECK (op IN ('create_company', 'grant_super_admin', 'revoke_super_admin')),
        actor_mentee_id uuid,
        actor_email text NOT NULL,
        target_email text,
        slug text,
        why text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.bootstrap_os_admin_audit ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.bootstrap_os_admin_audit FORCE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.bootstrap_os_admin_audit FROM PUBLIC, anon, authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      CREATE OR REPLACE FUNCTION public.bootstrap_mcp_my_labels()
      RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE
        uid uuid := auth.uid();
        found uuid;
      BEGIN
        SELECT id INTO found FROM public.bootstrap_mcp_mentees WHERE auth_user_id = uid;
        IF found IS NULL THEN
          RETURN jsonb_build_object('authenticated', false, 'reason', 'not_invited', 'labels', '[]'::jsonb);
        END IF;
        RETURN jsonb_build_object('authenticated', true, 'labels', '[]'::jsonb);
      END;
      $$;
    `);
    psql(fs.readFileSync(SQL, "utf8"));
    psql(`
      INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES ('${ALICE}', 'alice@example.test', now());
      INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
      VALUES ('alice@example.test', '${ALICE}');
      GRANT SELECT, UPDATE ON TABLE public.bootstrap_mcp_mentees TO service_role;
      GRANT EXECUTE ON FUNCTION public.bootstrap_mcp_mentees_source_once() TO service_role;
    `);
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

  it("freezes a direct source update from the owner and from service_role", () => {
    psql(`
      SELECT set_config('request.jwt.claim.sub', '${ALICE}', false);
      SET ROLE authenticated;
      SELECT public.bootstrap_mcp_record_install_source('plugin');
      RESET ROLE;
    `);
    psql(`UPDATE public.bootstrap_mcp_mentees SET source = 'manual' WHERE email = 'alice@example.test';`);
    const owner = psql(`SELECT source FROM public.bootstrap_mcp_mentees WHERE email = 'alice@example.test';`).trim();
    assert.equal(owner, "plugin");
    psql(`
      SET ROLE service_role;
      UPDATE public.bootstrap_mcp_mentees SET source = 'grokbot' WHERE email = 'alice@example.test';
      RESET ROLE;
    `);
    const asService = psql(`SELECT source FROM public.bootstrap_mcp_mentees WHERE email = 'alice@example.test';`).trim();
    assert.equal(asService, "plugin");
  });

  it("rejects cursor and leaves an uninvited caller off my_labels", () => {
    const carol = "33333333-3333-4333-8333-333333333333";
    const frank = "66666666-6666-4666-8666-666666666666";
    psql(`
      INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
        ('${carol}', 'carol@example.test', now()),
        ('${frank}', 'frank@example.test', now());
      INSERT INTO public.bootstrap_mcp_mentees (email, auth_user_id)
      VALUES ('carol@example.test', '${carol}');
    `);
    const rejected = psql(`
      SELECT set_config('request.jwt.claim.sub', '${carol}', false);
      SET ROLE authenticated;
      SELECT public.bootstrap_mcp_record_install_source('cursor')::text;
    `);
    const body = JSON.parse(rejected.trim().split("\n").filter(Boolean).at(-1));
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_install_source");
    psql(`RESET ROLE;`);
    const stored = psql(`SELECT coalesce(source, 'null') FROM public.bootstrap_mcp_mentees WHERE email = 'carol@example.test';`).trim();
    assert.equal(stored, "null");

    const labels = psql(`
      SELECT set_config('request.jwt.claim.sub', '${frank}', false);
      SET ROLE authenticated;
      SELECT public.bootstrap_mcp_record_install_source('plugin')::text;
      SELECT public.bootstrap_mcp_my_labels()::text;
    `);
    const lines = labels
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"));
    const recorded = JSON.parse(lines[0]);
    const mine = JSON.parse(lines[1]);
    assert.equal(recorded.ok, false);
    assert.equal(recorded.status, 403);
    assert.equal(mine.reason, "not_invited");
    psql(`RESET ROLE;`);
    const count = psql(`SELECT count(*) FROM public.bootstrap_mcp_mentees WHERE email = 'frank@example.test';`).trim();
    assert.equal(count, "0");
  });

  it("pins search_path on both security definer functions", () => {
    const raw = psql(`
      SELECT p.proname || '=' || coalesce(array_to_string(p.proconfig, ','), 'missing')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND p.proname IN (
          'bootstrap_mcp_record_install_source',
          'bootstrap_mcp_read_install_source'
        )
      ORDER BY p.proname;
    `);
    const lines = raw.trim().split("\n").filter(Boolean);
    assert.deepEqual(lines, [
      "bootstrap_mcp_read_install_source=search_path=pg_catalog",
      "bootstrap_mcp_record_install_source=search_path=pg_catalog",
    ]);
  });
});

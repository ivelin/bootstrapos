/**
 * PostgreSQL 16. User JWT cannot write server scoreboard keys.
 * Never prod.
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
const MIGRATIONS = path.join(__dirname, "..", "supabase", "migrations");
const BIN = "/usr/lib/postgresql/16/bin";

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

function psql(sql, { stop = true } = {}) {
  const file = path.join(dataDir, `stmt-${process.hrtime.bigint()}.sql`);
  fs.writeFileSync(file, sql);
  const args = ["-h", dataDir, "-p", port, "-d", "postgres", "-t", "-A"];
  if (stop) args.push("-v", "ON_ERROR_STOP=1");
  args.push("-f", file);
  return execFileSync(psqlBin, args, { encoding: "utf8" });
}

function freeze(at) {
  psql(`
    CREATE OR REPLACE FUNCTION bootstrap_os.shape_up_now()
    RETURNS timestamptz
    LANGUAGE sql
    STABLE
    SET search_path = pg_catalog
    AS $$ SELECT timestamptz '${at}' $$;
  `);
}

function callCheck(slug, email = "founder@example.test") {
  const sub = email === "founder@example.test" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222";
  return psql(`
    BEGIN;
    SELECT set_config('request.jwt.claim.email', '${email}', true);
    SELECT set_config('request.jwt.claim.sub', '${sub}', true);
    SET LOCAL ROLE authenticated;
    SELECT public.bootstrap_os_check_breakers('${slug}');
    COMMIT;
  `);
}

function seedPirinIdea(slug, scoreboard) {
  psql(`
    INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
    SELECT id, '${slug}', '${slug}', 1, 1, 'hold', $board$${scoreboard}$board$::jsonb
    FROM bootstrap_os.companies WHERE slug = 'pirin';
  `);
}

function ideaAuditCount(slug) {
  return psql(`
    SELECT count(*)
    FROM bootstrap_os.audit_events e
    JOIN bootstrap_os.ideas i ON i.id = e.idea_id
    JOIN bootstrap_os.companies c ON c.id = i.company_id
    WHERE c.slug = 'pirin' AND i.slug = '${slug}';
  `).trim();
}

function callPut(company, scoreboardSql) {
  return psql(`
    BEGIN;
    SELECT set_config('request.jwt.claim.email', 'founder@example.test', true);
    SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
    SET LOCAL ROLE authenticated;
    SELECT public.bootstrap_os_put_journey(
      '${company}', 'default', 'board write', true,
      NULL, NULL, NULL, NULL, NULL,
      ${scoreboardSql}::jsonb,
      NULL
    );
    COMMIT;
  `);
}

describe("PostgreSQL 16 shape-up put", { concurrency: false }, () => {
  before(async () => {
    assert.ok(fs.existsSync(path.join(BIN, "initdb")), "PostgreSQL 16 initdb is required");
    port = await freePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bos-shape-pg16-"));
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
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt()
      RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object(
          'email', NULLIF(current_setting('request.jwt.claim.email', true), ''),
          'sub', NULLIF(current_setting('request.jwt.claim.sub', true), '')
        )
      $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    `);
    const files = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
    for (const name of files) {
      psql(fs.readFileSync(path.join(MIGRATIONS, name), "utf8"));
    }
    psql(`
      UPDATE public.bootstrap_mcp_mentees
      SET auth_user_id = '11111111-1111-4111-8111-111111111111'
      WHERE email = 'founder@example.test';
      INSERT INTO public.bootstrap_company_labels (mentee_id, label)
      SELECT id, label
      FROM public.bootstrap_mcp_mentees
      CROSS JOIN (VALUES ('harbor'), ('pirin')) AS wanted(label)
      WHERE email = 'founder@example.test'
      ON CONFLICT (mentee_id, label) DO NOTHING;
      INSERT INTO bootstrap_os.companies (id, slug, label)
      VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'harbor', 'Harbor');
      INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
      VALUES (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'default',
        'Harbor',
        1,
        1,
        'hold',
        '{"schema_version":1,"pnl":{"costs":12},"breaker_state":"tripped","appetite":{"weeks":6,"usd_cap":100}}'::jsonb
      );
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

  it("denies breaker_state from an authenticated JWT and leaves the card", () => {
    const before = psql(`SELECT scoreboard::text FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'harbor' AND i.slug = 'default';`).trim();
    assert.match(before, /"breaker_state": "tripped"/);
    assert.throws(() => callPut("harbor", `'{"breaker_state":"tripped"}'`), /server-written scoreboard key/);
    const after = psql(`SELECT scoreboard::text FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'harbor' AND i.slug = 'default';`).trim();
    assert.equal(after, before);
  });

  it("denies appetite on harbor", () => {
    assert.throws(
      () => callPut("harbor", `'{"appetite":{"weeks":6,"usd_cap":100}}'`),
      /shape up is not enabled for this company/,
    );
  });

  it("lets the MCP put path write appetite on the fleet slug and keep an existing card", () => {
    callPut("pirin", `'{"appetite":{"weeks":6,"usd_cap":40},"shape_up_test":true}'`);
    const seeded = psql(`SELECT scoreboard::text FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'pirin' AND i.slug = 'default';`).trim();
    assert.match(seeded, /"usd_cap": 40/);
    callPut("pirin", `'{"pnl":{"costs":9}}'`);
    const next = psql(`SELECT scoreboard::text FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'pirin' AND i.slug = 'default';`).trim();
    assert.match(next, /"usd_cap": 40/);
    assert.match(next, /"costs": 9/);
    assert.doesNotMatch(next, /breaker_state/);
  });

  it("denies the clock helper and a non-member without saying a card is missing", () => {
    assert.throws(() => psql("SET ROLE authenticated; SELECT bootstrap_os.shape_up_now();"), /permission denied/);
    assert.throws(() => callCheck("pirin", "stranger@example.test"), /company not visible/);
    assert.throws(() => callCheck("missing-board", "stranger@example.test"), /company not visible/);
  });

  it("denies a member of a slug that is not the fleet", () => {
    const before = psql(`SELECT scoreboard::text FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'harbor' AND i.slug = 'default';`).trim();
    assert.throws(() => callCheck("harbor"), /shape up is not enabled for this company/);
    const after = psql(`SELECT scoreboard::text FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'harbor' AND i.slug = 'default';`).trim();
    assert.equal(after, before);
  });

  it("trips a date breach and leaves the gate", () => {
    freeze("2026-11-02 18:00:00+00");
    seedPirinIdea(
      "date-card",
      '{"schema_version":1,"shape_up_test":true,"appetite":{"weeks":6,"usd_cap":100},"breaker":{"kill_on":"2026-11-01","rule":"date"},"pnl":{"costs":10}}',
    );
    const hit = callCheck("pirin");
    assert.match(hit, /"breach": "kill_on"/);
    assert.match(hit, /"slug": "date-card"/);
    const row = psql(`
      SELECT current_gate, scoreboard::text
      FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'pirin' AND i.slug = 'date-card';
    `).trim();
    assert.match(row, /^hold\|/);
    assert.match(row, /"breaker_state": "tripped"/);
    assert.match(row, /"breach": "kill_on"/);
    assert.equal(ideaAuditCount("date-card"), "1");
  });

  it("trips a spend breach", () => {
    freeze("2026-11-02 18:00:00+00");
    seedPirinIdea(
      "spend-card",
      '{"schema_version":1,"shape_up_test":true,"appetite":{"weeks":6,"usd_cap":100},"breaker":{"kill_on":"2026-12-01","rule":"cap"},"pnl":{"costs":150}}',
    );
    const hit = callCheck("pirin");
    assert.match(hit, /spend-card|spend/);
    const board = psql(`
      SELECT scoreboard::text FROM bootstrap_os.ideas i
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'pirin' AND i.slug = 'spend-card';
    `).trim();
    assert.match(board, /"breach": "spend"/);
    assert.doesNotMatch(board, /"breach": "kill_on"/);
    assert.equal(ideaAuditCount("spend-card"), "1");
  });

  it("defers a Sunday breach unless costs are more than twice the cap", () => {
    freeze("2026-11-01 18:00:00+00");
    seedPirinIdea(
      "sunday-card",
      '{"schema_version":1,"shape_up_test":true,"appetite":{"weeks":6,"usd_cap":100},"breaker":{"kill_on":"2026-10-01","rule":"date"},"pnl":{"costs":10}}',
    );
    seedPirinIdea(
      "urgent-card",
      '{"schema_version":1,"shape_up_test":true,"appetite":{"weeks":6,"usd_cap":100},"breaker":{"kill_on":"2026-12-01","rule":"cap"},"pnl":{"costs":250}}',
    );
    const hit = callCheck("pirin");
    assert.match(hit, /"breach": "spend"/);
    const sunday = psql(`
      SELECT coalesce(scoreboard->>'breaker_state', '') FROM bootstrap_os.ideas i
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'pirin' AND i.slug = 'sunday-card';
    `).trim();
    assert.equal(sunday, "");
    assert.equal(ideaAuditCount("sunday-card"), "0");
    const urgent = psql(`
      SELECT scoreboard::text FROM bootstrap_os.ideas i
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'pirin' AND i.slug = 'urgent-card';
    `).trim();
    assert.match(urgent, /"breaker_state": "tripped"/);
    assert.match(urgent, /"breach": "spend"/);
    assert.equal(ideaAuditCount("urgent-card"), "1");
  });

  it("writes nothing on a second call with the same state", () => {
    freeze("2026-11-02 18:00:00+00");
    seedPirinIdea(
      "twice-card",
      '{"schema_version":1,"shape_up_test":true,"appetite":{"weeks":6,"usd_cap":100},"breaker":{"kill_on":"2026-10-01","rule":"date"},"pnl":{"costs":1}}',
    );
    const first = callCheck("pirin");
    assert.match(first, /"breach": "kill_on"/);
    const audits = ideaAuditCount("twice-card");
    const board = psql(`
      SELECT scoreboard::text FROM bootstrap_os.ideas i
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'pirin' AND i.slug = 'twice-card';
    `).trim();
    const second = callCheck("pirin");
    assert.match(second, /"readOnly": true/);
    assert.doesNotMatch(second, /twice-card/);
    assert.equal(ideaAuditCount("twice-card"), audits);
    const again = psql(`
      SELECT scoreboard::text FROM bootstrap_os.ideas i
      JOIN bootstrap_os.companies c ON c.id = i.company_id
      WHERE c.slug = 'pirin' AND i.slug = 'twice-card';
    `).trim();
    assert.equal(again, board);
  });
});

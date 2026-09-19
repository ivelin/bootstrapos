/**
 * Isolated PGlite for list_provenance + all-gate / kill postmortem.
 * Never supabase-pirin-ai. Never prod. Fictional alpha/bravo only.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOURNEY_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260902_bootstrap_os_journey.sql",
);
const SUBSCRIBERS_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260920_bootstrap_os_board_subscribers.sql",
);
const PROVENANCE_SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260921_bootstrap_os_list_provenance.sql",
);

const HARNESS = `
DO $$ BEGIN
  CREATE ROLE anon;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
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
`;

const STUBS = `
CREATE OR REPLACE FUNCTION public.bootstrap_os_held_label(p_company text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
  SELECT EXISTS (
    SELECT 1
    FROM bootstrap_os.companies c
    JOIN bootstrap_os.company_acl a ON a.company_id = c.id
    WHERE c.slug = lower(p_company)
      AND (
        (a.principal_kind = 'email' AND a.principal = NULLIF(lower(auth.jwt() ->> 'email'), ''))
        OR (a.principal_kind = 'sub' AND a.principal = NULLIF(auth.jwt() ->> 'sub', ''))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_ensure_company(p_company text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
BEGIN
  IF NOT public.bootstrap_os_held_label(p_company) THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  SELECT id INTO cid FROM bootstrap_os.companies WHERE slug = lower(p_company);
  IF cid IS NULL THEN
    RAISE EXCEPTION 'company not visible';
  END IF;
  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_os_get_journey(p_company text, p_idea text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bootstrap_os AS $$
DECLARE
  cid uuid;
  company_row bootstrap_os.companies%ROWTYPE;
BEGIN
  cid := public.bootstrap_os_ensure_company(p_company);
  SELECT * INTO company_row FROM bootstrap_os.companies WHERE id = cid;
  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('slug', company_row.slug, 'label', company_row.label)
  );
END;
$$;
`;

const SEED = `
INSERT INTO bootstrap_os.companies (slug, label) VALUES ('alpha', 'alpha'), ('bravo', 'bravo');
INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
SELECT id, 'founder@example.test', 'email', 'founder' FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
SELECT id, 'founder-bravo@example.test', 'email', 'founder' FROM bootstrap_os.companies WHERE slug = 'bravo';
INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT id, 'default', 'alpha', 1, 1, 'hold', '{"schema_version": 1}'::jsonb
FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT id, 'default', 'bravo', 1, 1, 'hold', '{"schema_version": 1}'::jsonb
FROM bootstrap_os.companies WHERE slug = 'bravo';
`;

const GATE_ENR = {
  schema_version: 1,
  gateEnrichment: {
    whatChanged: "named the hold",
    whatWereNotDoing: "not a landing-page side quest",
  },
};

const KILL_BOARD = {
  schema_version: 1,
  gateEnrichment: {
    whatChanged: "retired the bet",
    whatWereNotDoing: "not retrying the same pitch",
    evidenceLinks: ["https://docs.example.test/alpha-retired"],
  },
  killPostmortem: {
    why: "no one would pay for the slice",
    lessonsLearned: "buyers already have a workaround they trust",
    actionableInsights: "next bet starts from an observed paid workaround",
    evidenceLinks: ["https://docs.example.test/alpha-retired"],
  },
};

let db;

async function asJwt({ email = "", sub = "" }, sql, params = []) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('app.actor_sub', $1, false)", [sub]);
  const rows = await db.query(sql, params);
  return rows.rows;
}

describe("PGlite provenance + kill postmortem (isolated, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    const journeySql = fs
      .readFileSync(JOURNEY_SQL, "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, "-- PGlite: gen_random_uuid is built-in");
    await db.exec(journeySql);
    await db.exec(STUBS);
    await db.exec(fs.readFileSync(SUBSCRIBERS_SQL, "utf8"));
    await db.exec(fs.readFileSync(PROVENANCE_SQL, "utf8"));
    await db.exec(SEED);
  });

  after(async () => {
    await db?.close();
  });

  it("migration file is Cos-apply only and names the locked fields", () => {
    const sql = fs.readFileSync(PROVENANCE_SQL, "utf8");
    assert.match(sql, /Do not migrate\/seed\/live-probe supabase-pirin-ai/);
    assert.match(sql, /bootstrap_os_list_provenance/);
    assert.match(sql, /lessonsLearned/);
    assert.match(sql, /actionableInsights/);
    assert.match(sql, /whatWereNotDoing/);
    assert.doesNotMatch(sql, /supabase\.co/);
    assert.doesNotMatch(sql, /Impact\/Evidence\/Leverage/);
    const subscriberAudit = sql.match(
      /CREATE OR REPLACE FUNCTION bootstrap_os\.audit_subscriber_write\(\)[\s\S]*?\$\$;/,
    );
    assert.ok(subscriberAudit);
    assert.doesNotMatch(subscriberAudit[0], /'webhookUrl'/);
    assert.match(subscriberAudit[0], /Do not archive it in provenance/);
    assert.match(sql, /RPC no longer emit_audit after UPDATE/);
  });

  it("held_label fail-closed: bravo founder cannot list alpha provenance or killed ideas", async () => {
    const hidden = (
      await asJwt(
        { email: "founder-bravo@example.test" },
        "SELECT public.bootstrap_os_list_provenance($1,$2,$3,$4) AS body",
        ["alpha", null, null, null],
      )
    )[0].body;
    assert.equal(hidden.ok, false);
    assert.doesNotMatch(JSON.stringify(hidden), /lessonsLearned|talk to two operators/);

    const hiddenKilled = (
      await asJwt(
        { email: "founder-bravo@example.test" },
        "SELECT public.bootstrap_os_list_killed_ideas($1) AS body",
        ["alpha"],
      )
    )[0].body;
    assert.equal(hiddenKilled.ok, false);
  });

  it("gate write needs whatChanged/whatWereNotDoing; silent kill is rejected; kill persists", async () => {
    const noNote = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        ["alpha", "default", "hold why", true, null, null, "hold", null, null, { schema_version: 1 }],
      )
    )[0].body;
    assert.equal(noNote.ok, false);
    assert.match(String(noNote.error), /whatChanged and whatWereNotDoing/);

    const silent = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        ["alpha", "default", "did not work", true, null, null, "kill", null, null, GATE_ENR],
      )
    )[0].body;
    assert.equal(silent.ok, false);
    assert.match(String(silent.error), /lessonsLearned and actionableInsights/);

    const held = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        ["alpha", "default", "hold while we talk", true, null, null, "hold", "talk to two operators", null, GATE_ENR],
      )
    )[0].body;
    assert.equal(held.ok, true);

    const created = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_create_idea($1,$2,$3,$4,$5) AS body",
        ["alpha", "retired-bet", "retired-bet", true, "second 0-1 board"],
      )
    )[0].body;
    assert.equal(created.ok, true);

    const killed = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        ["alpha", "retired-bet", "no one would pay for the slice", true, null, null, "kill", null, null, KILL_BOARD],
      )
    )[0].body;
    assert.equal(killed.ok, true);
    const retired = (killed.ideas || []).find((i) => i.slug === "retired-bet");
    assert.ok(retired);
    assert.equal(retired.killed, true);
    assert.equal(retired.killPostmortem.lessonsLearned, "buyers already have a workaround they trust");
    assert.equal(
      retired.killPostmortem.actionableInsights,
      "next bet starts from an observed paid workaround",
    );
    assert.match(retired.killedCard, /☠ Killed — buyers already have a workaround they trust/);

    const stillThere = await db.query(
      `SELECT i.slug, i.current_gate::text AS gate
       FROM bootstrap_os.ideas i
       JOIN bootstrap_os.companies c ON c.id = i.company_id
       WHERE c.slug = 'alpha' AND i.slug = 'retired-bet'`,
    );
    assert.equal(stillThere.rows[0].gate, "kill");

    const listed = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_list_killed_ideas($1) AS body",
        ["alpha"],
      )
    )[0].body;
    assert.equal(listed.ok, true);
    assert.equal(listed.ideas.length, 1);
    assert.equal(listed.ideas[0].slug, "retired-bet");
    assert.equal(listed.ideas[0].killPostmortem.lessonsLearned, retired.killPostmortem.lessonsLearned);

    const prov = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_list_provenance($1,$2,$3,$4) AS body",
        ["alpha", "retired-bet", null, null],
      )
    )[0].body;
    assert.equal(prov.ok, true);
    assert.ok(prov.events.some((e) => e.kind === "audit" && e.whatChanged?.after?.clocks?.currentGate === "kill"));
    assert.ok(prov.gateEvents.some((e) => e.action === "kill" && e.why === "no one would pay for the slice"));
    const lastAfter = [...prov.events]
      .reverse()
      .find((e) => e.kind === "audit" && e.whatChanged?.after?.clocks);
    assert.equal(lastAfter.whatChanged.after.clocks.currentGate, "kill");
    assert.equal(
      lastAfter.whatChanged.after.scoreboard.killPostmortem.lessonsLearned,
      "buyers already have a workaround they trust",
    );

    const bravoProv = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_list_provenance($1,$2,$3,$4) AS body",
        ["bravo", null, null, null],
      )
    )[0].body;
    assert.equal(bravoProv.ok, false);
  });
});

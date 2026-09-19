/**
 * Isolated Postgres (PGlite) for hosted subscriber RPCs.
 * Never supabase-pirin-ai. Never prod.
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
SELECT id, 'advisor@example.test', 'email', 'advisor' FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
SELECT id, 'authorized@example.test', 'email', 'founder_authorized' FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.company_acl (company_id, principal, principal_kind, role)
SELECT id, 'founder-bravo@example.test', 'email', 'founder' FROM bootstrap_os.companies WHERE slug = 'bravo';
INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT id, 'default', 'alpha', 1, 1, 'hold', '{"schema_version": 1}'::jsonb
FROM bootstrap_os.companies WHERE slug = 'alpha';
INSERT INTO bootstrap_os.ideas (company_id, slug, name, journey_phase, loop_stage, current_gate, scoreboard)
SELECT id, 'default', 'bravo', 1, 1, 'hold', '{"schema_version": 1}'::jsonb
FROM bootstrap_os.companies WHERE slug = 'bravo';
`;

let db;

async function asJwt({ email = "", sub = "" }, sql, params = []) {
  await db.query("SELECT set_config('app.actor_email', $1, false)", [email]);
  await db.query("SELECT set_config('app.actor_sub', $1, false)", [sub]);
  const rows = await db.query(sql, params);
  return rows.rows;
}

describe("PGlite hosted board subscriber RPCs (isolated, never prod)", { concurrency: false }, () => {
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

  it("subscribe persists https webhook for ACL member; list returns it; unsubscribe removes it", async () => {
    const stranger = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_subscribe_board($1,$2,$3,$4,$5,$6) AS body",
        ["alpha", null, "stranger@example.test", "email", "https://hooks.example.test/x", false],
      )
    )[0].body;
    assert.equal(stranger.ok, false);

    const http = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_subscribe_board($1,$2,$3,$4,$5,$6) AS body",
        ["alpha", null, "advisor@example.test", "email", "http://hooks.example.test/x", false],
      )
    )[0].body;
    assert.equal(http.ok, false);
    assert.match(http.error, /https/);

    const cross = (
      await asJwt(
        { email: "founder-bravo@example.test" },
        "SELECT public.bootstrap_os_subscribe_board($1,$2,$3,$4,$5,$6) AS body",
        ["alpha", null, "advisor@example.test", "email", "https://hooks.example.test/core", false],
      )
    )[0].body;
    assert.equal(cross.ok, false);

    const advisorGrant = (
      await asJwt(
        { email: "advisor@example.test" },
        "SELECT public.bootstrap_os_subscribe_board($1,$2,$3,$4,$5,$6) AS body",
        ["alpha", null, "advisor@example.test", "email", "https://hooks.example.test/core", false],
      )
    )[0].body;
    assert.equal(advisorGrant.ok, false);

    const granted = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_subscribe_board($1,$2,$3,$4,$5,$6) AS body",
        ["alpha", null, "advisor@example.test", "email", "https://hooks.example.test/core", true],
      )
    )[0].body;
    assert.equal(granted.ok, true);
    assert.equal(granted.subscriber.principal, "advisor@example.test");
    assert.equal(granted.subscriber.emailOptIn, true);

    const listed = (
      await asJwt(
        { email: "advisor@example.test" },
        "SELECT public.bootstrap_os_list_subscribers($1) AS body",
        ["alpha"],
      )
    )[0].body;
    assert.equal(listed.ok, true);
    assert.equal(listed.subscribers.length, 1);
    assert.equal(listed.subscribers[0].webhookUrl, "https://hooks.example.test/core");

    const board = (
      await asJwt(
        { email: "advisor@example.test" },
        "SELECT public.bootstrap_os_get_journey($1,$2) AS body",
        ["alpha", null],
      )
    )[0].body;
    assert.equal(board.ok, true);
    assert.doesNotMatch(JSON.stringify(board.audit), /hooks\.example\.test|webhookUrl/);
    const prov = (
      await asJwt(
        { email: "advisor@example.test" },
        "SELECT public.bootstrap_os_list_provenance($1,$2,$3,$4) AS body",
        ["alpha", null, null, null],
      )
    )[0].body;
    assert.equal(prov.ok, true);
    assert.doesNotMatch(JSON.stringify(prov), /hooks\.example\.test|webhookUrl/);
    const subAudit = await db.query(
      `SELECT what_changed FROM bootstrap_os.audit_events
       WHERE what_changed->>'via' IN ('subscribe_board', 'unsubscribe_board')`,
    );
    assert.ok(subAudit.rows.length >= 1);
    for (const row of subAudit.rows) {
      const dump = JSON.stringify(row.what_changed);
      assert.doesNotMatch(dump, /hooks\.example\.test/);
      assert.doesNotMatch(dump, /webhookUrl/);
      assert.equal(row.what_changed.after?.webhookUrl, undefined);
      assert.equal(row.what_changed.before?.webhookUrl, undefined);
    }

    const hidden = (
      await asJwt(
        { email: "founder-bravo@example.test" },
        "SELECT public.bootstrap_os_list_subscribers($1) AS body",
        ["alpha"],
      )
    )[0].body;
    assert.equal(hidden.ok, false);
  });

  it("put_journey / post_comment enqueue payload and return webhookDeliveries; comments do not Advance", async () => {
    const wrote = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        [
          "alpha",
          "default",
          "founder yes",
          true,
          2,
          null,
          "hold",
          null,
          null,
          {
            schema_version: 1,
            gateEnrichment: {
              whatChanged: "phase 2 hold",
              whatWereNotDoing: "not a landing-page side quest",
            },
          },
        ],
      )
    )[0].body;
    assert.equal(wrote.ok, true);
    const putAudits = await db.query(
      `SELECT count(*)::int AS n FROM bootstrap_os.audit_events
       WHERE what_changed->>'via' = 'put_journey'`,
    );
    assert.equal(putAudits.rows[0].n, 1, "put_journey RPC must not double-emit vs audit_idea_write");
    assert.equal(wrote.notify.webhook, 1);
    assert.equal(wrote.notify.emailQueued, 1);
    assert.equal(wrote.webhookDeliveries.length, 1);
    assert.equal(wrote.webhookDeliveries[0].url, "https://hooks.example.test/core");
    assert.equal(wrote.webhookDeliveries[0].payload.event, "put_journey");
    assert.equal(wrote.webhookDeliveries[0].payload.company.slug, "alpha");
    assert.equal(wrote.webhookDeliveries[0].payload.summary, "founder yes");
    assert.doesNotMatch(JSON.stringify(wrote.webhookDeliveries[0].payload), /scoreboard|openQuestions/);

    const clocks = await db.query(
      "SELECT journey_phase, current_gate FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'alpha'",
    );
    assert.equal(clocks.rows[0].journey_phase, 2);
    assert.equal(clocks.rows[0].current_gate, "hold");

    const comment = (
      await asJwt(
        { email: "advisor@example.test" },
        "SELECT public.bootstrap_os_post_comment($1,$2,$3) AS body",
        ["alpha", "default", "help on the slice"],
      )
    )[0].body;
    assert.equal(comment.ok, true);
    assert.equal(comment.clocksUnchanged, true);
    assert.equal(comment.notify.webhook, 1);
    assert.equal(comment.webhookDeliveries[0].payload.event, "post_comment");
    assert.equal(comment.webhookDeliveries[0].payload.summary, "help on the slice");

    const clocksAfter = await db.query(
      "SELECT journey_phase, current_gate FROM bootstrap_os.ideas i JOIN bootstrap_os.companies c ON c.id = i.company_id WHERE c.slug = 'alpha'",
    );
    assert.equal(clocksAfter.rows[0].journey_phase, 2);
    assert.equal(clocksAfter.rows[0].current_gate, "hold");

    const listed = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_list_webhook_deliveries_for_event($1,$2,$3) AS body",
        ["alpha", "default", "post_comment"],
      )
    )[0].body;
    assert.equal(listed.ok, true);
    assert.equal(listed.webhookDeliveries.length, 1);
  });

  it("change_acl grant then revoke stops notify; unauthorized cannot grant", async () => {
    const advisorWrite = (
      await asJwt(
        { email: "advisor@example.test" },
        "SELECT public.bootstrap_os_change_acl($1,$2,$3,$4,$5) AS body",
        ["alpha", "specialist@example.test", "email", "advisor", "grant"],
      )
    )[0].body;
    assert.equal(advisorWrite.ok, false);

    const granted = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_change_acl($1,$2,$3,$4,$5) AS body",
        ["alpha", "specialist@example.test", "email", "advisor", "grant"],
      )
    )[0].body;
    assert.equal(granted.ok, true);

    const revokeAdvisor = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_change_acl($1,$2,$3,$4,$5) AS body",
        ["alpha", "advisor@example.test", "email", "advisor", "revoke"],
      )
    )[0].body;
    assert.equal(revokeAdvisor.ok, true);

    const afterRevoke = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_put_journey($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS body",
        [
          "alpha",
          "default",
          "after revoke",
          true,
          null,
          2,
          null,
          null,
          null,
          {
            schema_version: 1,
            gateEnrichment: {
              whatChanged: "loop 2 after revoke",
              whatWereNotDoing: "not re-granting the advisor",
            },
          },
        ],
      )
    )[0].body;
    assert.equal(afterRevoke.ok, true);
    assert.equal(afterRevoke.notify.webhook, 0);

    const removed = (
      await asJwt(
        { email: "founder@example.test" },
        "SELECT public.bootstrap_os_unsubscribe_board($1,$2,$3,$4) AS body",
        ["alpha", null, "advisor@example.test", "email"],
      )
    )[0].body;
    assert.equal(removed.ok, true);
  });
});

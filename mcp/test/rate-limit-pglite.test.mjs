import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { memoryRateLimiter } from "../dist/rate-limit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261019_bootstrap_rate_limit.sql",
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
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.auth_uid', true), '')::uuid;
$$;
`;

function scriptedSteps() {
  const now = new Date("2026-10-19T15:04:05.006Z");
  const windowMs = 86_400_000;
  const startMs = now.getTime() - (now.getTime() % windowMs);
  const next = new Date(startMs + windowMs);
  const base = {
    actorId: "founder@example.test",
    action: "invite_member",
    limit: 20,
    windowMs,
  };
  const steps = [];
  for (let i = 0; i < 21; i += 1) steps.push({ ...base, now });
  steps.push({ ...base, now: next });
  steps.push({ ...base, limit: 1000001, now: next });
  return steps;
}

let db;

describe("bootstrap_rate_take on PGlite", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(HARNESS);
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const cut = sql.indexOf("CREATE OR REPLACE FUNCTION public.bootstrap_mcp_invite_member");
    assert.ok(cut > 0);
    await db.exec(sql.slice(0, cut));
  });

  after(async () => {
    await db?.close();
  });

  it("matches memoryRateLimiter across the 21st call, the next window, and a limit of 1000001", async () => {
    const steps = scriptedSteps();
    const memory = memoryRateLimiter();
    const memoryDecisions = [];
    for (const step of steps) memoryDecisions.push(await memory.take(step));

    const sqlDecisions = [];
    for (const step of steps) {
      const rows = await db.query(
        "SELECT public.bootstrap_rate_take($1::text, $2::text, $3::int, $4::int, $5::timestamptz) AS decision",
        [step.actorId, step.action, step.limit, step.windowMs / 1000, step.now.toISOString()],
      );
      sqlDecisions.push(rows.rows[0].decision);
    }

    assert.equal(memoryDecisions.slice(0, 21).filter((row) => row.ok).length, 20);
    assert.equal(memoryDecisions[20].ok, false);
    assert.equal(memoryDecisions[20].reason, "rate_limited");
    assert.equal(memoryDecisions[21].ok, true);
    assert.equal(memoryDecisions[22].reason, "rate_limiter_unavailable");
    const comparable = (row) =>
      row.ok
        ? { ok: true, remaining: row.remaining }
        : row.reason === "rate_limited"
          ? { ok: false, reason: row.reason, retryAt: row.retryAt, message: row.message }
          : { ok: false, reason: row.reason, message: row.message };
    assert.deepEqual(sqlDecisions.map(comparable), memoryDecisions.map(comparable));
    for (const row of sqlDecisions) {
      if (!row.ok) assert.equal(row.error, row.reason);
    }

    await db.exec(`
      INSERT INTO public.bootstrap_rate_window (actor_id, action, window_start, window_seconds, taken)
      VALUES ('charlie', 'create_company', '2001-01-01 00:00:00+00', 86400, 2)
    `);
    await db.query(
      "SELECT public.bootstrap_rate_take($1::text, $2::text, $3::int, $4::int, $5::timestamptz) AS decision",
      ["founder@example.test", "create_idea", 50, 86400, "2026-10-19T15:04:05.006Z"],
    );
    const left = await db.query(
      "SELECT count(*)::int AS n FROM public.bootstrap_rate_window WHERE actor_id = 'charlie'",
    );
    assert.equal(left.rows[0].n, 0);
  });

  it("authenticated cannot execute bootstrap_rate_take", async () => {
    await db.exec("SET ROLE authenticated");
    await assert.rejects(
      () =>
        db.query(
          "SELECT public.bootstrap_rate_take('founder@example.test', 'invite_member', 1, 60, now())",
        ),
      (err) => /permission denied/i.test(String(err && err.message ? err.message : err)),
    );
    await db.exec("RESET ROLE");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { memoryRateLimiter, postgresRateLimiter } from "../dist/rate-limit.js";
import {
  COMMENT_BODY_MAX_BYTES,
  HOSTED_DAILY_CAPS,
  PROVENANCE_PAGE_MAX,
  hostedActorKey,
  refusalMessage,
} from "../dist/hosted-caps.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261019_bootstrap_rate_limit.sql",
);

const UNAVAILABLE = {
  ok: false,
  reason: "rate_limiter_unavailable",
  message: "The limiter could not be reached. This action was refused.",
};

function takeInput(over = {}) {
  return {
    actorId: "founder@example.test",
    action: "invite_member",
    limit: 20,
    windowMs: 86_400_000,
    now: new Date("2026-10-19T12:00:00.000Z"),
    ...over,
  };
}

function rateTakeText(sql) {
  const start = sql.indexOf("CREATE FUNCTION public.bootstrap_rate_take(");
  const end = sql.indexOf("CREATE FUNCTION public.bootstrap_hosted_take");
  assert.ok(start >= 0 && end > start);
  return sql.slice(start, end);
}

describe("memory and postgres rate limiters", () => {
  it("forty parallel takes allow 20, then the next window allows again", async () => {
    let now = new Date("2026-10-19T12:00:00.000Z");
    const limiter = memoryRateLimiter({ now: () => now });
    const input = takeInput({ now: undefined });
    const batch = await Promise.all(Array.from({ length: 40 }, () => limiter.take(input)));
    assert.equal(batch.filter((row) => row.ok).length, 20);
    const blocked = await limiter.take(input);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "rate_limited");
    assert.match(blocked.message, /^Limit reached for invite_member\. Try again after /);
    now = new Date(blocked.retryAt);
    const again = await limiter.take(input);
    assert.equal(again.ok, true);
    assert.equal(again.remaining, 19);
  });

  it("a thrown query returns rate_limiter_unavailable and does not throw", async () => {
    const limiter = postgresRateLimiter(async () => {
      throw new Error("db down");
    });
    const decision = await limiter.take(takeInput());
    assert.deepEqual(decision, UNAVAILABLE);
  });

  it("the adapter sends one parameterized select and the actor id is a parameter", async () => {
    let seen;
    const limiter = postgresRateLimiter(async (sql, params) => {
      seen = { sql, params };
      return { rows: [{ decision: { ok: true, remaining: 19 } }] };
    });
    const now = new Date("2026-10-19T00:00:00.000Z");
    const decision = await limiter.take(takeInput({ now }));
    assert.deepEqual(decision, { ok: true, remaining: 19 });
    assert.equal(
      seen.sql,
      "select public.bootstrap_rate_take($1::text, $2::text, $3::int, $4::int, $5::timestamptz) as decision",
    );
    assert.deepEqual(seen.params.slice(0, 4), ["founder@example.test", "invite_member", 20, 86400]);
    assert.equal(seen.params[4], now);
    assert.doesNotMatch(seen.sql, /founder@example\.test/);
  });

  it("rejects bad arguments, a limit under 1, and a thrown clock without writing a slot", async () => {
    const limiter = memoryRateLimiter();
    assert.deepEqual(await limiter.take(takeInput({ actorId: "  " })), UNAVAILABLE);
    assert.deepEqual(await limiter.take(takeInput({ action: "Invite" })), UNAVAILABLE);
    assert.deepEqual(await limiter.take(takeInput({ limit: 1000001 })), UNAVAILABLE);
    assert.deepEqual(await limiter.take(takeInput({ limit: -1 })), UNAVAILABLE);
    assert.deepEqual(await limiter.take(takeInput({ windowMs: 0 })), UNAVAILABLE);
    assert.deepEqual(await limiter.take(takeInput({ windowMs: 1500 })), UNAVAILABLE);
    const zero = await limiter.take(takeInput({ limit: 0 }));
    assert.equal(zero.ok, false);
    assert.equal(zero.reason, "rate_limited");
    const first = await limiter.take(takeInput({ limit: 1, actorId: "  founder@example.test  " }));
    assert.deepEqual(first, { ok: true, remaining: 0 });
    const shared = await limiter.take(takeInput({ limit: 1, actorId: "founder@example.test" }));
    assert.equal(shared.ok, false);
    assert.equal(shared.reason, "rate_limited");

    let explode = true;
    const shaky = memoryRateLimiter({
      now: () => {
        if (explode) {
          explode = false;
          throw new Error("clock");
        }
        return new Date("2026-10-19T00:00:00.000Z");
      },
    });
    assert.deepEqual(await shaky.take(takeInput({ now: undefined, action: "create_company", limit: 5 })), UNAVAILABLE);
    assert.deepEqual(
      await shaky.take(takeInput({ now: undefined, action: "create_company", limit: 5 })),
      { ok: true, remaining: 4 },
    );
  });

  it("an empty row or a payload without boolean ok is unavailable", async () => {
    const empty = postgresRateLimiter(async () => ({ rows: [] }));
    assert.deepEqual(await empty.take(takeInput()), UNAVAILABLE);
    const shapeless = postgresRateLimiter(async () => ({ rows: [{ decision: { remaining: 1 } }] }));
    assert.deepEqual(await shapeless.take(takeInput()), UNAVAILABLE);
    const text = postgresRateLimiter(async () => ({
      rows: [{ decision: JSON.stringify({ ok: false, reason: "rate_limiter_unavailable", message: UNAVAILABLE.message }) }],
    }));
    assert.deepEqual(await text.take(takeInput()), UNAVAILABLE);
  });
});

describe("hosted caps and refusal sentences", () => {
  it("parses recognized codes and leaves every other payload alone", () => {
    assert.equal(hostedActorKey({ sub: "  AbC  ", email: "founder@example.test" }), "abc");
    assert.equal(hostedActorKey({ sub: "   ", email: " Founder@example.test " }), "founder@example.test");
    assert.equal(hostedActorKey({ principal: "Alpha" }), "alpha");
    assert.equal(hostedActorKey({}), "");

    const retryAt = "2026-10-20T00:00:00.000Z";
    assert.equal(
      refusalMessage({
        ok: false,
        error: "rate_limited",
        message: `Limit reached for create_company. Try again after ${retryAt}.`,
        retryAt,
      }),
      `Limit reached for create_company. Try again after ${retryAt}.`,
    );
    assert.equal(
      refusalMessage({ ok: false, reason: "rate_limiter_unavailable" }),
      UNAVAILABLE.message,
    );
    assert.equal(
      refusalMessage({ ok: false, error: "comment_too_long", message: "" }),
      "Comment is longer than 4 KB.",
    );
    assert.equal(
      refusalMessage({
        ok: false,
        reason: "rate_limited",
        message: "x".repeat(200),
        retryAt,
        action: "create_idea",
      }),
      `Limit reached for create_idea. Try again after ${retryAt}.`,
    );
    assert.equal(
      refusalMessage({ ok: false, error: "rate_limited", message: "journey_rpc_failed:401" }),
      "Limit reached. Try again later.",
    );
    assert.equal(refusalMessage('{"ok":false,"reason":"comment_too_long"}'), "Comment is longer than 4 KB.");
    assert.equal(refusalMessage({ ok: true }), null);
    assert.equal(refusalMessage({ ok: false, error: "slug_taken" }), null);
    assert.equal(refusalMessage("not json"), null);
  });
});

describe("rate limit migration text", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const rateTake = rateTakeText(sql);

  it("seeds the hosted caps and request bounds", () => {
    for (const [action, cap] of Object.entries(HOSTED_DAILY_CAPS)) {
      const match = sql.match(new RegExp(`\\('${action}',\\s*(\\d+),\\s*(\\d+)\\)`));
      assert.ok(match, action);
      assert.equal(Number(match[1]), cap.limit);
      assert.equal(Number(match[2]) * 1000, cap.windowMs);
    }
    assert.match(sql, /'comment_body_bytes',\s*4096/);
    assert.equal(COMMENT_BODY_MAX_BYTES, 4096);
    assert.match(sql, /'provenance_page_rows',\s*100/);
    assert.equal(PROVENANCE_PAGE_MAX, 100);
  });

  it("pins the definer, the upsert, the grants, and forced row level security", () => {
    assert.match(rateTake, /SECURITY DEFINER/);
    assert.match(rateTake, /SET search_path = pg_catalog, public/);
    assert.match(rateTake, /ON CONFLICT \(actor_id, action, window_start\)/);
    assert.match(rateTake, /DO UPDATE SET taken = bucket\.taken \+ 1/);
    assert.match(rateTake, /WHERE bucket\.taken < p_limit/);
    assert.match(sql, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'service_role'\)/);
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.bootstrap_rate_take\(text, text, int, int, timestamptz\)\s+TO service_role/,
    );
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_rate_take\(text, text, int, int, timestamptz\)\s+FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.bootstrap_hosted_take\(text\)\s+FROM PUBLIC, anon, authenticated/);
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.bootstrap_rate_take\(text, text, int, int, timestamptz\)\s+TO current_user/,
    );
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/i);
    assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_hosted_take/);
  });

  it("has no row lock, no advisory lock, and no cron", () => {
    assert.doesNotMatch(rateTake, /SELECT\s+FOR UPDATE/i);
    assert.doesNotMatch(rateTake, /pg_advisory/);
    assert.match(sql, /DELETE FROM public\.bootstrap_rate_window/);
    assert.doesNotMatch(sql, /pg_cron/);
  });

  it("declares locals that are not column names and charges through bootstrap_hosted_take", () => {
    const declared = rateTake.match(/DECLARE([\s\S]*?)BEGIN/);
    assert.ok(declared);
    const names = [...declared[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gm)].map((match) => match[1]);
    for (const banned of ["actor_id", "action", "window_start", "window_seconds", "taken"]) {
      assert.equal(names.includes(banned), false, banned);
    }
    assert.match(sql, /bootstrap_hosted_take\('invite_member'\)/);
    assert.match(sql, /bootstrap_hosted_take\('create_company'\)/);
    assert.match(sql, /bootstrap_hosted_take\('create_idea'\)/);
    assert.doesNotMatch(sql, /bootstrap_hosted_take\([^)]*\b(?:20|5|50)\b/);
    assert.match(sql, /\('invite_member', 20, 86400\)/);
    assert.match(sql, /\('create_company', 5, 86400\)/);
    assert.match(sql, /\('create_idea', 50, 86400\)/);
  });
});

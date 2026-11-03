/**
 * Shape Up test. Scoreboard JSON only. Spend is owner-entered pnl.costs.
 * Fixture slug is fictional. Never a live company.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { SupabaseJourneyStore } from "../dist/hosted-journey-store.js";
import { MemoryIdentityStore, hashMcpToken, setIdentityStoreForTests } from "../dist/identity.js";
import { MemoryJourneyStore, defaultScoreboard, setJourneyStoreForTests } from "../dist/journey.js";
import {
  SHAPE_UP_COMPANY_SLUGS,
  SHAPE_UP_FIXTURE_SLUG,
  SHAPE_UP_FLEET_SLUG,
  allowShapeUpSlugForTests,
  parseNudgeMarker,
  validateShapeUpPut,
} from "../dist/shape-up.js";

allowShapeUpSlugForTests(SHAPE_UP_FIXTURE_SLUG);

const FOUNDER = {
  authenticated: true,
  email: "founder@example.test",
  principal: "founder@example.test",
};
const DEPUTY = {
  authenticated: true,
  email: "deputy@example.test",
  principal: "deputy@example.test",
};
const ADVISOR = {
  authenticated: true,
  email: "advisor@example.test",
  principal: "advisor@example.test",
};

const GATE = {
  whatChanged: "recorded the breaker",
  whatWereNotDoing: "not changing the gate from the nudge",
};
const KILL = {
  lessonsLearned: "the cap was the limit",
  actionableInsights: "stop the bet",
};

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setJourneyStoreForTests(undefined);
});

function board(slug) {
  return new MemoryJourneyStore(
    [{ id: "co-1", slug, label: "Fixture" }],
    [
      { companyId: "co-1", principal: FOUNDER.email, principalKind: "email", role: "founder" },
      { companyId: "co-1", principal: DEPUTY.email, principalKind: "email", role: "founder_authorized" },
      { companyId: "co-1", principal: ADVISOR.email, principalKind: "email", role: "advisor" },
    ],
    [
      {
        id: "card-1",
        companyId: "co-1",
        slug: "default",
        name: "Fixture",
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard: defaultScoreboard(),
      },
    ],
    [],
    [],
  );
}

const appetite = { weeks: 6, usd_cap: 100 };
const breaker = { kill_on: "2026-10-01", rule: "stop when the date or the cap breaks" };

function shape(extra = {}) {
  return {
    ...defaultScoreboard(),
    shape_up_test: true,
    appetite,
    breaker,
    ...extra,
  };
}

describe("shape up contract", () => {
  it("allowlists only the fleet slug pirin", () => {
    assert.equal(SHAPE_UP_FLEET_SLUG, "pirin");
    assert.deepEqual([...SHAPE_UP_COMPANY_SLUGS], ["pirin"]);
    assert.equal(SHAPE_UP_COMPANY_SLUGS.includes(SHAPE_UP_FIXTURE_SLUG), false);
  });

  it("rejects shape-up keys on a real-looking slug that is not pirin", async () => {
    const store = board("harbor");
    const hit = await store.putJourney(FOUNDER, {
      companySlug: "harbor",
      why: "not the fleet company",
      founderYes: true,
      scoreboard: shape(),
    });
    assert.equal(hit.ok, false);
    assert.match(String(hit.error), /not enabled/);
    const checked = await store.checkBreakers(FOUNDER, {
      companySlug: "harbor",
      now: new Date("2026-11-02T18:00:00.000Z"),
    });
    assert.equal(checked.ok, false);
    const seeded = await store.putJourney(FOUNDER, {
      companySlug: "harbor",
      why: "client nudge list",
      founderYes: true,
      scoreboard: shape({ shape_up_nudges: [{ card_id: "card-1", breach: "spend" }] }),
    });
    assert.equal(seeded.ok, false);
    assert.match(String(seeded.error), /shape_up_nudges is server-written/);
  });

  it("round-trips appetite and breaker, and old cards stay null-safe", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    const old = await store.getJourney(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
    assert.equal(old.ideas[0].scoreboard.appetite, undefined);
    assert.equal(old.ideas[0].scoreboard.breaker, undefined);
    const written = await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "set the appetite",
      founderYes: true,
      scoreboard: shape(),
    });
    assert.equal(written.ok, true);
    const again = await store.getJourney(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
    assert.equal(again.ideas[0].scoreboard.appetite.weeks, 6);
    assert.equal(again.ideas[0].scoreboard.appetite.usd_cap, 100);
    assert.equal(again.ideas[0].scoreboard.breaker.kill_on, "2026-10-01");
    assert.equal(again.ideas[0].scoreboard.breaker_state, undefined);
    assert.equal(again.ideas[0].clocks.currentGate, "hold");
  });

  it("rejects types, the 280 cap, unknown subkeys, and a client breaker_state", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    const cases = [
      [shape({ appetite: { weeks: 0, usd_cap: 1 } }), /integer > 0/],
      [shape({ appetite: { weeks: 1.5, usd_cap: 1 } }), /integer > 0/],
      [shape({ appetite: { weeks: 2, usd_cap: -1 } }), /number >= 0/],
      [shape({ appetite: { weeks: 2, usd_cap: 1, extra: true } }), /unknown key/],
      [shape({ breaker: { kill_on: "2026-10-01", rule: "x", note: "y" } }), /unknown key/],
      [shape({ breaker: { kill_on: "2026-02-31", rule: "x" } }), /ISO date/],
      [shape({ breaker: { kill_on: "2026-10-01", rule: "y".repeat(281) } }), /280/],
      [shape({ breaker_state: "tripped" }), /server-written/],
      [shape({ shape_up_nudges: [{ card_id: "card-1", breach: "spend" }] }), /shape_up_nudges is server-written/],
      [shape({ shape_up_test: false }), /must be true/],
    ];
    for (const [scoreboard, pattern] of cases) {
      const hit = await store.putJourney(FOUNDER, {
        companySlug: SHAPE_UP_FIXTURE_SLUG,
        why: "bad shape",
        founderYes: true,
        scoreboard,
      });
      assert.equal(hit.ok, false);
      assert.match(String(hit.error), pattern);
    }
    const direct = validateShapeUpPut(SHAPE_UP_FIXTURE_SLUG, { appetite: "nope" });
    assert.match(String(direct), /object/);
  });

  it("rejects the four keys on a founder card outside the allowlist", async () => {
    const store = board("alpha");
    const hit = await store.putJourney(FOUNDER, {
      companySlug: "alpha",
      why: "not on the list",
      founderYes: true,
      scoreboard: shape(),
    });
    assert.equal(hit.ok, false);
    assert.match(String(hit.error), /not enabled/);
    const plain = await store.putJourney(FOUNDER, {
      companySlug: "alpha",
      why: "ordinary write",
      founderYes: true,
      constraintThisWeek: "talk to two operators",
    });
    assert.equal(plain.ok, true);
  });
});

describe("check_breakers", () => {
  it("trips on the date and on spend, then a repeat is read-only", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape({ pnl: { costs: 100, costsUnknown: false } }),
    });
    const monday = new Date("2026-11-02T18:00:00.000Z");
    const first = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG, now: monday });
    assert.equal(first.ok, true);
    assert.equal(first.readOnly, false);
    assert.deepEqual(
      first.tripped.map((row) => row.breach).sort(),
      ["kill_on", "spend"],
    );
    const viewed = await store.getJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      expandMeetingDoc: true,
    });
    assert.equal(viewed.ideas[0].clocks.currentGate, "hold");
    assert.equal(viewed.ideas[0].scoreboard.breaker_state, "tripped");
    assert.equal(viewed.ideas[0].comments.length, 2);
    const second = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG, now: monday });
    assert.equal(second.readOnly, true);
    assert.deepEqual(second.tripped, []);
    const after = await store.getJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      expandMeetingDoc: true,
    });
    assert.equal(after.ideas[0].comments.length, 2);
    assert.equal(after.ideas[0].clocks.currentGate, "hold");
    const nudgeAudits = viewed.audit.filter((row) => row.whatChanged?.op === "check_breakers");
    assert.equal(nudgeAudits.length, 2);
    for (const row of nudgeAudits) assert.equal(row.whatChanged.op, "check_breakers");
  });

  it("still trips after an advisor posts a comment that looks like a nudge marker", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape(),
    });
    const fake = await store.postComment(ADVISOR, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      body: JSON.stringify({ card_id: "card-1", breach: "kill_on" }),
    });
    assert.equal(fake.ok, true);
    const monday = new Date("2026-11-02T18:00:00.000Z");
    const hit = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG, now: monday });
    assert.equal(hit.readOnly, false);
    assert.ok(hit.tripped.some((row) => row.breach === "kill_on"));
  });

  it("defers while Chicago is still Sunday even if UTC has already reached Monday", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape({ pnl: { costs: 10 } }),
    });
    const stillSundayInChicago = new Date("2026-11-02T02:00:00.000Z");
    const hit = await store.checkBreakers(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      now: stillSundayInChicago,
    });
    assert.equal(hit.readOnly, true);
    assert.deepEqual(hit.tripped, []);
  });

  it("does not trip kill_on on the Chicago calendar day of the date", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape({ breaker: { kill_on: "2026-11-02", rule: "today" }, pnl: { costs: 1 } }),
    });
    const hit = await store.checkBreakers(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      now: new Date("2026-11-02T18:00:00.000Z"),
    });
    assert.equal(hit.readOnly, true);
  });

  it("rejects a broken nudge marker and keeps a valid one", () => {
    assert.equal(parseNudgeMarker("{"), null);
    assert.equal(parseNudgeMarker("not-json"), null);
    assert.deepEqual(parseNudgeMarker('{"card_id":"card-1","breach":"spend"}'), {
      card_id: "card-1",
      breach: "spend",
    });
  });

  it("defers a Sunday breach unless costs are more than twice the cap", async () => {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape({ pnl: { costs: 200 } }),
    });
    const sunday = new Date("2026-11-01T18:00:00.000Z");
    const deferred = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG, now: sunday });
    assert.equal(deferred.readOnly, true);
    const doubled = board(SHAPE_UP_FIXTURE_SLUG);
    await doubled.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape({ pnl: { costs: 201 } }),
    });
    const forced = await doubled.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG, now: sunday });
    assert.equal(forced.readOnly, false);
    assert.ok(forced.tripped.some((row) => row.breach === "spend"));
  });

  it("does nothing for a company that is not on the allowlist", async () => {
    const store = board("alpha");
    const hit = await store.checkBreakers(FOUNDER, { companySlug: "alpha", now: new Date("2026-11-02T18:00:00.000Z") });
    assert.equal(hit.ok, false);
    assert.match(String(hit.error), /not enabled/);
  });
});

describe("confirm kill", () => {
  async function trippedStore() {
    const store = board(SHAPE_UP_FIXTURE_SLUG);
    await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      why: "arm the card",
      founderYes: true,
      scoreboard: shape({ pnl: { costs: 10 } }),
    });
    await store.checkBreakers(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      now: new Date("2026-11-02T18:00:00.000Z"),
    });
    return store;
  }

  it("lets the owner kill through the existing gate path", async () => {
    const store = await trippedStore();
    const killed = await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      currentGate: "kill",
      why: "the founder confirmed",
      founderYes: true,
      gateEnrichment: GATE,
      killPostmortem: KILL,
      client: "founder-chat",
    });
    assert.equal(killed.ok, true);
    const viewed = await store.getJourney(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
    assert.equal(viewed.ideas[0].clocks.currentGate, "kill");
  });

  it("writes an audit row when a non-owner or a bot tries to confirm", async () => {
    const store = await trippedStore();
    const deputy = await store.putJourney(DEPUTY, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      currentGate: "kill",
      why: "a deputy tried",
      founderYes: true,
      gateEnrichment: GATE,
      killPostmortem: KILL,
      client: "deputy-chat",
    });
    assert.equal(deputy.ok, false);
    assert.equal(deputy.denied, "non_owner");
    const bot = await store.putJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      currentGate: "kill",
      why: "a bot tried",
      founderYes: true,
      gateEnrichment: GATE,
      killPostmortem: KILL,
      client: "grok-bot",
    });
    assert.equal(bot.ok, false);
    assert.equal(bot.denied, "bot");
    const advisor = await store.putJourney(ADVISOR, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      currentGate: "kill",
      why: "an advisor tried",
      founderYes: true,
      gateEnrichment: GATE,
      killPostmortem: KILL,
      client: "advisor-chat",
    });
    assert.equal(advisor.denied, "non_owner");
    const viewed = await store.getJourney(FOUNDER, {
      companySlug: SHAPE_UP_FIXTURE_SLUG,
      expandMeetingDoc: true,
    });
    assert.equal(viewed.ideas[0].clocks.currentGate, "hold");
    const denials = viewed.audit.filter((row) => row.whatChanged?.op === "confirm_kill_denied");
    assert.equal(denials.length, 3);
    for (const row of denials) assert.equal(row.whatChanged.op, "confirm_kill_denied");
    assert.deepEqual(
      denials.map((row) => row.whatChanged.denied).sort(),
      ["bot", "non_owner", "non_owner"],
    );
  });
});

describe("check_breakers tool visibility", () => {
  it("hides the tool unless a label is on the allowlist", async () => {
    const token = "bos_shapeup_fixture_token";
    setIdentityStoreForTests(
      new MemoryIdentityStore([
        {
          id: "mentee-shape",
          email: "founder@example.test",
          authUserId: "auth-shape",
          labels: ["alpha"],
          role: "member",
          tokenHashes: [hashMcpToken(token)],
        },
      ]),
    );
    setJourneyStoreForTests(board("alpha"));
    const hidden = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    const hiddenTools = JSON.parse(await hidden.text()).result.tools.map((tool) => tool.name);
    assert.equal(hiddenTools.includes("check_breakers"), false);

    setIdentityStoreForTests(
      new MemoryIdentityStore([
        {
          id: "mentee-shape",
          email: "founder@example.test",
          authUserId: "auth-shape",
          labels: [SHAPE_UP_FIXTURE_SLUG],
          role: "member",
          tokenHashes: [hashMcpToken(token)],
        },
      ]),
    );
    const shown = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      }),
    );
    const shownTools = JSON.parse(await shown.text()).result.tools;
    const tool = shownTools.find((row) => row.name === "check_breakers");
    assert.ok(tool);
    assert.match(tool.description, /Internal/);
    assert.equal(tool.description.includes("Where are we"), false);
  });
});

describe("supabase check_breakers", () => {
  it("calls check_breakers and posts one comment per breach the server recorded", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    let ran = false;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      calls.push({ url: String(url), body });
      if (String(url).includes("bootstrap_os_check_breakers")) {
        const first = !ran;
        ran = true;
        return Response.json(
          first
            ? {
                ok: true,
                readOnly: false,
                gateUnchanged: true,
                tripped: [{ card_id: "card-1", breach: "spend", slug: "default" }],
              }
            : { ok: true, readOnly: true, gateUnchanged: true, tripped: [] },
        );
      }
      return Response.json({ ok: true });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const first = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
      assert.equal(first.readOnly, false);
      assert.deepEqual(first.tripped, [{ card_id: "card-1", breach: "spend" }]);
      const comment = calls.find((row) => row.url.includes("bootstrap_os_post_comment"));
      assert.equal(JSON.parse(comment.body.p_body).breach, "spend");
      assert.equal(comment.body.p_idea, "default");
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_put_journey")), false);
      const check = calls.find((row) => row.url.includes("bootstrap_os_check_breakers"));
      assert.equal(check.body.p_slug, SHAPE_UP_FIXTURE_SLUG);
      assert.equal("p_now" in check.body, false);
      const second = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
      assert.equal(second.readOnly, true);
      assert.equal(calls.filter((row) => row.url.includes("bootstrap_os_post_comment")).length, 1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("audits a bot denial through the comment path and does not change the gate", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
      if (String(url).includes("bootstrap_os_get_journey")) {
        return Response.json({
          ok: true,
          owners: [{ principal: "founder@example.test", role: "founder" }],
          ideas: [
            {
              id: "card-9",
              slug: "default",
              clocks: { currentGate: "hold" },
              scoreboard: { ...shape(), breaker_state: "tripped" },
            },
          ],
        });
      }
      return Response.json({ ok: true });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const denied = await store.putJourney(FOUNDER, {
        companySlug: SHAPE_UP_FIXTURE_SLUG,
        ideaSlug: "default",
        currentGate: "kill",
        why: "bot tried",
        founderYes: true,
        client: "bot",
        gateEnrichment: GATE,
        killPostmortem: KILL,
      });
      assert.equal(denied.ok, false);
      assert.equal(denied.denied, "bot");
      const comment = calls.find((row) => row.url.includes("bootstrap_os_post_comment"));
      assert.equal(JSON.parse(comment.body.p_body).denied, "bot");
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_put_journey")), false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("asks the server about harbor and does not put or comment", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
      if (String(url).includes("bootstrap_os_check_breakers")) {
        return new Response(JSON.stringify({ message: "shape up is not enabled for this company" }), {
          status: 400,
        });
      }
      return Response.json({ ok: true, ideas: [] });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const hit = await store.checkBreakers(FOUNDER, { companySlug: "harbor" });
      assert.equal(hit.ok, false);
      assert.match(String(hit.error), /journey_rpc_failed:400/);
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_check_breakers")), true);
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_post_comment")), false);
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_put_journey")), false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("posts no comment when the breaker RPC fails", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
      if (String(url).includes("bootstrap_os_check_breakers")) {
        return new Response(JSON.stringify({ message: "no" }), { status: 400 });
      }
      return Response.json({ ok: true });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const hit = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
      assert.equal(hit.ok, false);
      assert.equal(calls.filter((row) => row.url.includes("bootstrap_os_check_breakers")).length, 1);
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_post_comment")), false);
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_put_journey")), false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("posts both breaches from one server result and does not put the scoreboard", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
      if (String(url).includes("bootstrap_os_check_breakers")) {
        return Response.json({
          ok: true,
          readOnly: false,
          gateUnchanged: true,
          tripped: [
            { card_id: "card-1", breach: "kill_on", slug: "default" },
            { card_id: "card-1", breach: "spend", slug: "default" },
          ],
        });
      }
      return Response.json({ ok: true });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const hit = await store.checkBreakers(FOUNDER, { companySlug: SHAPE_UP_FIXTURE_SLUG });
      assert.deepEqual(
        hit.tripped.map((row) => row.breach),
        ["kill_on", "spend"],
      );
      const comments = calls.filter((row) => row.url.includes("bootstrap_os_post_comment"));
      assert.deepEqual(
        comments.map((row) => JSON.parse(row.body.p_body).breach),
        ["kill_on", "spend"],
      );
      assert.equal(calls.some((row) => row.url.includes("bootstrap_os_put_journey")), false);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("check_breakers handler", () => {
  it("calls the store for an allowlisted label and returns the read-only result", async () => {
    const token = "bos_shapeup_handler_token";
    setIdentityStoreForTests(
      new MemoryIdentityStore([
        {
          id: "mentee-shape",
          email: "founder@example.test",
          authUserId: "auth-shape",
          labels: [SHAPE_UP_FIXTURE_SLUG],
          role: "member",
          tokenHashes: [hashMcpToken(token)],
        },
      ]),
    );
    setJourneyStoreForTests(board(SHAPE_UP_FIXTURE_SLUG));
    const res = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "check_breakers", arguments: { company: SHAPE_UP_FIXTURE_SLUG } },
        }),
      }),
    );
    const raw = await res.text();
    assert.equal(res.status, 200, raw);
    const payload = JSON.parse(raw);
    assert.equal(payload.result.isError, undefined);
    assert.match(payload.result.content[0].text, /"readOnly": true/);
  });
});

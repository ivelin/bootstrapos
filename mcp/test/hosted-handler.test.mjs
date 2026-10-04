import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  HOSTED_GATED_IDENTITY_TOOL_NAMES,
  HOSTED_GATED_JOURNEY_TOOL_NAMES,
  HOSTED_READ_TOOL_NAMES,
} from "../dist/constants.js";
import { HostedMembershipJourneyStore, SupabaseJourneyStore } from "../dist/hosted-journey-store.js";
import { ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import { fixtureJourneyStore, setJourneyStoreForTests } from "../dist/journey.js";
import { syntheticAccessToken } from "../dist/journey-auth.js";
import {
  HOSTED_MCP_RESOURCE,
  HOSTED_MCP_RESOURCE_ALIAS,
  WWW_AUTHENTICATE_CHALLENGE,
  wwwAuthenticateChallenge,
} from "../dist/oauth.js";

async function rpc(method, params, id = 1) {
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const text = await res.text();
  assert.ok(res.ok, `RPC ${method} failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

describe("Vercel fetch handler (hosted-read)", () => {
  it("GET /health returns ok without a local clone", async () => {
    delete process.env.BOOTSTRAP_OS_ROOT;
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "published";
    const res = await handleHostedReadFetch(new Request("https://preview.example/health"));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  });

  it("initialize + tools/list is hosted-read only", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "hosted-handler-test", version: "0.0.0" },
    });
    assert.equal(init.result.serverInfo.name, "bootstrap-os");

    await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
    );

    const listed = await rpc("tools/list", {}, 2);
    const names = listed.result.tools.map((t) => t.name).sort();
    for (const n of HOSTED_READ_TOOL_NAMES) {
      assert.ok(names.includes(n), `missing ${n}`);
    }
    for (const n of HOSTED_GATED_IDENTITY_TOOL_NAMES) {
      assert.ok(names.includes(n), `missing gated ${n}`);
    }
    for (const n of HOSTED_GATED_JOURNEY_TOOL_NAMES) {
      assert.ok(!names.includes(n), `must not list ${n} without a journey store`);
    }
    assert.ok(!names.includes("bootstrap_init_company"));
    assert.ok(!names.includes("bootstrap_update_state"));
    assert.ok(!names.includes("bootstrap_get_state"));
  });

  it("collab host and vercel.app deploy Host cookie-less handshake 401 (same WWW-Authenticate)", async () => {
    const initBody = {
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "host-split", version: "0.0.0" },
      },
    };
    const collab = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify(initBody),
      }),
    );
    assert.equal(collab.status, 401);
    assert.equal(collab.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);

    const alias = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE_ALIAS, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ ...initBody, id: 4 }),
      }),
    );
    assert.equal(alias.status, 401);
    assert.equal(alias.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);
    assert.doesNotMatch(WWW_AUTHENTICATE_CHALLENGE, /error="invalid_token"/);

    const stale = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer eyJhbGciOiJub25lIn0.e30.x",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "bootstrap_whoami" } }),
      }),
    );
    assert.equal(stale.status, 401);
    assert.match(stale.headers.get("WWW-Authenticate") || "", /error="invalid_token"/);
  });

  afterEach(() => {
    setJourneyStoreForTests(undefined);
  });

  it("public OS tools skip login; journey tools force 401 + WWW-Authenticate", async () => {
    const publicCall = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "bootstrap_os_info", arguments: {} },
        }),
      }),
    );
    assert.equal(publicCall.status, 200);

    const gated = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "get_journey", arguments: { q: "CoreHaul" } },
        }),
      }),
    );
    assert.equal(gated.status, 401);
    const challenge = gated.headers.get("www-authenticate");
    assert.match(challenge ?? "", /Bearer realm="bootstrap-os-mcp"/);
    assert.match(challenge ?? "", /resource_metadata=/);
    assert.match(challenge ?? "", /scope="bootstrap-os"/);
    const body = JSON.parse(await gated.text());
    assert.equal(body.error, "invalid_token");
    assert.match(body.error_description, /Public OS tools stay open/);
    assert.equal(body.identityStore, "unset");

    const subscribe = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 41,
          method: "tools/call",
          params: {
            name: "subscribe_board",
            arguments: {
              company: "corehaul",
              principal: "advisor-cos@example.test",
              principalKind: "email",
              webhookUrl: "https://hooks.example.test/core",
            },
          },
        }),
      }),
    );
    assert.equal(subscribe.status, 401);
  });

  it("random connector JWT is 401 on get_journey and notify tools; allowlisted founder can get_journey", async () => {
    setJourneyStoreForTests(fixtureJourneyStore());
    const stranger = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${syntheticAccessToken({ email: "stranger@example.test", extra: { fast: true } })}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "get_journey", arguments: { q: "CoreHaul" } },
        }),
      }),
    );
    assert.equal(stranger.status, 401);

    for (const [id, name, args] of [
      [
        51,
        "subscribe_board",
        {
          company: "corehaul",
          principal: "advisor-cos@example.test",
          principalKind: "email",
          webhookUrl: "https://hooks.example.test/core",
        },
      ],
      [
        52,
        "unsubscribe_board",
        {
          company: "corehaul",
          principal: "advisor-cos@example.test",
          principalKind: "email",
        },
      ],
      [53, "list_subscribers", { company: "corehaul" }],
      [54, "enable_board_watch", { company: "corehaul" }],
      [55, "list_provenance", { company: "corehaul" }],
      [
        56,
        "put_portfolio_score",
        {
          company: "corehaul",
          idea: "corehaul",
          impact: 3,
          evidence: 3,
          leverage: 3,
          why: "stranger probe",
          founderYes: true,
        },
      ],
    ]) {
      const notify = await handleHostedReadFetch(
        new Request("https://preview.example/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${syntheticAccessToken({ email: "stranger@example.test", extra: { fast: true } })}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
      );
      assert.equal(notify.status, 401, name);
    }

    const founderTok = syntheticAccessToken({ email: "founder-core@example.test" });
    const founder = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${founderTok}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "get_journey", arguments: { q: "CoreHaul" } },
        }),
      }),
    );
    assert.equal(founder.status, 200);
    const payload = JSON.parse(await founder.text());
    const text = payload.result.content.map((c) => c.text ?? "").join("\n");
    const parsed = JSON.parse(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.company.slug, "corehaul");
    assert.equal(parsed.ideas.length, 1);
    assert.match(parsed.ideas[0].visualFlow, /mermaid/);
    assert.match(parsed.spoken, /The goal is/);
    assert.match(parsed.ideas[0].snapshot, /The goal is/);
    assert.match(parsed.spoken, /\*\*Next:\*\*/);
    assert.doesNotMatch(parsed.ideas[0].snapshot, /journey phase \d/);
    assert.doesNotMatch(parsed.ideas[0].snapshot, /gate hold/i);
    assert.equal(parsed.ideas[0].constraintThisWeek, "");
  });
});

const ALPHA_EMAIL = "founder@example.test";
const ALPHA_BOS = "bos_alpha_fixture_token";

function futureExp() {
  return Math.floor(Date.now() / 1000) + 3600;
}

function alphaMembershipStore() {
  return new HostedMembershipJourneyStore((actor) =>
    actor.email === ALPHA_EMAIL ? ["alpha"] : [],
  );
}

function countingJourneyStore(inner) {
  const calls = [];
  const wrap = (name, fn) => async (...args) => {
    calls.push(name);
    return fn.apply(inner, args);
  };
  return {
    calls,
    store: {
      kind: inner.kind,
      actorOnAllowlist(actor) {
        calls.push("actorOnAllowlist");
        return inner.actorOnAllowlist(actor);
      },
      getJourney: wrap("getJourney", inner.getJourney),
      createIdea: wrap("createIdea", inner.createIdea),
      putJourney: wrap("putJourney", inner.putJourney),
      putPortfolioScore: wrap("putPortfolioScore", inner.putPortfolioScore),
      listProvenance: wrap("listProvenance", inner.listProvenance),
      listKilledIdeas: wrap("listKilledIdeas", inner.listKilledIdeas),
      postComment: wrap("postComment", inner.postComment),
      changeAcl: wrap("changeAcl", inner.changeAcl),
      subscribeBoard: wrap("subscribeBoard", inner.subscribeBoard),
      unsubscribeBoard: wrap("unsubscribeBoard", inner.unsubscribeBoard),
      listSubscribers: wrap("listSubscribers", inner.listSubscribers),
    },
  };
}

function toolRequest(name, args, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://preview.example/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

function toolText(payload) {
  return payload.result.content.map((part) => part.text ?? "").join("\n");
}

describe("journey token must be usable before the tool runs", () => {
  afterEach(() => {
    setJourneyStoreForTests(undefined);
    setIdentityStoreForTests(undefined);
    delete process.env.VERCEL_ENV;
    delete process.env.BOOTSTRAP_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("expired token on a journey tool returns 401 invalid_token and does not call the journey store", async () => {
    const counted = countingJourneyStore(alphaMembershipStore());
    setJourneyStoreForTests(counted.store);
    const fetches = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      fetches.push(String(url));
      return origFetch(url, init);
    };
    try {
      const token = syntheticAccessToken({
        email: ALPHA_EMAIL,
        sub: "auth-alpha",
        extra: { exp: 1 },
      });
      for (const [name, args] of [
        ["post_comment", { company: "alpha", body: "note" }],
        ["get_journey", { company: "alpha" }],
      ]) {
        const req = toolRequest(name, args, token);
        const res = await handleHostedReadFetch(req);
        assert.equal(res.status, 401, name);
        assert.equal(res.headers.get("WWW-Authenticate"), wwwAuthenticateChallenge(req));
        assert.match(res.headers.get("WWW-Authenticate") ?? "", /error="invalid_token"/);
        const body = JSON.parse(await res.text());
        assert.equal(body.error, "invalid_token");
        assert.equal(body.reason, "invalid_or_revoked_token");
        assert.equal(body.labels, undefined);
      }
      assert.deepEqual(counted.calls, []);
      assert.deepEqual(fetches, []);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("valid token on get_journey still returns the alpha board", async () => {
    setJourneyStoreForTests(alphaMembershipStore());
    const token = syntheticAccessToken({
      email: ALPHA_EMAIL,
      sub: "auth-alpha",
      extra: { exp: futureExp() },
    });
    const res = await handleHostedReadFetch(toolRequest("get_journey", { company: "alpha" }, token));
    const raw = await res.text();
    assert.equal(res.status, 200, raw);
    const parsed = JSON.parse(toolText(JSON.parse(raw)));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.company.slug, "alpha");
  });

  it("PostgREST 401 on a journey RPC becomes HTTP 401 invalid_token", async () => {
    const token = syntheticAccessToken({
      email: ALPHA_EMAIL,
      sub: "auth-alpha",
      extra: { exp: futureExp() },
    });
    setJourneyStoreForTests(
      new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", token),
    );
    const urls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ message: "JWT expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const req = toolRequest("post_comment", { company: "alpha", body: "note" }, token);
      const res = await handleHostedReadFetch(req);
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("WWW-Authenticate"), wwwAuthenticateChallenge(req));
      assert.match(res.headers.get("WWW-Authenticate") ?? "", /error="invalid_token"/);
      const body = JSON.parse(await res.text());
      assert.equal(body.error, "invalid_token");
      assert.equal(body.reason, "invalid_or_revoked_token");
      assert.ok(urls.some((url) => url.includes("/rest/v1/rpc/bootstrap_os_post_comment")));
      assert.equal(urls.some((url) => url.includes("/auth/v1/user")), false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("PostgREST 403 and 500 stay HTTP 200 tool results", async () => {
    const token = syntheticAccessToken({
      email: ALPHA_EMAIL,
      sub: "auth-alpha",
      extra: { exp: futureExp() },
    });
    const origFetch = globalThis.fetch;
    try {
      for (const status of [403, 500]) {
        setJourneyStoreForTests(
          new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", token),
        );
        globalThis.fetch = async () => new Response("nope", { status });
        const res = await handleHostedReadFetch(
          toolRequest("get_journey", { company: "alpha" }, token),
        );
        const raw = await res.text();
        assert.equal(res.status, 200, `${status} ${raw}`);
        assert.equal(res.headers.get("WWW-Authenticate"), null);
        const parsed = JSON.parse(toolText(JSON.parse(raw)));
        assert.equal(parsed.ok, false);
        assert.equal(parsed.error, `journey_rpc_failed:${status}`);
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("non-journey tools ignore journey expiry and still use whoami", async () => {
    const expired = syntheticAccessToken({
      email: ALPHA_EMAIL,
      sub: "auth-alpha",
      extra: { exp: 1 },
    });
    const fresh = syntheticAccessToken({
      email: ALPHA_EMAIL,
      sub: "auth-alpha",
      extra: { exp: futureExp() },
    });

    const publicExpired = await handleHostedReadFetch(
      toolRequest("bootstrap_os_info", {}, expired),
    );
    assert.equal(publicExpired.status, 200);

    const whoamiExpired = await handleHostedReadFetch(
      toolRequest("bootstrap_whoami", {}, expired),
    );
    assert.equal(whoamiExpired.status, 401);
    const expiredBody = JSON.parse(await whoamiExpired.text());
    assert.equal(expiredBody.reason, "identity_store_unset");
    assert.equal(expiredBody.error, "invalid_token");

    const whoamiFresh = await handleHostedReadFetch(toolRequest("bootstrap_whoami", {}, fresh));
    assert.equal(whoamiFresh.status, 401);
    const freshBody = JSON.parse(await whoamiFresh.text());
    assert.equal(freshBody.reason, expiredBody.reason);

    setIdentityStoreForTests(ivelinMemoryFixture(ALPHA_BOS));
    const known = await handleHostedReadFetch(toolRequest("bootstrap_whoami", {}, ALPHA_BOS));
    const knownRaw = await known.text();
    assert.equal(known.status, 200, knownRaw);
    const knownBody = JSON.parse(toolText(JSON.parse(knownRaw)));
    assert.equal(knownBody.authenticated, true);
    assert.deepEqual(knownBody.labels, ["alpha", "bravo", "charlie"]);
  });

  it("supabase /auth/v1/user rejection blocks a journey tool with 401 and no journey RPC", async () => {
    const counted = countingJourneyStore(alphaMembershipStore());
    setJourneyStoreForTests(counted.store);
    setIdentityStoreForTests(undefined);
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-test-key";
    const urls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const href = String(url);
      urls.push(href);
      if (href.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({ message: "invalid" }), { status: 401 });
      }
      return new Response("unexpected", { status: 500 });
    };
    try {
      const token = syntheticAccessToken({
        email: ALPHA_EMAIL,
        sub: "auth-alpha",
        extra: { exp: futureExp() },
      });
      const req = toolRequest("get_journey", { company: "alpha" }, token);
      const res = await handleHostedReadFetch(req);
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("WWW-Authenticate"), wwwAuthenticateChallenge(req));
      assert.match(res.headers.get("WWW-Authenticate") ?? "", /error="invalid_token"/);
      const body = JSON.parse(await res.text());
      assert.equal(body.error, "invalid_token");
      assert.equal(body.reason, "invalid_or_revoked_token");
      assert.equal(body.identityStore, "supabase");
      assert.deepEqual(counted.calls, []);
      assert.deepEqual(
        urls.filter((url) => url.includes("/rest/v1/rpc/")),
        [],
      );
      assert.equal(urls.filter((url) => url.endsWith("/auth/v1/user")).length, 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("a token /auth/v1/user accepts still opens the journey tool when the mentee row is missing", async () => {
    setJourneyStoreForTests(alphaMembershipStore());
    setIdentityStoreForTests(undefined);
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-test-key";
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({ email: ALPHA_EMAIL, id: "user-alpha" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (href.includes("/rest/v1/rpc/bootstrap_mcp_my_labels")) {
        return new Response(
          JSON.stringify({ authenticated: false, reason: "not_invited", labels: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("unexpected", { status: 500 });
    };
    try {
      const token = syntheticAccessToken({
        email: ALPHA_EMAIL,
        sub: "auth-alpha",
        extra: { exp: futureExp() },
      });
      const res = await handleHostedReadFetch(
        toolRequest("get_journey", { company: "alpha" }, token),
      );
      const raw = await res.text();
      assert.equal(res.status, 200, raw);
      const parsed = JSON.parse(toolText(JSON.parse(raw)));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.company.slug, "alpha");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

/**
 * Private starter bet board. One per account. No invites. No promotion.
 * Plain MCP client. No Bill. Never prod.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { setIdentityStoreForTests } from "../dist/identity.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { syntheticAccessToken } from "../dist/journey-auth.js";
import {
  MemoryStarterStore,
  SupabaseStarterStore,
  createStarterStore,
  resolveStarterStore,
  setStarterStoreForTests,
} from "../dist/starter-board.js";
import { BET_BOARD_READY_MESSAGE, MemoryCompanyAdminStore, setCompanyAdminStoreForTests } from "../dist/company-admin.js";
import { FIRST_BET_STEP, STARTER_BET_BOARD_STEP } from "../dist/setup-steps.js";

const EMAIL = "founder@example.test";

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setJourneyStoreForTests(undefined);
  setStarterStoreForTests(undefined);
  setCompanyAdminStoreForTests(undefined);
  delete process.env.VERCEL_ENV;
  delete process.env.BOOTSTRAP_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_ANON_KEY;
});

async function rpc(method, params, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), text };
}

function toolJson(body) {
  if (!body.result?.content) {
    throw new Error(`missing tool result: ${JSON.stringify(body).slice(0, 800)}`);
  }
  const text = body.result.content.map((part) => part.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe("starter bet board (memory, never prod)", { concurrency: false }, () => {
  it("caps one sandbox, refuses invites and promotion, and a plain client names the first bet", async () => {
    const labels = [];
    const sandboxes = new Set();
    const starter = new MemoryStarterStore((_email, slug) => {
      labels.push(slug);
      sandboxes.add(slug);
    });
    setStarterStoreForTests(starter);
    setIdentityStoreForTests({
      kind: "memory",
      async whoami() {
        return {
          authenticated: true,
          email: EMAIL,
          labels: [...labels],
          role: "member",
          reason: labels.length === 0 ? "no_membership" : null,
          identityStore: "memory",
        };
      },
    });
    setJourneyStoreForTests(
      new HostedMembershipJourneyStore(() => [...labels], {
        isSandbox: (slug) => sandboxes.has(slug),
      }),
    );
    const token = syntheticAccessToken({
      email: EMAIL,
      sub: "auth-founder-starter",
      extra: { exp: Math.floor(Date.now() / 1000) + 3600 },
    });

    const hello = await rpc(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "plain-mcp", version: "0.0.0" },
      },
      token,
    );
    assert.equal(hello.status, 200);
    assert.equal(hello.body.result.serverInfo !== undefined || hello.body.result.protocolVersion !== undefined, true);
    assert.doesNotMatch(String(hello.body.result.instructions ?? ""), /x\.ai\/bot|Bootstrap Bill/i);

    const who = toolJson((await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, token)).body);
    assert.equal(who.reason, "no_membership");
    assert.equal(who.setupSteps[0].id, STARTER_BET_BOARD_STEP.id);
    assert.equal(who.setupSteps[0].title, STARTER_BET_BOARD_STEP.title);
    assert.equal(who.setupSteps[0].nextTool, STARTER_BET_BOARD_STEP.nextTool);
    assert.match(who.guidance, /private starter bet board/);

    const opened = await rpc("tools/call", { name: "create_starter_board", arguments: {} }, token);
    assert.equal(opened.status, 200);
    const first = toolJson(opened.body);
    assert.equal(opened.body.result.isError, undefined);
    assert.equal(first.ok, true);
    assert.equal(first.created, true);
    assert.match(first.company, /^sb[0-9a-f]{8}$/);
    assert.notEqual(
      first.company,
      `sb${createHash("md5").update(EMAIL).digest("hex").slice(0, 8)}`,
    );
    assert.equal(first.invites, false);
    assert.equal(first.promotable, false);
    assert.equal(first.setupSteps[0].id, FIRST_BET_STEP.id);
    assert.equal(first.setupSteps[0].nextTool, "create_idea");

    const again = toolJson((await rpc("tools/call", { name: "create_starter_board", arguments: {} }, token)).body);
    assert.equal(again.created, false);
    assert.equal(again.company, first.company);
    assert.equal(starter.count(), 1);

    const member = toolJson((await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, token)).body);
    assert.deepEqual(member.companies, [first.company]);
    assert.equal(member.setupSteps, undefined);

    const listed = toolJson(
      (await rpc("tools/call", { name: "bootstrap_list_companies", arguments: {} }, token)).body,
    );
    assert.deepEqual(listed.companies, []);
    assert.equal(listed.setupSteps[0].id, STARTER_BET_BOARD_STEP.id);

    const empty = toolJson(
      (await rpc("tools/call", { name: "get_journey", arguments: { company: first.company } }, token)).body,
    );
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.ideas, []);
    assert.equal(empty.setupSteps[0].id, "first-bet");
    assert.equal(empty.setupSteps[0].nextTool, "create_idea");
    assert.match(empty.guidance, /Name the first bet/);

    const invited = await rpc(
      "tools/call",
      { name: "invite_member", arguments: { email: "member@example.test", company: first.company } },
      token,
    );
    assert.equal(invited.status, 200);
    assert.equal(invited.body.result.isError, true);
    assert.match(invited.body.result.content.map((part) => part.text).join("\n"), /cannot send invites/);

    const promoted = await starter.promote(EMAIL);
    assert.deepEqual(promoted, { ok: false, error: "sandbox_cannot_promote" });

    const named = await rpc(
      "tools/call",
      {
        name: "create_idea",
        arguments: {
          company: first.company,
          idea: "dispatch",
          founderYes: true,
          why: "sell dispatch software to shops that already pay for routing",
        },
      },
      token,
    );
    assert.equal(named.status, 200, named.text);
    assert.notEqual(named.body.result.isError, true, named.text);

    const filled = toolJson(
      (await rpc("tools/call", { name: "get_journey", arguments: { company: first.company } }, token)).body,
    );
    assert.equal(filled.ideas.length, 1);
    assert.equal(filled.setupSteps, undefined);
    assert.equal(filled.portfolio.applies, false);
    assert.equal(filled.portfolio.reason, "a starter bet board is not in the portfolio");
    assert.doesNotMatch(named.text, /Bootstrap Bill|x\.ai\/bot/);

    const subscribed = await rpc(
      "tools/call",
      {
        name: "subscribe_board",
        arguments: {
          company: first.company,
          principal: EMAIL,
          principalKind: "email",
          webhookUrl: "https://hooks.example.test/board",
        },
      },
      token,
    );
    assert.equal(subscribed.body.result.isError, true);
    assert.match(subscribed.body.result.content.map((part) => part.text).join("\n"), /cannot send webhooks/);

    const watched = await rpc(
      "tools/call",
      { name: "enable_board_watch", arguments: { company: first.company } },
      token,
    );
    assert.equal(watched.body.result.isError, true);
    assert.match(watched.body.result.content.map((part) => part.text).join("\n"), /cannot send webhooks/);

    const scored = await rpc(
      "tools/call",
      {
        name: "put_portfolio_score",
        arguments: {
          company: first.company,
          idea: "dispatch",
          impact: 3,
          evidence: 3,
          leverage: 3,
          why: "shops already pay for routing",
          founderYes: true,
        },
      },
      token,
    );
    assert.equal(scored.body.result.isError, true);
    assert.match(scored.body.result.content.map((part) => part.text).join("\n"), /not in the portfolio/);
  });

  it("a zero-company member gets setupSteps and a super admin still reaches create_company", async () => {
    setIdentityStoreForTests({
      kind: "memory",
      async whoami(token) {
        const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString());
        const admin = payload.email === "admin@example.test";
        return {
          authenticated: true,
          email: payload.email,
          labels: [],
          role: admin ? "super_admin" : "member",
          reason: "no_membership",
          identityStore: "memory",
        };
      },
    });
    setCompanyAdminStoreForTests(
      new MemoryCompanyAdminStore([{ email: "admin@example.test", role: "super_admin" }]),
    );
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const guest = syntheticAccessToken({ email: "guest@example.test", sub: "auth-guest", extra: { exp } });
    const admin = syntheticAccessToken({ email: "admin@example.test", sub: "auth-admin", extra: { exp } });
    const guestCompany = toolJson(
      (
        await rpc(
          "tools/call",
          { name: "create_company", arguments: { slug: "alpha", founderYes: true, why: "a real company" } },
          guest,
        )
      ).body,
    );
    assert.equal(guestCompany.ok, true);
    assert.equal(guestCompany.slug, "alpha");
    assert.equal(guestCompany.message, BET_BOARD_READY_MESSAGE);
    const adminCompany = toolJson(
      (
        await rpc(
          "tools/call",
          { name: "create_company", arguments: { slug: "bravo", founderYes: true, why: "a real company" } },
          admin,
        )
      ).body,
    );
    assert.equal(adminCompany.setupSteps, undefined);
    assert.equal(adminCompany.ok, true);
    assert.equal(adminCompany.slug, "bravo");
  });

  it("retries a colliding slug and stops when every try collides", async () => {
    let n = 0;
    const store = new MemoryStarterStore(undefined, () => {
      n += 1;
      return n < 3 ? "sbaaaaaaaa" : "sbbbbbbbbb";
    });
    const first = await store.create("one@example.test");
    const second = await store.create("two@example.test");
    assert.equal(first.ok && first.board.slug, "sbaaaaaaaa");
    assert.equal(second.ok && second.board.slug, "sbbbbbbbbb");

    const stuck = new MemoryStarterStore(undefined, () => "sbcccccccc");
    const held = await stuck.create("three@example.test");
    assert.equal(held.ok, true);
    const capped = await stuck.create("four@example.test");
    assert.deepEqual(capped, { ok: false, error: "starter_cap" });
    assert.equal(stuck.count(), 1);
  });

  it("refuses a second memory row and a blank email", async () => {
    const store = new MemoryStarterStore();
    const created = await store.create("Founder@Example.TEST");
    assert.equal(created.ok, true);
    assert.equal(created.created, true);
    assert.match(created.board.slug, /^sb[0-9a-f]{8}$/);
    const again = await store.create("founder@example.test");
    assert.equal(again.created, false);
    assert.equal(again.board.slug, created.board.slug);
    const raced = await Promise.all([
      store.create("racer@example.test"),
      store.create("racer@example.test"),
    ]);
    assert.equal(raced[0].ok && raced[1].ok, true);
    assert.equal(raced[0].board.slug, raced[1].board.slug);
    assert.equal(store.count(), 2);
    assert.equal((await store.create("not-an-email")).ok, false);
    assert.equal(await store.isSandbox(created.board.slug), true);
    assert.equal(await store.isSandbox("alpha"), false);
  });

  it("supabase starter store parses the rpc and stays off outside production", async () => {
    assert.equal(createStarterStore("token"), null);
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://fixture.example";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-fixture";
    const live = createStarterStore("token-fixture");
    assert.ok(live instanceof SupabaseStarterStore);
    assert.equal(resolveStarterStore("token-fixture") instanceof SupabaseStarterStore, true);
    setStarterStoreForTests(null);
    assert.equal(resolveStarterStore("token-fixture"), null);

    const calls = [];
    const store = new SupabaseStarterStore(
      "https://fixture.example",
      "anon-fixture",
      "token-fixture",
      async (url, init) => {
        calls.push(String(url));
        if (String(url).endsWith("bootstrap_os_create_starter_board")) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, created: true, slug: "sbabcdef12" }) };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify("sbabcdef12") };
      },
    );
    const created = await store.create("founder@example.test");
    assert.equal(created.ok, true);
    assert.equal(created.board.slug, "sbabcdef12");
    assert.equal(created.board.invites, false);
    assert.equal(await store.isSandbox("sbabcdef12"), true);
    assert.equal(await store.isSandbox("alpha"), false);
    assert.match(calls[0], /\/rest\/v1\/rpc\/bootstrap_os_create_starter_board$/);

    const down = new SupabaseStarterStore("https://fixture.example", "anon", "token", async () => ({
      ok: false,
      status: 500,
      text: async () => "nope",
    }));
    assert.equal((await down.create("founder@example.test")).error, "starter_store_unavailable");
    assert.equal(await down.isSandbox("alpha"), true);

    const empty = new SupabaseStarterStore("https://fixture.example", "anon", "token", async () => ({
      ok: true,
      status: 200,
      text: async () => "null",
    }));
    assert.equal(await empty.isSandbox("alpha"), false);

    const junk = new SupabaseStarterStore("https://fixture.example", "anon", "token", async () => ({
      ok: true,
      status: 200,
      text: async () => "not-json",
    }));
    assert.equal((await junk.create("founder@example.test")).error, "starter_store_unavailable");
  });
});

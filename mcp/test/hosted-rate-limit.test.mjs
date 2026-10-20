import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  MemoryCompanyAdminStore,
  SupabaseCompanyAdminStore,
  setCompanyAdminStoreForTests,
} from "../dist/company-admin.js";
import { ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import { MemoryInviteStore, setInviteStoreForTests } from "../dist/invite.js";
import { MemoryJourneyStore, defaultScoreboard, setJourneyStoreForTests } from "../dist/journey.js";
import { actorFromAuthorizationHeader, syntheticAccessToken } from "../dist/journey-auth.js";
import { postgresRateLimiter } from "../dist/rate-limit.js";

const TOKEN = "bos_ivelin_fixture_token_ok";
const EMAIL = "founder@example.test";

afterEach(() => {
  setCompanyAdminStoreForTests(undefined);
  setInviteStoreForTests(undefined);
  setJourneyStoreForTests(undefined);
  setIdentityStoreForTests(undefined);
});

function futureExp() {
  return Math.floor(Date.now() / 1000) + 3600;
}

function founderToken() {
  return syntheticAccessToken({
    email: EMAIL,
    sub: "auth-founder",
    extra: { exp: futureExp() },
  });
}

async function postTool(name, args, token) {
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
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const raw = await res.text();
  const body = JSON.parse(raw);
  const text = (body.result?.content ?? []).map((part) => part.text ?? "").join("\n");
  return { status: res.status, isError: body.result?.isError, text, body };
}

function adminStore() {
  return new MemoryCompanyAdminStore([{ email: EMAIL, role: "super_admin", labels: [] }]);
}

function inviteStore() {
  return new MemoryInviteStore([
    {
      id: "mentee-founder",
      email: EMAIL,
      authUserId: "auth-founder",
      labels: ["alpha", "bravo", "charlie"],
    },
  ]);
}

function journeyStore(role) {
  return new MemoryJourneyStore(
    [
      { id: "co-alpha", slug: "alpha", label: "alpha" },
      { id: "co-bravo", slug: "bravo", label: "bravo" },
    ],
    [
      {
        companyId: "co-alpha",
        principal: EMAIL,
        principalKind: "email",
        role,
      },
    ],
    [
      {
        id: "idea-alpha",
        companyId: "co-alpha",
        slug: "alpha",
        name: "alpha",
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard: defaultScoreboard(),
      },
      {
        id: "idea-bravo",
        companyId: "co-alpha",
        slug: "bravo",
        name: "bravo",
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

describe("hosted write limits", () => {
  it("the 6th create_company is HTTP 200 isError and does not store the slug", async () => {
    const admin = adminStore();
    setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
    setCompanyAdminStoreForTests(admin);
    const slugs = ["alpha", "bravo", "charlie", "alpha-2", "bravo-2", "charlie-2"];
    const dup = await postTool("create_company", { slug: "alpha", founderYes: true, why: "first" }, TOKEN);
    assert.equal(dup.status, 200);
    assert.equal(dup.isError, undefined);
    const again = await postTool("create_company", { slug: "alpha", founderYes: true, why: "taken" }, TOKEN);
    assert.equal(again.isError, undefined);
    assert.match(again.text, /slug_taken/);
    for (const slug of slugs.slice(1, 5)) {
      const created = await postTool(
        "create_company",
        { slug, founderYes: true, why: "another company" },
        TOKEN,
      );
      assert.equal(created.status, 200, slug);
      assert.equal(created.isError, undefined, created.text);
      assert.match(created.text, new RegExp(slug));
    }
    const blocked = await postTool(
      "create_company",
      { slug: "charlie-2", founderYes: true, why: "over the cap" },
      TOKEN,
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.isError, true);
    assert.match(blocked.text, /Try again after/);
    assert.doesNotMatch(blocked.text, /journey_rpc_failed:401/);
    assert.doesNotMatch(blocked.text, /"status": 403/);
    assert.equal(admin.companies.has("charlie-2"), false);
  });

  it("the 21st invite is isError and adds no outbox row", async () => {
    const store = inviteStore();
    setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
    setInviteStoreForTests(store);
    const already = await store.inviteMember(
      { email: EMAIL, labels: ["alpha", "bravo", "charlie"] },
      { email: EMAIL, companyLabel: "alpha" },
    );
    assert.equal(already.ok, false);
    assert.equal(already.reason, "already_member");
    assert.equal(store.outbox.length, 0);
    for (let n = 0; n < 20; n += 1) {
      const invited = await postTool(
        "invite_member",
        { email: "alpha@example.test", company: "alpha" },
        TOKEN,
      );
      assert.equal(invited.status, 200, invited.text);
      assert.equal(invited.isError, undefined, invited.text);
    }
    const before = store.outbox.length;
    assert.equal(before, 40);
    const blocked = await postTool(
      "invite_member",
      { email: "alpha@example.test", company: "alpha" },
      TOKEN,
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.isError, true);
    assert.equal(store.outbox.length, before);
  });

  it("the 51st idea is isError and the idea is absent", async () => {
    const store = journeyStore("founder");
    setJourneyStoreForTests(store);
    const token = founderToken();
    const actor = actorFromAuthorizationHeader(`Bearer ${token}`, "memory");
    const first = await postTool(
      "create_idea",
      { company: "alpha", idea: "i01", founderYes: true },
      token,
    );
    assert.equal(first.status, 200, first.text);
    assert.equal(first.isError, undefined, first.text);
    const dup = await postTool(
      "create_idea",
      { company: "alpha", idea: "i01", founderYes: true },
      token,
    );
    assert.equal(dup.isError, undefined);
    assert.match(dup.text, /already exists/);
    for (let n = 2; n <= 50; n += 1) {
      const slug = `i${String(n).padStart(2, "0")}`;
      const created = await postTool(
        "create_idea",
        { company: "alpha", idea: slug, founderYes: true },
        token,
      );
      assert.equal(created.isError, undefined, `${slug} ${created.text}`);
    }
    const blocked = await postTool(
      "create_idea",
      { company: "alpha", idea: "i51", founderYes: true },
      token,
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.isError, true);
    const board = await store.getJourney(actor, { companySlug: "alpha" });
    const slugs = board.ideas.map((idea) => idea.slug);
    assert.equal(slugs.includes("i51"), false);
    assert.equal(slugs.includes("i50"), true);
  });

  it("rejects a comment over 4096 UTF-8 bytes and keeps the shorter one", async () => {
    const store = journeyStore("advisor");
    setJourneyStoreForTests(store);
    const token = founderToken();
    const actor = actorFromAuthorizationHeader(`Bearer ${token}`, "memory");
    const shortBody = "é".repeat(2048);
    const longBody = "é".repeat(2049);
    assert.equal(Buffer.byteLength(shortBody, "utf8"), 4096);
    assert.equal(Buffer.byteLength(longBody, "utf8"), 4098);
    const saved = await postTool(
      "post_comment",
      { company: "alpha", idea: "alpha", body: shortBody },
      token,
    );
    assert.equal(saved.status, 200, saved.text.slice(0, 200));
    assert.equal(saved.isError, undefined, saved.text.slice(0, 200));
    const blocked = await postTool(
      "post_comment",
      { company: "alpha", idea: "alpha", body: longBody },
      token,
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.isError, true);
    assert.match(blocked.text, /Comment is longer than 4 KB\./);
    const direct = await store.postComment(actor, {
      companySlug: "alpha",
      ideaSlug: "alpha",
      body: longBody,
    });
    assert.equal(direct.ok, false);
    assert.equal(direct.error, "comment_too_long");
    const board = await store.getJourney(actor, {
      companySlug: "alpha",
      ideaSlug: "alpha",
      expandMeetingDoc: true,
    });
    assert.equal(board.ideas[0].comments.length, 1);
    assert.equal(board.ideas[0].comments[0].body, shortBody);
  });

  it("lists at most 100 provenance events for alpha and leaves bravo out", async () => {
    const audit = [];
    const gates = [];
    for (let n = 0; n < 120; n += 1) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
      const ideaId = n % 2 === 0 ? "idea-alpha" : "idea-bravo";
      if (n % 2 === 0) {
        audit.push({
          id: `ae-${n}`,
          companyId: "co-alpha",
          ideaId,
          who: EMAIL,
          at,
          client: "mcp",
          whatChanged: { marker: n === 0 ? "oldest-alpha" : `alpha-${n}` },
        });
      } else {
        gates.push({
          id: `ge-${n}`,
          ideaId,
          action: "hold",
          at,
          why: `gate-${n}`,
          who: EMAIL,
        });
      }
    }
    audit.push({
      id: "ae-bravo",
      companyId: "co-bravo",
      ideaId: null,
      who: EMAIL,
      at: "2026-02-01T00:00:00.000Z",
      client: "mcp",
      whatChanged: { marker: "bravo-company" },
    });
    const store = new MemoryJourneyStore(
      [
        { id: "co-alpha", slug: "alpha", label: "alpha" },
        { id: "co-bravo", slug: "bravo", label: "bravo" },
      ],
      [
        {
          companyId: "co-alpha",
          principal: EMAIL,
          principalKind: "email",
          role: "founder",
        },
      ],
      [
        {
          id: "idea-alpha",
          companyId: "co-alpha",
          slug: "alpha",
          name: "alpha",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: defaultScoreboard(),
        },
        {
          id: "idea-bravo",
          companyId: "co-alpha",
          slug: "bravo",
          name: "bravo",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: defaultScoreboard(),
        },
      ],
      gates,
      [],
      audit,
    );
    setJourneyStoreForTests(store);
    const listed = await postTool("list_provenance", { company: "alpha" }, founderToken());
    assert.equal(listed.status, 200, listed.text.slice(0, 300));
    assert.equal(listed.isError, undefined);
    const page = JSON.parse(listed.text);
    assert.equal(page.ok, true);
    assert.equal(page.events.length, 100);
    const slugs = new Set(page.events.map((row) => row.ideaSlug));
    assert.equal(slugs.has("alpha"), true);
    assert.equal(slugs.has("bravo"), true);
    assert.equal(JSON.stringify(page).includes("oldest-alpha"), false);
    assert.equal(JSON.stringify(page).includes("bravo-company"), false);
    assert.ok(page.audit.length <= 100);
    assert.ok(page.gateEvents.length <= 100);
    assert.equal(page.audit.length + page.gateEvents.length, 100);
  });

  it("a thrown limiter leaves the company map unchanged and returns the unavailable sentence", async () => {
    const admin = new MemoryCompanyAdminStore([{ email: EMAIL, role: "super_admin", labels: [] }], {
      limiter: postgresRateLimiter(async () => {
        throw new Error("db down");
      }),
    });
    setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
    setCompanyAdminStoreForTests(admin);
    const direct = await admin.createCompany(EMAIL, { slug: "alpha", founderYes: true, why: "blocked" });
    assert.equal(direct.ok, false);
    assert.equal(direct.error, "rate_limiter_unavailable");
    assert.equal(admin.companies.size, 0);
    const blocked = await postTool(
      "create_company",
      { slug: "alpha", founderYes: true, why: "blocked" },
      TOKEN,
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.isError, true);
    assert.equal(blocked.text, "The limiter could not be reached. This action was refused.");
    assert.equal(admin.companies.size, 0);
  });

  it("supabase asResult keeps a refusal off status", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: "rate_limited",
          reason: "rate_limited",
          message: "Limit reached for create_company. Try again after 2026-10-20T00:00:00.000Z.",
          retryAt: "2026-10-20T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    try {
      const admin = new SupabaseCompanyAdminStore("https://db.example", "anon", "token-token-token");
      const created = await admin.createCompany(EMAIL, { slug: "alpha", founderYes: true });
      assert.equal(created.ok, false);
      assert.equal(created.status, undefined);
      assert.equal(created.error, "rate_limited");
      assert.match(created.message, /Try again after/);
      assert.equal(created.retryAt, "2026-10-20T00:00:00.000Z");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HostedMembershipJourneyStore, SupabaseJourneyStore, createJourneyStore } from "../dist/hosted-journey-store.js";
import { kickFounderInviteIfNeeded } from "../dist/server.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import {
  parseWebhookDeliveries,
  postBoardWebhookDeliveries,
} from "../dist/journey-notify.js";

const here = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => setJourneyStoreForTests(undefined));

function actor(email) {
  return { authenticated: true, email, principal: email, identityStore: "memory" };
}

describe("hosted membership journey store", () => {
  it("sends p_founder only when the caller set it", async () => {
    const bodies = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body || "{}")));
      return Response.json({ ok: true, company: { slug: "alpha" }, ideas: [] });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const who = actor("founder@example.test");
      await store.putJourney(who, {
        companySlug: "alpha",
        why: "leave the founder name",
        founderYes: true,
      });
      const puts = () => bodies.filter((body) => typeof body.p_why === "string");
      assert.equal(Object.hasOwn(puts()[0], "p_founder"), false);
      await store.putJourney(who, {
        companySlug: "alpha",
        why: "name the founder",
        founderYes: true,
        founder: "Sam",
      });
      assert.equal(puts()[1].p_founder, "Sam");
      await store.putJourney(who, {
        companySlug: "alpha",
        why: "clear the founder name",
        founderYes: true,
        founder: "",
      });
      assert.equal(puts()[2].p_founder, "");
      await store.putJourney(who, {
        companySlug: "alpha",
        why: "seed a founder",
        founderYes: true,
        client: "bootstrap-bill",
        founderEmail: "founder@example.invalid",
      });
      assert.equal(puts()[3].p_founder_email, "founder@example.invalid");
      assert.equal(Object.hasOwn(puts()[0], "p_founder_email"), false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("supabase store no longer stubs subscriber/ACL writes", () => {
    const src = fs.readFileSync(path.join(here, "..", "src", "hosted-journey-store.ts"), "utf8");
    assert.doesNotMatch(src, /not in this slice/);
    assert.match(src, /bootstrap_os_subscribe_board/);
    assert.match(src, /bootstrap_os_change_acl/);
    assert.match(src, /bootstrap_os_list_provenance/);
    assert.match(src, /bootstrap_os_put_portfolio_score/);
    assert.match(src, /p_why: input.why/);
    assert.match(src, /fireWebhooksAfterWrite/);
  });

  it("lazy-ensures default idea; non-member cannot read; put needs founderYes", async () => {
    const store = new HostedMembershipJourneyStore((a) =>
      a.email === "founder@example.test" ? ["alpha", "charlie"] : [],
    );
    const ivelin = actor("founder@example.test");
    const bill = actor("bill@example.test");
    assert.equal((await store.getJourney(bill, { companySlug: "alpha" })).ok, false);
    assert.equal((await store.getJourney(ivelin, { companySlug: "alpha" })).error, "not_found");
    assert.equal(
      (
        await store.putJourney(ivelin, {
          companySlug: "alpha",
          why: "seed the board",
          founderYes: true,
          constraintThisWeek: "talk",
        })
      ).ok,
      true,
    );
    const board = await store.getJourney(ivelin, { companySlug: "alpha" });
    assert.equal(board.ok, true);
    assert.equal(board.ideas[0].slug, "default");
    assert.ok(Array.isArray(board.owners));
    assert.ok(board.owners.some((row) => row.principal === "founder@example.test"));
    assert.equal(board.ideas[0].clocks.journeyPhase, 1);
    assert.match(board.ideas[0].visualFlow, /mermaid/);
    assert.equal(
      (await store.putJourney(ivelin, { companySlug: "alpha", why: "x", founderYes: false, journeyPhase: 2 })).ok,
      false,
    );
    assert.equal(
      (
        await store.putJourney(ivelin, {
          companySlug: "alpha",
          why: "yes",
          founderYes: true,
          currentGate: "hold",
          constraintThisWeek: "talk",
          gateEnrichment: {
            whatChanged: "named this week's bottleneck",
            whatWereNotDoing: "not a landing-page side quest",
          },
        })
      ).ok,
      true,
    );
    assert.equal((await store.postComment(ivelin, { companySlug: "alpha", body: "note" })).ok, true);
    const after = await store.getJourney(ivelin, { companySlug: "alpha" });
    assert.equal(after.ideas[0].clocks.journeyPhase, 1);
    assert.ok(Array.isArray(after.ideas[0].lastTransitions));
    assert.ok(after.ideas[0].lastTransitions.length >= 1);
    assert.equal(after.ideas[0].lastTransitions[0].who, "founder@example.test");
    assert.deepEqual(after.audit, []);
    assert.equal(after.auditVia, "list_provenance");
    const expanded = await store.getJourney(ivelin, {
      companySlug: "alpha",
      expandMeetingDoc: true,
    });
    assert.ok(Array.isArray(expanded.audit));
    assert.ok(expanded.audit.length >= 1);
    assert.equal(expanded.ideas[0].comments[0].body, "note");
    const created = await store.createIdea(ivelin, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      founderYes: true,
    });
    assert.equal(created.ok, true);
    assert.equal(created.ideas[0].slug, "second-bet");
    assert.equal(created.ideas[0].clocks.currentGate, "hold");
    const missing = await store.putJourney(ivelin, {
      companySlug: "alpha",
      ideaSlug: "not-a-row",
      why: "no",
      founderYes: true,
    });
    assert.equal(missing.ok, false);
    const both = await store.getJourney(ivelin, { companySlug: "alpha" });
    assert.deepEqual(both.ideas.map((i) => i.slug).sort(), ["default", "second-bet"]);
  });

  it("createJourneyStore is null off production; supabase rpc failures stay closed", async () => {
    assert.equal(createJourneyStore("bearer-token-16xxxx"), null);
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key";
    const store = createJourneyStore("bearer-token-16xxxx");
    assert.equal(store?.kind, "supabase");
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Response("nope", { status: 500 });
    try {
      const ivelin = actor("founder@example.test");
      const got = await store.getJourney(ivelin, { companySlug: "alpha" });
      assert.equal(got.ok, false);
      const put = await store.putJourney(ivelin, { companySlug: "alpha", why: "x", founderYes: true });
      assert.equal(put.ok, false);
      const comment = await store.postComment(ivelin, { companySlug: "alpha", body: "x" });
      assert.equal(comment.ok, false);
    } finally {
      globalThis.fetch = orig;
      delete process.env.VERCEL_ENV;
      delete process.env.BOOTSTRAP_SUPABASE_URL;
      delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
    }
  });

  it("supabase store: subscribe/list/unsub/change_acl RPCs; put/comment POST https webhooks; fail does not mutate", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key";
    const store = createJourneyStore("bearer-token-16xxxx");
    assert.equal(store?.kind, "supabase");
    const ivelin = actor("founder@example.test");
    const rpcCalls = [];
    const webhookPosts = [];
    const payload = {
      company: { slug: "alpha", label: "alpha" },
      idea: { slug: "default", name: "alpha" },
      event: "put_journey",
      who: "founder@example.test",
      at: "2026-09-18T00:00:00.000Z",
      summary: "founder yes",
    };
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/")) {
        const name = href.split("/rpc/")[1];
        const body = JSON.parse(String(init?.body || "{}"));
        rpcCalls.push({ name, body });
        if (name === "bootstrap_os_subscribe_board") {
          if (String(body.p_webhook_url || "").startsWith("http://")) {
            return Response.json({ ok: false, error: "webhook URL must be https" });
          }
          if (body.p_principal === "stranger@example.test") {
            return Response.json({ ok: false, error: "subscriber must already have ACL access" });
          }
          return Response.json({
            ok: true,
            subscriber: {
              principal: body.p_principal,
              principalKind: body.p_principal_kind,
              webhookUrl: body.p_webhook_url,
              emailOptIn: Boolean(body.p_email_opt_in),
            },
          });
        }
        if (name === "bootstrap_os_list_subscribers") {
          return Response.json({
            ok: true,
            company: { slug: "alpha", label: "alpha" },
            subscribers: [{ principal: "advisor@example.test", webhookUrl: "https://hooks.example.test/core" }],
          });
        }
        if (name === "bootstrap_os_unsubscribe_board") {
          return Response.json({ ok: true, removed: 1 });
        }
        if (name === "bootstrap_os_change_acl") {
          return Response.json({ ok: true });
        }
        if (name === "bootstrap_os_put_journey") {
          return Response.json({
            ok: true,
            notify: { webhook: 1, emailQueued: 1 },
            webhookDeliveries: [{ url: "https://hooks.example.test/core", payload }],
          });
        }
        if (name === "bootstrap_os_post_comment") {
          return Response.json({
            ok: true,
            clocksUnchanged: true,
            notify: { webhook: 1, emailQueued: 0 },
            webhookDeliveries: [
              {
                url: "https://hooks.example.test/fail",
                payload: { ...payload, event: "post_comment", summary: "note" },
              },
            ],
          });
        }
        if (name === "bootstrap_os_list_webhook_deliveries_for_event") {
          return Response.json({
            ok: true,
            webhookDeliveries: [{ url: "https://hooks.example.test/fallback", payload }],
          });
        }
        return Response.json({ ok: true });
      }
      if (href.startsWith("https://hooks.example.test/")) {
        webhookPosts.push({ url: href, body: JSON.parse(String(init?.body || "{}")) });
        if (href.includes("/fail")) return new Response("nope", { status: 500 });
        return new Response("ok", { status: 200 });
      }
      return new Response("nope", { status: 500 });
    };
    try {
      const http = await store.subscribeBoard(ivelin, {
        companySlug: "alpha",
        principal: "advisor@example.test",
        principalKind: "email",
        webhookUrl: "http://hooks.example.test/insecure",
      });
      assert.equal(http.ok, false);
      assert.match(http.error, /https/);

      const stranger = await store.subscribeBoard(ivelin, {
        companySlug: "alpha",
        principal: "stranger@example.test",
        principalKind: "email",
        webhookUrl: "https://hooks.example.test/core",
      });
      assert.equal(stranger.ok, false);

      const granted = await store.subscribeBoard(ivelin, {
        companySlug: "alpha",
        principal: "advisor@example.test",
        principalKind: "email",
        webhookUrl: "https://hooks.example.test/core",
        emailOptIn: true,
      });
      assert.equal(granted.ok, true);
      assert.equal(
        rpcCalls.some((c) => c.name === "bootstrap_os_subscribe_board" && c.body.p_email_opt_in === true),
        true,
      );

      const listed = await store.listSubscribers(ivelin, { companySlug: "alpha" });
      assert.equal(listed.ok, true);
      assert.equal(listed.subscribers.length, 1);

      const acl = await store.changeAcl(ivelin, {
        companySlug: "alpha",
        principal: "specialist@example.test",
        principalKind: "email",
        role: "advisor",
        op: "grant",
      });
      assert.equal(acl.ok, true);
      assert.equal(rpcCalls.some((c) => c.name === "bootstrap_os_change_acl"), true);

      const wrote = await store.putJourney(ivelin, {
        companySlug: "alpha",
        why: "founder yes",
        founderYes: true,
      });
      assert.equal(wrote.ok, true);
      assert.equal(wrote.notify.webhook, 1);
      assert.equal(webhookPosts.length, 1);
      assert.equal(webhookPosts[0].url, "https://hooks.example.test/core");
      assert.equal(webhookPosts[0].body.event, "put_journey");
      assert.equal(webhookPosts[0].body.company.slug, "alpha");
      assert.equal(webhookPosts[0].body.summary, "founder yes");
      assert.doesNotMatch(JSON.stringify(webhookPosts[0].body), /scoreboard|openQuestions/);

      const commented = await store.postComment(ivelin, { companySlug: "alpha", body: "note" });
      assert.equal(commented.ok, true);
      assert.equal(commented.clocksUnchanged, true);
      assert.equal(webhookPosts.at(-1).url, "https://hooks.example.test/fail");
      assert.equal(webhookPosts.at(-1).body.event, "post_comment");

      const removed = await store.unsubscribeBoard(ivelin, {
        companySlug: "alpha",
        principal: "advisor@example.test",
        principalKind: "email",
      });
      assert.equal(removed.ok, true);
      assert.equal(removed.removed, 1);
    } finally {
      globalThis.fetch = orig;
      delete process.env.VERCEL_ENV;
      delete process.env.BOOTSTRAP_SUPABASE_URL;
      delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
    }
  });

  it("supabase put falls back to list_webhook_deliveries_for_event; parse rejects http", async () => {
    assert.deepEqual(parseWebhookDeliveries({ webhookDeliveries: [{ url: "http://x", payload: {} }] }), []);
    const posted = await postBoardWebhookDeliveries(
      [{ url: "https://hooks.example.test/ok", payload: { event: "put_journey" } }],
      async () => {
        throw new Error("network");
      },
    );
    assert.equal(posted.failed, 1);

    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key";
    const store = createJourneyStore("bearer-token-16xxxx");
    const ivelin = actor("founder@example.test");
    const rpcCalls = [];
    const webhookPosts = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/")) {
        const name = href.split("/rpc/")[1];
        rpcCalls.push(name);
        if (name === "bootstrap_os_put_journey") return Response.json({ ok: true });
        if (name === "bootstrap_os_list_webhook_deliveries_for_event") {
          return Response.json({
            ok: true,
            webhookDeliveries: [
              {
                url: "https://hooks.example.test/fallback",
                payload: {
                  company: { slug: "alpha", label: "alpha" },
                  idea: { slug: "default", name: "alpha" },
                  event: "put_journey",
                  who: "founder@example.test",
                  at: "2026-09-18T00:00:00.000Z",
                  summary: "board write",
                },
              },
            ],
          });
        }
        return Response.json({ ok: true });
      }
      webhookPosts.push(href);
      return new Response("ok", { status: 200 });
    };
    try {
      const wrote = await store.putJourney(ivelin, {
        companySlug: "alpha",
        why: "yes",
        founderYes: true,
      });
      assert.equal(wrote.ok, true);
      assert.equal(rpcCalls.includes("bootstrap_os_list_webhook_deliveries_for_event"), true);
      assert.deepEqual(webhookPosts, ["https://hooks.example.test/fallback"]);
    } finally {
      globalThis.fetch = orig;
      delete process.env.VERCEL_ENV;
      delete process.env.BOOTSTRAP_SUPABASE_URL;
      delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
    }
  });

  it("maps founder_email_required and company not visible PostgREST bodies", async () => {
    const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
    const ivelin = actor("founder@example.test");
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json(
        { code: "P0001", message: "founder_email_required: pass founderEmail" },
        { status: 400 },
      );
    try {
      const put = await store.putJourney(ivelin, { companySlug: "newco", why: "seed", founderYes: true });
      assert.equal(put.ok, false);
      assert.equal(put.error, "founder_email_required");
      assert.equal(put.message, "This board needs its founder's email. Pass founderEmail.");
    } finally {
      globalThis.fetch = orig;
    }
    globalThis.fetch = async () =>
      Response.json({ code: "P0001", message: "company not visible" }, { status: 400 });
    try {
      const got = await store.getJourney(ivelin, { companySlug: "other-team" });
      assert.equal(got.ok, false);
      assert.equal(got.error, "not_found");
      assert.equal(got.message, "Board not found.");
    } finally {
      globalThis.fetch = orig;
    }
    globalThis.fetch = async () =>
      Response.json({ code: "P0001", message: "invalid_founder_email" }, { status: 400 });
    try {
      const bad = await store.putJourney(ivelin, {
        companySlug: "newco",
        why: "seed",
        founderYes: true,
        founderEmail: "not-an-email",
      });
      assert.equal(bad.ok, false);
      assert.equal(bad.error, "invalid_founder_email");
      assert.equal(bad.message, "founderEmail isn't a valid email address.");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("maps forbidden_role from a PostgREST 400 and a 200 jsonb body", async () => {
    const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
    const ivelin = actor("commenter@example.invalid");
    const plain = "Your role on this board can comment, but not edit. Ask the founder to invite you to edit.";
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json(
        { code: "P0001", message: "forbidden_role" },
        { status: 400 },
      );
    try {
      const put = await store.putJourney(ivelin, { companySlug: "alpha", why: "no", founderYes: true });
      assert.equal(put.ok, false);
      assert.equal(put.error, "forbidden_role");
      assert.equal(put.message, plain);
    } finally {
      globalThis.fetch = orig;
    }
    globalThis.fetch = async () =>
      Response.json(
        { ok: false, error: "forbidden_role", message: "Ask the founder." },
        { status: 200 },
      );
    try {
      const put = await store.putJourney(ivelin, { companySlug: "alpha", why: "no", founderYes: true });
      assert.equal(put.ok, false);
      assert.equal(put.error, "forbidden_role");
      assert.equal(put.message, "Ask the founder.");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("attaches Board not found when get_journey returns not_found without a message", async () => {
    const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
    const ivelin = actor("reader@example.invalid");
    const orig = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({ ok: false, error: "not_found" }, { status: 200 });
    try {
      const got = await store.getJourney(ivelin, { companySlug: "missing" });
      assert.deepEqual(got, { ok: false, error: "not_found", message: "Board not found." });
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("kicks founder invite mail on create and not on self-create or a later put", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    const prevEnv = process.env.VERCEL_ENV;
    const prevSecret = process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_INVITE_MAIL_SECRET = "test-secret";
    delete process.env.BOOTSTRAP_INVITE_MAIL_URL;
    let puts = 0;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      calls.push(target);
      if (target.includes("/api/bootstrap-os/invite-mail")) return new Response("ok", { status: 202 });
      const body = JSON.parse(String(init?.body || "{}"));
      if (target.includes("bootstrap_os_put_journey")) {
        puts += 1;
        const differ = body.p_founder_email === "founder@example.test";
        return Response.json({
          ok: true,
          notify: { webhook: 0, emailQueued: 0 },
          company: { slug: body.p_company, label: body.p_company },
          ideas: [{ clocks: { journeyPhase: 1, currentGate: "hold" }, scoreboard: {} }],
          ...(puts === 1 && differ
            ? {
                founderInvite: {
                  inviteeEmail: "founder@example.test",
                  invitedByEmail: "admin@example.invalid",
                  companyLabel: body.p_company,
                  inviteToken: "inv_fixture",
                },
              }
            : {}),
        });
      }
      return Response.json({ ok: true });
    };
    try {
      const store = new SupabaseJourneyStore("https://example.supabase.co", "anon-test-key", "token");
      const who = actor("admin@example.invalid");
      const created = await store.putJourney(who, {
        companySlug: "alpha",
        why: "open alpha",
        founderYes: true,
        founderEmail: "founder@example.test",
      });
      assert.equal(created.founderInvite, undefined);
      assert.equal(created.notify.emailQueued, 0);
      await store.putJourney(who, {
        companySlug: "bravo",
        why: "self board",
        founderYes: true,
        founderEmail: "admin@example.invalid",
      });
      await store.putJourney(who, {
        companySlug: "alpha",
        why: "later write",
        founderYes: true,
        founderEmail: "founder@example.test",
      });
      assert.equal(calls.filter((url) => url.includes("/api/bootstrap-os/invite-mail")).length, 1);
    } finally {
      globalThis.fetch = orig;
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
      else process.env.BOOTSTRAP_INVITE_MAIL_SECRET = prevSecret;
    }
  });

  it("memory mirror mails a different founder once", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    const prevEnv = process.env.VERCEL_ENV;
    const prevSecret = process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_INVITE_MAIL_SECRET = "test-secret";
    delete process.env.BOOTSTRAP_INVITE_MAIL_URL;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response("ok", { status: 202 });
    };
    try {
      const store = new HostedMembershipJourneyStore((a) =>
        a.email === "admin@example.invalid" ? ["alpha", "bravo"] : [],
      );
      const who = actor("admin@example.invalid");
      const created = await store.putJourney(who, {
        companySlug: "alpha",
        why: "open alpha",
        founderYes: true,
        founderEmail: "founder@example.test",
      });
      assert.equal(created.founderInvite, undefined);
      assert.equal(JSON.stringify(created).includes("inv_"), false);
      await store.putJourney(who, {
        companySlug: "bravo",
        why: "self board",
        founderYes: true,
        founderEmail: "admin@example.invalid",
      });
      await store.putJourney(who, {
        companySlug: "alpha",
        why: "later write",
        founderYes: true,
      });
      assert.equal(calls.filter((url) => url.includes("/api/bootstrap-os/invite-mail")).length, 1);
    } finally {
      globalThis.fetch = orig;
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
      else process.env.BOOTSTRAP_INVITE_MAIL_SECRET = prevSecret;
    }
  });

  it("server strips a leftover founder invite and kicks mail once", async () => {
    const calls = [];
    const orig = globalThis.fetch;
    const prevEnv = process.env.VERCEL_ENV;
    const prevSecret = process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_INVITE_MAIL_SECRET = "test-secret";
    delete process.env.BOOTSTRAP_INVITE_MAIL_URL;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response("ok", { status: 202 });
    };
    try {
      const cleaned = kickFounderInviteIfNeeded({
        ok: true,
        notify: { emailQueued: 2 },
        founderInvite: {
          inviteeEmail: "founder@example.test",
          invitedByEmail: "admin@example.invalid",
          companyLabel: "charlie",
          inviteToken: "inv_fixture",
        },
      });
      assert.equal(cleaned.founderInvite, undefined);
      assert.equal(cleaned.notify.emailQueued, 2);
      assert.equal(calls.length, 1);
      const plain = kickFounderInviteIfNeeded({ ok: true, notify: { emailQueued: 0 } });
      assert.equal(plain.notify.emailQueued, 0);
      assert.equal(calls.length, 1);
    } finally {
      globalThis.fetch = orig;
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
      else process.env.BOOTSTRAP_INVITE_MAIL_SECRET = prevSecret;
    }
  });
});

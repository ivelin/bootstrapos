/**
 * submit_feedback: append-only ticket, token identity, no mail, no board write.
 * Memory + hosted handler. Never supabase-pirin-ai.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { IVELIN_SEED_EMAIL, ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import {
  MemoryFeedbackStore,
  createSupabaseFeedbackStore,
  feedbackFingerprint,
  parseFeedbackAck,
  prepareFeedback,
  redactFeedbackText,
  resolveFeedbackStore,
  setFeedbackStoreForTests,
  ticketToRpcBody,
} from "../dist/feedback.js";

const TOKEN = "bos_ivelin_fixture_token_xx";
const STAMP_A = { actorId: "actor-a", tenantId: "actor-a", actorEmail: "a@example.test" };
const STAMP_B = { actorId: "actor-b", tenantId: "actor-b", actorEmail: "b@example.test" };

afterEach(() => {
  setFeedbackStoreForTests(undefined);
  setIdentityStoreForTests(undefined);
  delete process.env.VERCEL_ENV;
  delete process.env.BOOTSTRAP_SUPABASE_URL;
  delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
});

function filed(raw, stamp = STAMP_A) {
  const prepared = prepareFeedback(raw, stamp);
  assert.equal(prepared.ok, true, prepared.ok ? "" : prepared.error);
  return prepared.ticket;
}

describe("submit_feedback prepare", () => {
  it("keeps the actor email and redacts secrets and other people", () => {
    const text = redactFeedbackText(
      "a@example.test saw other@example.test Bearer abcdefghijklmnop sk_live_abcdefgh postgres://u:p@db/x Cookie: session=1 415-555-1212",
      "a@example.test",
    );
    assert.match(text, /a@example\.test/);
    assert.doesNotMatch(text, /other@example\.test|Bearer abc|sk_live_|postgres:\/\/|Cookie:|415-555-1212/);
  });

  it("stamps the token account and ignores a body tenant", () => {
    const ticket = filed({
      kind: "bug",
      summary: "The board did not load",
      user_consented: true,
      tenant_id: "actor-b",
      actor_id: "actor-b",
      product: "office-receptionist",
      company: "bravo",
    });
    assert.equal(ticket.actorId, "actor-a");
    assert.equal(ticket.tenantId, "actor-a");
    assert.equal(ticket.product, "bootstrap-os");
    assert.equal(ticket.contextLevel, "identity_only");
    assert.equal(ticket.severity, "annoying");
    assert.equal(
      ticket.fingerprint,
      feedbackFingerprint({ kind: "bug", summary: "The board did not load" }),
    );
  });

  it("rejects a missing yes, a packed trace, and an empty pasted note", () => {
    assert.equal(
      prepareFeedback({ kind: "bug", summary: "x", user_consented: false }, STAMP_A).error,
      "Needs a yes in this chat.",
    );
    assert.equal(
      prepareFeedback(
        { kind: "bug", summary: "x", user_consented: true, reasoning: "hidden chain" },
        STAMP_A,
      ).error,
      "Leave the trace off this ticket.",
    );
    assert.equal(
      prepareFeedback(
        { kind: "docs", summary: "x", user_consented: true, context_level: "reasoning_trace" },
        STAMP_A,
      ).error,
      "Needs the pasted note.",
    );
  });

  it("stores argument names only when the person agreed to a tool trace", () => {
    const ticket = filed({
      kind: "bug",
      summary: "get_journey failed",
      user_consented: true,
      context_level: "tool_trace",
      tool: "get_journey",
      argument_keys: ["company"],
      error_code: "not_found",
      latency_ms: 40,
    });
    assert.deepEqual(ticket.argumentKeys, ["company"]);
    assert.equal(ticket.errorCode, "not_found");
    assert.equal(ticket.reasoning, null);
    const body = ticketToRpcBody(ticket);
    assert.equal(body.actor_id, undefined);
    assert.equal(body.tenant_id, undefined);
    assert.equal(body.user_consented, true);
    assert.deepEqual(body.argument_keys, ["company"]);
  });
});

describe("submit_feedback store", () => {
  it("dedupes one account and hides the other account's ticket", async () => {
    const store = new MemoryFeedbackStore();
    const first = await store.submit(filed({ kind: "missing_capability", summary: "Need a quieter card", user_consented: true }));
    const again = await store.submit(filed({ kind: "missing_capability", summary: "Need a quieter card", user_consented: true }));
    const other = await store.submit(
      filed({ kind: "missing_capability", summary: "Need a quieter card", user_consented: true }, STAMP_B),
      Date.now(),
    );
    assert.equal(first.ok && again.ok && other.ok, true);
    assert.equal(again.duplicate, true);
    assert.equal(again.id, first.id);
    assert.notEqual(other.id, first.id);
    assert.equal(store.listFor("actor-b").length, 1);
    assert.doesNotMatch(JSON.stringify(store.listFor("actor-b")), new RegExp(first.id));
    assert.equal(JSON.stringify(first).includes("summary"), false);
  });

  it("treats a submission id as a one-day idempotency key", async () => {
    const store = new MemoryFeedbackStore();
    const raw = {
      kind: "docs",
      summary: "The first wording",
      user_consented: true,
      submissionId: "idempo-key-1",
    };
    const first = await store.submit(filed(raw));
    const second = await store.submit(filed({ ...raw, summary: "A different wording" }));
    assert.equal(second.id, first.id);
    assert.equal(second.duplicate, true);
    assert.equal(store.rows.length, 1);
  });
});

describe("submit_feedback hosted tool", () => {
  it("is closed without a token and files one line when this login says yes", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
    const store = new MemoryFeedbackStore();
    setFeedbackStoreForTests(store);
    const closed = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "submit_feedback",
            arguments: { kind: "bug", summary: "Closed probe", user_consented: true },
          },
        }),
      }),
    );
    assert.equal(closed.status, 401);
    assert.equal(store.rows.length, 0);

    const open = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${TOKEN}`,
          "mcp-protocol-version": "2025-03-26",
          "user-agent": "feedback-test",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "submit_feedback",
            arguments: {
              kind: "bug",
              summary: `Hello ${IVELIN_SEED_EMAIL} and stranger@example.test Bearer tok_abcdefghij`,
              user_consented: true,
              tenant_id: "not-this-account",
            },
          },
        }),
      }),
    );
    assert.equal(open.status, 200);
    const body = JSON.parse(await open.text());
    const ack = JSON.parse(body.result.content.map((part) => part.text).join(""));
    assert.equal(ack.ok, true);
    assert.match(ack.line, /^Filed fb_[0-9a-f]+. A person reads it\.$/);
    assert.equal(ack.duplicate, false);
    assert.equal(ack.summary, undefined);
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].actorId, IVELIN_SEED_EMAIL);
    assert.equal(store.rows[0].tenantId, IVELIN_SEED_EMAIL);
    assert.match(store.rows[0].summary, /founder@example\.test/);
    assert.doesNotMatch(store.rows[0].summary, /stranger@example\.test|Bearer tok_/);
    assert.equal(store.rows[0].protocolVersion, "2025-03-26");
    assert.equal(store.rows[0].httpUserAgent, "feedback-test");
  });

  it("does not attach a live database outside production", () => {
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.test";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon";
    assert.equal(createSupabaseFeedbackStore("token-token-token"), null);
    assert.equal(resolveFeedbackStore("token-token-token"), null);
    process.env.VERCEL_ENV = "production";
    assert.ok(createSupabaseFeedbackStore("token-token-token"));
  });

  it("calls the rpc with the ticket and does not echo a failed body", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_SUPABASE_URL = "https://db.example.test";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key";
    const live = createSupabaseFeedbackStore("signed-token-value");
    const original = global.fetch;
    let seen;
    global.fetch = async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ secret: "other-tenant" }), { status: 500 });
    };
    try {
      const result = await live.submit(
        filed({ kind: "bug", summary: "The board did not load", user_consented: true }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.error, "feedback_rpc_failed:500");
      assert.doesNotMatch(result.error, /other-tenant|secret/);
      assert.match(String(seen.url), /\/rpc\/bootstrap_os_submit_feedback$/);
      const sent = JSON.parse(seen.init.body);
      assert.equal(sent.p_body.actor_id, undefined);
      assert.equal(sent.p_body.tenant_id, undefined);
      assert.equal(sent.p_body.summary, "The board did not load");
      assert.match(seen.init.headers.Authorization, /^Bearer signed-token-value$/);
    } finally {
      global.fetch = original;
    }
    assert.deepEqual(parseFeedbackAck({ ok: true, id: "fb_abc", line: "Filed fb_abc. A person reads it.", duplicate: false }).id, "fb_abc");
  });
});

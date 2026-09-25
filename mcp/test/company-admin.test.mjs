/**
 * Hosted admin tools. Memory + mocked fetch. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  MemoryCompanyAdminStore,
  SupabaseCompanyAdminStore,
  askAdminResult,
  createCompanyAdminStore,
  publicAdminResult,
  setCompanyAdminStoreForTests,
} from "../dist/company-admin.js";
import {
  ivelinMemoryFixture,
  setIdentityStoreForTests,
} from "../dist/identity.js";

const TOKEN = "bos_ivelin_fixture_token_ok";
const OTHER = "bos_other_token_fixture_xx";
const CANARY = "bravo-only-canary-token";

afterEach(() => {
  setCompanyAdminStoreForTests(undefined);
  setIdentityStoreForTests(undefined);
  delete process.env.VERCEL_ENV;
  delete process.env.BOOTSTRAP_SUPABASE_URL;
  delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
});

function store() {
  const admin = new MemoryCompanyAdminStore([
    { email: "founder@example.test", role: "super_admin", labels: ["alpha", "bravo"] },
    { email: "other@example.test", role: "member", labels: ["secret-other"] },
  ]);
  admin.companies.set("bravo", { displayName: CANARY, createdBy: "founder@example.test" });
  return admin;
}

async function callTool(name, args, token = TOKEN) {
  setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
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
  const text = await res.text();
  assert.equal(res.status, 200, text);
  const body = JSON.parse(text);
  const payload = body.result.content.map((part) => part.text ?? "").join("\n");
  return JSON.parse(payload);
}

describe("company admin result shape", () => {
  it("403 drops leaked fields; 409 keeps slug_taken only", () => {
    const denied = publicAdminResult({
      ok: false,
      status: 403,
      slug: "bravo",
      email: "mentee-b@example.test",
      displayName: CANARY,
    });
    assert.deepEqual(denied, { ok: false, status: 403 });
    assert.doesNotMatch(JSON.stringify(denied), new RegExp(CANARY));
    assert.deepEqual(
      publicAdminResult({ ok: false, status: 403, error: "self_grant", slug: "bravo" }),
      { ok: false, status: 403, error: "self_grant" },
    );
    assert.deepEqual(publicAdminResult({ ok: false, error: "slug_taken", labels: ["bravo"] }), {
      ok: false,
      status: 409,
      error: "slug_taken",
    });
    assert.deepEqual(
      publicAdminResult({
        ok: false,
        status: 409,
        error: "last_super_admin",
        email: "founder@example.test",
        slug: "bravo",
      }),
      { ok: false, status: 409, error: "last_super_admin" },
    );
    assert.deepEqual(
      publicAdminResult({ ok: false, status: 409, error: "internal_detail", slug: "bravo" }),
      { ok: false, status: 409, error: "slug_taken" },
    );
    assert.deepEqual(askAdminResult(), { ok: false, status: 403, error: "ask_admin" });
  });

  it("memory store: member 403, self-grant 403, revoke 403, duplicate 409, no leak, audit", async () => {
    const admin = store();
    const member = await admin.createCompany("other@example.test", {
      slug: "delta",
      founderYes: true,
      why: "nope",
    });
    assert.deepEqual(member, { ok: false, status: 403 });
    assert.doesNotMatch(JSON.stringify(member), new RegExp(CANARY));

    const self = await admin.grantSuperAdmin("founder@example.test", "founder@example.test");
    assert.equal(self.status, 403);
    assert.equal(self.error, "self_grant");

    const stranger = await admin.grantSuperAdmin("other@example.test", "stranger@example.test");
    assert.deepEqual(stranger, { ok: false, status: 403 });

    const granted = await admin.grantSuperAdmin("founder@example.test", "other@example.test");
    assert.equal(granted.ok, true);
    const revoked = await admin.revokeSuperAdmin("founder@example.test", "other@example.test");
    assert.equal(revoked.role, "member");
    const after = await admin.createCompany("other@example.test", {
      slug: "echo",
      founderYes: true,
    });
    assert.equal(after.status, 403);

    const missingYes = await admin.createCompany("founder@example.test", {
      slug: "delta",
      founderYes: false,
    });
    assert.equal(missingYes.error, "founder_yes_required");
    const bad = await admin.createCompany("founder@example.test", {
      slug: "Bad Slug",
      founderYes: true,
    });
    assert.equal(bad.error, "invalid_slug");

    const created = await admin.createCompany("founder@example.test", {
      slug: "delta",
      displayName: "Delta",
      founderYes: true,
      why: "separate",
    });
    assert.equal(created.ok, true);
    assert.equal(created.slug, "delta");
    assert.doesNotMatch(JSON.stringify(created), new RegExp(CANARY));
    const dup = await admin.createCompany("founder@example.test", {
      slug: "bravo",
      founderYes: true,
    });
    assert.equal(dup.status, 409);
    assert.ok(admin.audit.some((row) => row.op === "grant_super_admin"));
    assert.ok(admin.audit.some((row) => row.op === "create_company" && row.slug === "delta"));

    const auditBefore = admin.audit.length;
    const last = await admin.revokeSuperAdmin("founder@example.test", "founder@example.test");
    assert.deepEqual(last, { ok: false, status: 409, error: "last_super_admin" });
    assert.equal(admin.audit.length, auditBefore);
    const still = await admin.createCompany("founder@example.test", {
      slug: "foxtrot",
      founderYes: true,
    });
    assert.equal(still.ok, true);
  });

  it("supabase client fail-closes HTTP errors and strips 403 bodies", async () => {
    const orig = globalThis.fetch;
    const admin = new SupabaseCompanyAdminStore("https://db.example", "anon", "token-token-token");
    globalThis.fetch = async (url) => {
      const name = String(url);
      if (name.endsWith("bootstrap_os_create_company")) {
        return new Response(
          JSON.stringify({ ok: false, status: 403, displayName: CANARY, labels: ["bravo"] }),
          { status: 200 },
        );
      }
      if (name.endsWith("bootstrap_os_grant_super_admin")) {
        return new Response(CANARY, { status: 500 });
      }
      return new Response(
        JSON.stringify({ ok: true, email: "other@example.test", role: "member", leak: CANARY }),
        { status: 200 },
      );
    };
    try {
      const created = await admin.createCompany("founder@example.test", {
        slug: "delta",
        founderYes: true,
      });
      assert.deepEqual(created, { ok: false, status: 403 });
      const granted = await admin.grantSuperAdmin("founder@example.test", "other@example.test");
      assert.deepEqual(granted, { ok: false, status: 403 });
      assert.doesNotMatch(JSON.stringify(granted), new RegExp(CANARY));
      const revoked = await admin.revokeSuperAdmin("founder@example.test", "other@example.test");
      assert.equal(revoked.ok, true);
      assert.equal(revoked.role, "member");
      assert.equal(revoked.leak, undefined);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("preview does not attach a live store", () => {
    process.env.BOOTSTRAP_SUPABASE_URL = "https://db.example";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon";
    assert.equal(createCompanyAdminStore("token-token-token"), null);
    process.env.VERCEL_ENV = "production";
    assert.ok(createCompanyAdminStore("token-token-token"));
    assert.equal(createCompanyAdminStore(undefined), null);
  });

  it("hosted tools: member 403, unset store asks admin, super admin create does not leak", async () => {
    setCompanyAdminStoreForTests(null);
    const ask = await callTool("create_company", {
      slug: "delta",
      founderYes: true,
      why: "x",
    });
    assert.deepEqual(ask, { ok: false, status: 403, error: "ask_admin" });

    setCompanyAdminStoreForTests(store());
    const member = await callTool(
      "create_company",
      { slug: "delta", founderYes: true, why: "x" },
      OTHER,
    );
    assert.deepEqual(publicAdminResult(member), { ok: false, status: 403 });
    assert.doesNotMatch(JSON.stringify(member), new RegExp(CANARY));

    const created = await callTool("create_company", {
      slug: "delta",
      displayName: "Delta",
      founderYes: true,
      why: "separate",
    });
    assert.equal(created.ok, true);
    assert.equal(created.slug, "delta");
    assert.doesNotMatch(JSON.stringify(created), new RegExp(CANARY));
    assert.equal(created.idea, undefined);
  });
});

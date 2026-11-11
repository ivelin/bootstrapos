/**
 * Audience-bound at+jwt (ES256) vs GoTrue session JWT.
 * Local keys and a mocked JWKS only. Fictional addresses. Never print secrets.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { clearHostedCompanyContextForTests } from "../dist/hosted-company-context.js";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  setIdentityStoreForTests,
  SupabaseIdentityStore,
} from "../dist/identity.js";
import {
  BOUND_TOKEN_AUDIENCE_ENV,
  BOUND_TOKEN_ISSUER_ENV,
  BOUND_TOKEN_JWKS_URL_ENV,
  BOUND_TOKEN_JWT_SECRET_ENV,
  DEFAULT_BOUND_TOKEN_AUDIENCE,
  DEFAULT_BOUND_TOKEN_ISSUER,
  DEFAULT_BOUND_TOKEN_JWKS_URL,
  databaseBearerForPresentedToken,
  setBoundTokenJwksForTests,
  verifyBoundAccessToken,
} from "../dist/bound-token.js";
import { wwwAuthenticateChallenge } from "../dist/oauth.js";
import { ACCEPT_SESSION_JWT_ENV, toolScopeCallRefusal } from "../dist/tool-scopes.js";

const EMAIL = "founder@example.test";
const SUB = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "https://mcp.bootstrap.pirin.ai/mcp";

let publicJwk;
let privateKey;
let otherPrivateKey;

async function keys() {
  if (privateKey) return;
  const primary = await generateKeyPair("ES256", { extractable: true });
  privateKey = primary.privateKey;
  publicJwk = await exportJWK(primary.publicKey);
  publicJwk.kid = "test-kid";
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  otherPrivateKey = (await generateKeyPair("ES256", { extractable: true })).privateKey;
  setBoundTokenJwksForTests(createLocalJWKSet({ keys: [publicJwk] }));
}

function installJwks() {
  setBoundTokenJwksForTests(createLocalJWKSet({ keys: [publicJwk] }));
}

async function mint(overrides = {}) {
  await keys();
  const now = Math.floor(Date.now() / 1000);
  const {
    alg = "ES256",
    typ = "at+jwt",
    kid = "test-kid",
    iss = DEFAULT_BOUND_TOKEN_ISSUER,
    aud = DEFAULT_BOUND_TOKEN_AUDIENCE,
    scope = "bootstrap-os",
    email = EMAIL,
    sub = SUB,
    exp = now + 3600,
    iat = now,
    key = privateKey,
    extra = {},
  } = overrides;
  const claims = { scope, email, ...extra };
  const jwt = new SignJWT(claims).setProtectedHeader({ alg, typ, kid }).setIssuer(iss).setSubject(sub).setIssuedAt(iat).setExpirationTime(exp);
  if (Array.isArray(aud)) jwt.setAudience(aud);
  else if (aud !== undefined) jwt.setAudience(aud);
  return jwt.sign(key);
}

function mcpRequest(token, tool = "bootstrap_whoami", args = {}) {
  return new Request(`${RESOURCE}`, {
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
      params: { name: tool, arguments: args },
    }),
  });
}

function toolJson(res, text) {
  const body = JSON.parse(text);
  const raw = body.result.content.map((part) => part.text ?? "").join("\n");
  return JSON.parse(raw);
}

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setBoundTokenJwksForTests(undefined);
  clearHostedCompanyContextForTests();
  delete process.env[ACCEPT_SESSION_JWT_ENV];
  delete process.env[BOUND_TOKEN_ISSUER_ENV];
  delete process.env[BOUND_TOKEN_AUDIENCE_ENV];
  delete process.env[BOUND_TOKEN_JWKS_URL_ENV];
  delete process.env[BOUND_TOKEN_JWT_SECRET_ENV];
});

describe("bound at+jwt", () => {
  it("accepts a valid token and whoami returns the claims identity", async () => {
    await keys();
    installJwks();
    process.env[BOUND_TOKEN_JWT_SECRET_ENV] = "test-only-supabase-jwt-secret";
    const calls = [];
    const prev = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), authorization: init?.headers?.Authorization });
      return new Response(
        JSON.stringify({ authenticated: true, email: EMAIL, labels: ["alpha"], role: "member" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
    try {
      const token = await mint();
      const req = mcpRequest(token);
      const res = await handleHostedReadFetch(req);
      const text = await res.text();
      assert.equal(res.status, 200, text);
      const who = toolJson(res, text);
      assert.equal(who.authenticated, true);
      assert.equal(who.email, EMAIL);
      assert.equal(who.sub, SUB);
      assert.equal(toolScopeCallRefusal("bootstrap_whoami", token), null);
      assert.ok(calls.length >= 1);
      assert.ok(calls.every((call) => !call.url.includes("/auth/v1/user")));
      assert.ok(calls.every((call) => call.authorization !== `Bearer ${token}`));
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("uses env issuer, audience, and JWKS URL", async () => {
    await keys();
    process.env[BOUND_TOKEN_ISSUER_ENV] = "https://issuer.example.test/login";
    process.env[BOUND_TOKEN_AUDIENCE_ENV] = "https://resource.example.test/mcp";
    process.env[BOUND_TOKEN_JWKS_URL_ENV] = "https://jwks.example.test/keys.json";
    let fetches = 0;
    const prev = globalThis.fetch;
    globalThis.fetch = async (url) => {
      fetches += 1;
      assert.equal(String(url), "https://jwks.example.test/keys.json");
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const token = await mint({
        iss: "https://issuer.example.test/login",
        aud: "https://resource.example.test/mcp",
      });
      const first = await verifyBoundAccessToken(token);
      const second = await verifyBoundAccessToken(token);
      assert.equal(first?.email, EMAIL);
      assert.equal(second?.sub, SUB);
      assert.equal(fetches, 1);
      assert.equal(DEFAULT_BOUND_TOKEN_JWKS_URL, "https://www.pirin.ai/.well-known/jwks.json");
      assert.equal(DEFAULT_BOUND_TOKEN_ISSUER, "https://www.pirin.ai/bootstrap-os/login");
      assert.equal(DEFAULT_BOUND_TOKEN_AUDIENCE, RESOURCE);
    } finally {
      globalThis.fetch = prev;
    }
  });

  async function assertRejected(token) {
    await keys();
    installJwks();
    const calls = [];
    const prev = globalThis.fetch;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      throw new Error("gotrue must not be called");
    };
    setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
    try {
      const req = mcpRequest(token);
      const res = await handleHostedReadFetch(req);
      const text = await res.text();
      assert.equal(res.status, 401, text);
      assert.equal(res.headers.get("www-authenticate"), wwwAuthenticateChallenge(req));
      const body = JSON.parse(text);
      assert.equal(body.error, "invalid_token");
      assert.equal(body.reason, "invalid_or_revoked_token");
      assert.equal(calls.length, 0);
    } finally {
      globalThis.fetch = prev;
    }
  }

  it("rejects wrong aud, wrong iss, expired, missing scope, bad alg, unknown kid, bad signature", async () => {
    await keys();
    const now = Math.floor(Date.now() / 1000);
    const hsKey = new TextEncoder().encode("test-only-hs256-key");
    await assertRejected(await mint({ aud: "https://other.example.test/mcp" }));
    await assertRejected(await mint({ iss: "https://other.example.test/login" }));
    await assertRejected(await mint({ exp: now - 120 }));
    await assertRejected(await mint({ scope: "openid" }));
    await assertRejected(await mint({ alg: "HS256", key: hsKey, kid: "hs" }));
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "at+jwt", kid: "test-kid" })).toString("base64url");
    const nonePayload = Buffer.from(
      JSON.stringify({
        iss: DEFAULT_BOUND_TOKEN_ISSUER,
        aud: DEFAULT_BOUND_TOKEN_AUDIENCE,
        sub: SUB,
        email: EMAIL,
        scope: "bootstrap-os",
        exp: now + 3600,
      }),
    ).toString("base64url");
    await assertRejected(`${noneHeader}.${nonePayload}.`);
    await assertRejected(await mint({ kid: "not-in-jwks" }));
    await assertRejected(await mint({ key: otherPrivateKey }));
    await assertRejected(await mint({ aud: [DEFAULT_BOUND_TOKEN_AUDIENCE, "https://other.example.test/mcp"] }));
    installJwks();
    const skewed = await verifyBoundAccessToken(await mint({ exp: now - 30, iat: now - 120 }));
    assert.equal(skewed?.email, EMAIL);
    assert.equal(await verifyBoundAccessToken(await mint({ exp: now - 90, iat: now - 200 })), null);
    process.env[BOUND_TOKEN_JWT_SECRET_ENV] = "test-only-supabase-jwt-secret";
    const skewToken = await mint({ exp: now - 30, iat: now - 120 });
    const minted = await databaseBearerForPresentedToken(skewToken, process.env, new Date(now * 1000));
    assert.ok(minted);
    const mintedExp = JSON.parse(Buffer.from(minted.split(".")[1], "base64url").toString("utf8")).exp;
    assert.ok(mintedExp > now);
  });

  it("mints an authenticated PostgREST bearer and does not forward the at+jwt", async () => {
    await keys();
    installJwks();
    process.env[BOUND_TOKEN_JWT_SECRET_ENV] = "test-only-supabase-jwt-secret";
    const token = await mint();
    const db = await databaseBearerForPresentedToken(token);
    assert.ok(db);
    assert.notEqual(db, token);
    const header = JSON.parse(Buffer.from(db.split(".")[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(db.split(".")[1], "base64url").toString("utf8"));
    assert.equal(header.alg, "HS256");
    assert.equal(payload.role, "authenticated");
    assert.equal(payload.email, EMAIL);
    assert.equal(payload.sub, SUB);
    assert.equal(payload.aud, "authenticated");

    const seen = [];
    const prev = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      seen.push({ url: String(url), authorization: init?.headers?.Authorization });
      return new Response(
        JSON.stringify({
          authenticated: true,
          email: EMAIL,
          labels: ["alpha"],
          role: "member",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
    try {
      const res = await handleHostedReadFetch(mcpRequest(token));
      const text = await res.text();
      assert.equal(res.status, 200, text);
      const who = toolJson(res, text);
      assert.equal(who.email, EMAIL);
      assert.equal(who.sub, SUB);
      assert.deepEqual(who.labels, ["alpha"]);
      assert.equal(seen.length, 1);
      assert.match(seen[0].url, /\/rest\/v1\/rpc\/bootstrap_mcp_my_labels$/);
      assert.ok(seen[0].authorization?.startsWith("Bearer "));
      const sent = seen[0].authorization.slice("Bearer ".length);
      assert.notEqual(sent, token);
      const sentPayload = JSON.parse(Buffer.from(sent.split(".")[1], "base64url").toString("utf8"));
      assert.equal(sentPayload.role, "authenticated");
      assert.equal(sentPayload.email, EMAIL);
      assert.equal(sentPayload.sub, SUB);
    } finally {
      globalThis.fetch = prev;
    }
  });
});

function assertClosedTraffic(calls, presented) {
  assert.ok(calls.every((call) => !call.url.includes("/auth/v1/user")));
  for (const call of calls) {
    const header = call.authorization ?? "";
    assert.notEqual(header, `Bearer ${presented}`);
    if (!header.startsWith("Bearer ")) continue;
    const payload = JSON.parse(Buffer.from(header.slice("Bearer ".length).split(".")[1], "base64url").toString("utf8"));
    assert.notEqual(payload.role, "service_role");
    if (call.url.includes("/rest/")) {
      assert.equal(payload.role, "authenticated");
    }
  }
}

async function assertClosed(secret) {
  await keys();
  installJwks();
  if (secret === undefined) delete process.env[BOUND_TOKEN_JWT_SECRET_ENV];
  else process.env[BOUND_TOKEN_JWT_SECRET_ENV] = secret;
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), authorization: init?.headers?.Authorization });
    return new Response("nope", { status: 500 });
  };
  setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
  try {
    const token = await mint();
    assert.equal(await databaseBearerForPresentedToken(token), undefined);
    for (const tool of ["bootstrap_whoami", "get_journey"]) {
      const res = await handleHostedReadFetch(
        mcpRequest(tool === "get_journey" ? token : token, tool, tool === "get_journey" ? { company: "alpha" } : {}),
      );
      const text = await res.text();
      assert.equal(res.status, 401, `${tool} ${text}`);
      assert.equal(JSON.parse(text).reason, "identity_lookup_failed");
      assert.equal(JSON.parse(text).error, "invalid_token");
    }
    assertClosedTraffic(calls, token);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = prev;
  }
}

describe("bound token fail closed", () => {
  it("unset JWT secret is 401 and forwards nothing", async () => {
    await assertClosed(undefined);
  });

  it("empty JWT secret is 401 and forwards nothing", async () => {
    await assertClosed("");
  });

  it("labels RPC failure is 401 and does not send the at+jwt or service_role", async () => {
    await keys();
    installJwks();
    process.env[BOUND_TOKEN_JWT_SECRET_ENV] = "test-only-supabase-jwt-secret";
    const calls = [];
    const prev = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), authorization: init?.headers?.Authorization });
      return new Response("nope", { status: 500 });
    };
    setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
    try {
      const token = await mint();
      for (const tool of ["bootstrap_whoami", "get_journey"]) {
        const res = await handleHostedReadFetch(
          mcpRequest(token, tool, tool === "get_journey" ? { company: "alpha" } : {}),
        );
        const text = await res.text();
        assert.equal(res.status, 401, `${tool} ${text}`);
        assert.equal(JSON.parse(text).reason, "identity_lookup_failed");
      }
      assert.ok(calls.length >= 1);
      assert.ok(calls.every((call) => call.url.includes("/rest/v1/rpc/bootstrap_mcp_my_labels")));
      assertClosedTraffic(calls, token);
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("two mints a second apart keep the same company context", async () => {
    await keys();
    installJwks();
    process.env[BOUND_TOKEN_JWT_SECRET_ENV] = "test-only-supabase-jwt-secret";
    const prev = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ authenticated: true, email: EMAIL, labels: ["alpha"], role: "member" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
    try {
      const token = await mint();
      const firstNow = new Date();
      const later = new Date(firstNow.getTime() + 2000);
      const firstMint = await databaseBearerForPresentedToken(token, process.env, firstNow);
      const secondMint = await databaseBearerForPresentedToken(token, process.env, later);
      assert.notEqual(firstMint, secondMint);
      const use = await handleHostedReadFetch(mcpRequest(token, "bootstrap_use_company", { company: "alpha" }));
      const useText = await use.text();
      assert.equal(use.status, 200, useText);
      assert.equal(toolJson(use, useText).activeCompany, "alpha");
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const listed = await handleHostedReadFetch(mcpRequest(token, "bootstrap_list_companies", {}));
      const listedText = await listed.text();
      assert.equal(listed.status, 200, listedText);
      assert.equal(toolJson(listed, listedText).activeCompany, "alpha");
    } finally {
      globalThis.fetch = prev;
    }
  });
});

describe("GoTrue session JWT flag", () => {
  async function sessionJwt() {
    return new SignJWT({ email: EMAIL, role: "authenticated" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(SUB)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("session-fixture-secret"));
  }

  it("accepts a session JWT when ACCEPT_SESSION_JWT is true and rejects it when false", async () => {
    const token = await sessionJwt();
    const calls = [];
    const prev = globalThis.fetch;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ email: EMAIL }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ authenticated: true, email: EMAIL, labels: ["alpha"], role: "member" }),
        { status: 200 },
      );
    };
    setIdentityStoreForTests(new SupabaseIdentityStore("https://db.example.test", "anon-key-fixture"));
    try {
      delete process.env[ACCEPT_SESSION_JWT_ENV];
      const ok = await handleHostedReadFetch(mcpRequest(token));
      const okText = await ok.text();
      assert.equal(ok.status, 200, okText);
      assert.equal(toolJson(ok, okText).email, EMAIL);
      assert.ok(calls.some((url) => url.includes("/auth/v1/user")));

      calls.length = 0;
      process.env[ACCEPT_SESSION_JWT_ENV] = "false";
      const req = mcpRequest(token);
      const rejected = await handleHostedReadFetch(req);
      const rejectedText = await rejected.text();
      assert.equal(rejected.status, 401, rejectedText);
      assert.equal(rejected.headers.get("www-authenticate"), wwwAuthenticateChallenge(req));
      assert.equal(JSON.parse(rejectedText).reason, "invalid_or_revoked_token");
      assert.equal(calls.length, 0);
    } finally {
      globalThis.fetch = prev;
    }
  });
});

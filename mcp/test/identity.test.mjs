/**
 * Hosted identity: public OS stays open; gated tools 401 without a pirin.ai token.
 * File + in-memory store. Does not claim a human logged in on the live pin.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  HOSTED_GATED_IDENTITY_TOOL_NAMES,
  HOSTED_READ_TOOL_NAMES,
} from "../dist/constants.js";
import {
  createIdentityStore,
  hashMcpToken,
  hostedProdIdentityAllowed,
  ivelinMemoryFixture,
  IVELIN_SEED_EMAIL,
  IVELIN_SEED_LABELS,
  parseBearerToken,
  setIdentityStoreForTests,
  SupabaseIdentityStore,
  whoamiFromLabelsRpc,
} from "../dist/identity.js";
import { syntheticAccessToken } from "../dist/journey-auth.js";
import {
  HOSTED_MCP_RESOURCE,
  HOSTED_MCP_RESOURCE_ALIAS,
  isCollabHostedResource,
  isJwtAccessToken,
  isUndeclaredDeployAlias,
  isProdPinResource,
  HOSTED_PROTECTED_RESOURCE_METADATA_URL,
  PIRIN_AUTHORIZATION_SERVER,
  PIRIN_AUTHORIZATION_SERVER_METADATA,
  PIRIN_PROTECTED_RESOURCE_METADATA_URL,
  PREVIEW_HOSTED_MCP_RESOURCE,
  PREVIEW_HOSTED_PROTECTED_RESOURCE_METADATA_URL,
  WWW_AUTHENTICATE_CHALLENGE,
  authorizationServerMetadataDocument,
  authorizationServerUrl,
  hostedMcpResource,
  protectedResourceMetadataDocument,
  requiresHandshakeAuth,
  wwwAuthenticateChallenge,
  wwwAuthenticateChallengeFor,
} from "../dist/oauth.js";

const IVELIN_TOKEN = "bos_ivelin_fixture_token_ok";
const OTHER_TOKEN = "bos_other_token_fixture_xx";

afterEach(() => {
  setIdentityStoreForTests(undefined);
  delete process.env.BOOTSTRAP_OAUTH_RESOURCE_METADATA;
  delete process.env.VERCEL_ENV;
});

async function rawRpc(method, params, id = 1, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
}

async function rpc(method, params, id = 1, token) {
  const res = await rawRpc(method, params, id, token);
  const text = await res.text();
  assert.ok(res.ok, `RPC ${method} failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

function parseTool(result) {
  const text = result.result.content.map((c) => c.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertGatedUnauthorized(res) {
  assert.equal(res.status, 401);
  const challenge = res.headers.get("WWW-Authenticate") ?? "";
  assert.ok(
    challenge.startsWith(WWW_AUTHENTICATE_CHALLENGE),
    `WWW-Authenticate must start with the discovery challenge, got ${challenge}`,
  );
  assert.doesNotMatch(challenge, /resource_metadata="https:\/\/pirin\.ai\//);
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "invalid_token");
  assert.equal(body.resource, HOSTED_MCP_RESOURCE);
  assert.ok(body.identityStore === "memory" || body.identityStore === "supabase" || body.identityStore === "unset");
  return body;
}

describe("hosted identity (resource server, gated)", () => {
  it("parses Bearer tokens and recognizes JWTs", () => {
    assert.equal(parseBearerToken("Bearer bos_abc1234567890xyz"), "bos_abc1234567890xyz");
    assert.equal(parseBearerToken("bearer bos_abc1234567890xyz"), "bos_abc1234567890xyz");
    assert.equal(parseBearerToken("Token nope"), undefined);
    assert.equal(parseBearerToken("Bearer short"), undefined);
    assert.equal(hashMcpToken("bos_a").length, 64);
    assert.notEqual(hashMcpToken("bos_a"), hashMcpToken("bos_b"));
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhQGIifQ.sig";
    assert.equal(isJwtAccessToken(jwt), true);
    assert.equal(isJwtAccessToken("bos_not_a_jwt_token_xx"), false);
  });

  it("preview/dev never attach prod identity store even if Supabase env is set", () => {
    const prev = {
      BOOTSTRAP_SUPABASE_URL: process.env.BOOTSTRAP_SUPABASE_URL,
      BOOTSTRAP_SUPABASE_ANON_KEY: process.env.BOOTSTRAP_SUPABASE_ANON_KEY,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };
    process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key-fixture-xx";
    try {
      delete process.env.VERCEL_ENV;
      assert.equal(hostedProdIdentityAllowed(), false);
      assert.equal(createIdentityStore(), null);
      process.env.VERCEL_ENV = "preview";
      assert.equal(hostedProdIdentityAllowed(), false);
      assert.equal(createIdentityStore(), null);
      process.env.VERCEL_ENV = "development";
      assert.equal(createIdentityStore(), null);
      process.env.VERCEL_ENV = "production";
      assert.equal(hostedProdIdentityAllowed(), true);
      const store = createIdentityStore();
      assert.ok(store);
      assert.equal(store.kind, "supabase");
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("anonymous still gets published OS tools and no login wall", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const res = await handleHostedReadFetch(new Request("https://preview.example/health"));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");

    const listed = await rpc("tools/list", {}, 2);
    const names = listed.result.tools.map((t) => t.name);
    for (const n of HOSTED_READ_TOOL_NAMES) {
      assert.ok(names.includes(n), `missing public ${n}`);
    }
    for (const n of HOSTED_GATED_IDENTITY_TOOL_NAMES) {
      assert.ok(names.includes(n), `missing gated ${n}`);
    }
    assert.ok(!names.includes("bootstrap_init_company"));
    assert.ok(!names.includes("bootstrap_get_state"));

    const info = parseTool(await rpc("tools/call", { name: "bootstrap_os_info", arguments: {} }, 3));
    assert.equal(info.surface, "hosted-read");
    assert.match(String(info.companyState), /shared 0-1 board|Not hosted/i);
    assert.ok(!info.paths?.statePath);
    assert.equal(info.identityStore, "memory");
    assert.equal(info.support?.email, "bootstrap@pirin.ai");
    assert.match(String(info.support?.routed), /human-routed/i);
  });

  it("gated tools without a token return 401 + WWW-Authenticate to pirin.ai", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    await assertGatedUnauthorized(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 4),
    );
    await assertGatedUnauthorized(
      await rawRpc("tools/call", { name: "bootstrap_list_company_labels", arguments: {} }, 5),
    );
    await assertGatedUnauthorized(
      await rawRpc(
        "tools/call",
        { name: "invite_member", arguments: { email: "bill@example.test", companyLabel: "alpha" } },
        51,
      ),
    );
    await assertGatedUnauthorized(
      await rawRpc("tools/call", { name: "accept_invite", arguments: { token: "inv_placeholder_token_xx" } }, 52),
    );
  });

  it("logged-in Ivelin fixture whoami sees charlie, alpha, bravo only", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const who = parseTool(
      await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 6, IVELIN_TOKEN),
    );
    assert.equal(who.authenticated, true);
    assert.equal(who.email, IVELIN_SEED_EMAIL);
    assert.deepEqual(who.companies, [...IVELIN_SEED_LABELS]);
    assert.deepEqual(who.labels, [...IVELIN_SEED_LABELS]);
    const blob = JSON.stringify(who);
    assert.doesNotMatch(blob, /journeyPhase|instanceRoot|secret-other|company-state\.json/);
    assert.match(blob, /Companies this login can open/);

    const labels = parseTool(
      await rpc("tools/call", { name: "bootstrap_list_company_labels", arguments: {} }, 7, IVELIN_TOKEN),
    );
    assert.deepEqual(labels.companies, [...IVELIN_SEED_LABELS]);
    assert.deepEqual(labels.labels, [...IVELIN_SEED_LABELS]);
    assert.match(String(labels.note), /Companies this login can open/i);
  });

  it("other mentee token cannot see Ivelin labels", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const who = parseTool(
      await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 8, OTHER_TOKEN),
    );
    assert.equal(who.authenticated, true);
    assert.equal(who.email, "other@example.test");
    assert.deepEqual(who.labels, ["secret-other"]);
    assert.ok(!who.labels.includes("charlie"));
    assert.ok(!who.labels.includes("alpha"));
    assert.ok(!who.labels.includes("bravo"));
  });

  it("labels RPC fail-closed: invited authenticates; uninvited is not_invited", () => {
    const invited = whoamiFromLabelsRpc(
      IVELIN_SEED_EMAIL,
      {
        authenticated: true,
        email: IVELIN_SEED_EMAIL,
        labels: [...IVELIN_SEED_LABELS],
        note: "Labels only. Not boards. Not company-state.",
      },
      true,
    );
    assert.equal(invited.authenticated, true);
    assert.equal(invited.email, IVELIN_SEED_EMAIL);
    assert.deepEqual(invited.labels, [...IVELIN_SEED_LABELS]);

    const uninvited = whoamiFromLabelsRpc(
      "stranger@example.test",
      { authenticated: false, email: "stranger@example.test", labels: [], reason: "not_invited" },
      true,
    );
    assert.equal(uninvited.authenticated, false);
    assert.equal(uninvited.reason, "not_invited");
    assert.deepEqual(uninvited.labels, []);

    const failed = whoamiFromLabelsRpc("x@y.test", null, false);
    assert.equal(failed.authenticated, false);
    assert.equal(failed.reason, "identity_lookup_failed");
  });

  it("SupabaseIdentityStore: invited JWT authenticates; uninvited JWT does not", async () => {
    const invitedJwt = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: "auth-ivelin" });
    const uninvitedJwt = syntheticAccessToken({ email: "stranger@example.test", sub: "auth-stranger" });
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      const invited = u.includes("https://invited.example");
      if (u.endsWith("/auth/v1/user")) {
        return new Response(
          JSON.stringify({ email: invited ? IVELIN_SEED_EMAIL : "stranger@example.test" }),
          { status: 200 },
        );
      }
      if (u.includes("bootstrap_mcp_my_labels")) {
        return new Response(
          JSON.stringify(
            invited
              ? {
                  authenticated: true,
                  email: IVELIN_SEED_EMAIL,
                  labels: [...IVELIN_SEED_LABELS],
                  note: "Labels only. Not boards. Not company-state.",
                }
              : {
                  authenticated: false,
                  email: "stranger@example.test",
                  labels: [],
                  reason: "not_invited",
                },
          ),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    };
    try {
      const invitedStore = new SupabaseIdentityStore("https://invited.example", "anon-key-fixture-xx");
      const invited = await invitedStore.whoami(invitedJwt);
      assert.equal(invited.authenticated, true);
      assert.equal(invited.email, IVELIN_SEED_EMAIL);
      assert.deepEqual(invited.labels, [...IVELIN_SEED_LABELS]);

      const uninvitedStore = new SupabaseIdentityStore("https://uninvited.example", "anon-key-fixture-xx");
      const uninvited = await uninvitedStore.whoami(uninvitedJwt);
      assert.equal(uninvited.authenticated, false);
      assert.equal(uninvited.reason, "not_invited");
      assert.deepEqual(uninvited.labels, []);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("uninvited JWT keeps gated tools 401; missing token still 401s handshake", async () => {
    const uninvitedJwt = syntheticAccessToken({ email: "stranger@example.test", sub: "auth-stranger" });
    setIdentityStoreForTests({
      kind: "supabase",
      async whoami(token) {
        if (!token) {
          return {
            authenticated: false,
            labels: [],
            reason: "missing_or_short_token",
            identityStore: "supabase",
          };
        }
        return {
          authenticated: false,
          email: "stranger@example.test",
          labels: [],
          reason: "not_invited",
          identityStore: "supabase",
        };
      },
    });
    const gated = await assertGatedUnauthorized(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 40, uninvitedJwt),
    );
    assert.equal(gated.reason, "not_invited");

    process.env.VERCEL_ENV = "production";
    const handshake = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 41,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "uninvited-handshake", version: "0.0.0" },
          },
        }),
      }),
    );
    assert.equal(handshake.status, 401);
    assert.equal(handshake.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);
    const handshakeBody = JSON.parse(await handshake.text());
    assert.equal(handshakeBody.error, "invalid_token");
    assert.equal(handshakeBody.reason, "missing_or_short_token");
  });

  it("invalid token does not leak labels and still challenges to pirin.ai", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    await assertGatedUnauthorized(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 9, "bos_not_a_real_token_xx"),
    );
    await assertGatedUnauthorized(
      await rawRpc(
        "tools/call",
        { name: "bootstrap_list_company_labels", arguments: {} },
        10,
        "bos_not_a_real_token_xx",
      ),
    );
  });

  it("production AS strings are live pirin.ai after #143 merged", () => {
    assert.equal(HOSTED_MCP_RESOURCE, "https://mcp.bootstrap.pirin.ai/mcp");
    assert.equal(HOSTED_MCP_RESOURCE_ALIAS, "https://bootstrap-os-mcp.vercel.app/mcp");
    assert.equal(isProdPinResource(HOSTED_MCP_RESOURCE), true);
    assert.equal(isProdPinResource(HOSTED_MCP_RESOURCE_ALIAS), true);
    assert.equal(isCollabHostedResource(HOSTED_MCP_RESOURCE), true);
    assert.equal(isCollabHostedResource(HOSTED_MCP_RESOURCE_ALIAS), true);
    assert.equal(isUndeclaredDeployAlias(HOSTED_MCP_RESOURCE_ALIAS), true);
    assert.equal(isUndeclaredDeployAlias(HOSTED_MCP_RESOURCE), false);
    assert.equal(
      PIRIN_PROTECTED_RESOURCE_METADATA_URL,
      "https://pirin.ai/.well-known/oauth-protected-resource",
    );
    assert.equal(
      HOSTED_PROTECTED_RESOURCE_METADATA_URL,
      "https://mcp.bootstrap.pirin.ai/.well-known/oauth-protected-resource",
    );
    assert.equal(PIRIN_AUTHORIZATION_SERVER, "https://www.pirin.ai/bootstrap-os/login");
    assert.equal(PIRIN_AUTHORIZATION_SERVER_METADATA.issuer, "https://www.pirin.ai/bootstrap-os/login");
    assert.equal(
      PIRIN_AUTHORIZATION_SERVER_METADATA.authorization_endpoint,
      "https://www.pirin.ai/bootstrap-os/login",
    );
    assert.equal(PIRIN_AUTHORIZATION_SERVER_METADATA.token_endpoint, "https://www.pirin.ai/oauth/token");
    assert.equal(
      PIRIN_AUTHORIZATION_SERVER_METADATA.registration_endpoint,
      "https://www.pirin.ai/oauth/register",
    );
    assert.equal(
      WWW_AUTHENTICATE_CHALLENGE,
      `Bearer realm="bootstrap-os-mcp", resource_metadata="${HOSTED_PROTECTED_RESOURCE_METADATA_URL}", resource="${HOSTED_MCP_RESOURCE}", scope="bootstrap-os"`,
    );
    process.env.VERCEL_ENV = "production";
    assert.equal(wwwAuthenticateChallenge(), WWW_AUTHENTICATE_CHALLENGE);
    assert.doesNotMatch(WWW_AUTHENTICATE_CHALLENGE, /resource_metadata="https:\/\/pirin\.ai\//);
    process.env.BOOTSTRAP_OAUTH_RESOURCE_METADATA = PIRIN_PROTECTED_RESOURCE_METADATA_URL;
    assert.equal(wwwAuthenticateChallenge(), WWW_AUTHENTICATE_CHALLENGE);
    delete process.env.BOOTSTRAP_OAUTH_RESOURCE_METADATA;
    assert.deepEqual(
      authorizationServerMetadataDocument(
        new Request("https://bootstrap-os-mcp.vercel.app/.well-known/oauth-authorization-server"),
      ),
      PIRIN_AUTHORIZATION_SERVER_METADATA,
    );
  });

  it("preview ignores live pirin.ai well-known as resource_metadata (that JSON resource is the vercel.app alias)", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.BOOTSTRAP_OAUTH_RESOURCE_METADATA = PIRIN_PROTECTED_RESOURCE_METADATA_URL;
    const previewReq = new Request(PREVIEW_HOSTED_MCP_RESOURCE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "bootstrap_whoami", arguments: {} },
      }),
    });
    const challenge = wwwAuthenticateChallenge(previewReq);
    assert.equal(
      challenge,
      wwwAuthenticateChallengeFor(
        PREVIEW_HOSTED_PROTECTED_RESOURCE_METADATA_URL,
        PREVIEW_HOSTED_MCP_RESOURCE,
      ),
    );
    assert.doesNotMatch(challenge, /resource_metadata="https:\/\/pirin\.ai\//);
    assert.doesNotMatch(challenge, /v0-pirin-ai-founder-studio-git-be053a/);
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const res = await handleHostedReadFetch(previewReq);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("WWW-Authenticate"), challenge);
  });

  it("VERCEL_ENV=preview uses this origin well-known + live pirin.ai login, never the prod pin", async () => {
    process.env.VERCEL_ENV = "preview";
    const previewReq = new Request(`${PREVIEW_HOSTED_MCP_RESOURCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "bootstrap_whoami", arguments: {} },
      }),
    });
    assert.equal(hostedMcpResource(previewReq), PREVIEW_HOSTED_MCP_RESOURCE);
    assert.notEqual(hostedMcpResource(previewReq), HOSTED_MCP_RESOURCE);
    const challenge = wwwAuthenticateChallenge(previewReq);
    assert.equal(
      challenge,
      wwwAuthenticateChallengeFor(
        PREVIEW_HOSTED_PROTECTED_RESOURCE_METADATA_URL,
        PREVIEW_HOSTED_MCP_RESOURCE,
      ),
    );
    assert.match(challenge, /resource="https:\/\/bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132\.vercel\.app\/mcp"/);
    assert.match(
      challenge,
      /resource_metadata="https:\/\/bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132\.vercel\.app\/\.well-known\/oauth-protected-resource"/,
    );
    assert.doesNotMatch(challenge, /resource="https:\/\/bootstrap-os-mcp\.vercel\.app\/mcp"/);
    assert.doesNotMatch(challenge, /resource="https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp"/);
    assert.doesNotMatch(challenge, /resource_metadata="https:\/\/pirin\.ai\//);
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const res = await handleHostedReadFetch(previewReq);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("WWW-Authenticate"), challenge);
    const body = JSON.parse(await res.text());
    assert.equal(body.resource, PREVIEW_HOSTED_MCP_RESOURCE);
    const meta = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-protected-resource"),
    );
    assert.equal(meta.status, 200);
    const doc = JSON.parse(await meta.text());
    assert.equal(doc.resource, PREVIEW_HOSTED_MCP_RESOURCE);
    assert.deepEqual(doc.authorization_servers, [PIRIN_AUTHORIZATION_SERVER]);
    assert.equal(doc.authorization_servers[0], "https://www.pirin.ai/bootstrap-os/login");
    const metaMcp = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-protected-resource/mcp"),
    );
    assert.deepEqual(JSON.parse(await metaMcp.text()).authorization_servers, [
      PIRIN_AUTHORIZATION_SERVER,
    ]);
    assert.equal(authorizationServerUrl(previewReq), PIRIN_AUTHORIZATION_SERVER);
    const asMeta = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-authorization-server"),
    );
    assert.equal(asMeta.status, 200);
    const asDoc = JSON.parse(await asMeta.text());
    assert.deepEqual(asDoc, { ...PIRIN_AUTHORIZATION_SERVER_METADATA });
    assert.equal(asDoc.issuer, "https://www.pirin.ai/bootstrap-os/login");
    assert.equal(asDoc.authorization_endpoint, "https://www.pirin.ai/bootstrap-os/login");
    assert.equal(asDoc.token_endpoint, "https://www.pirin.ai/oauth/token");
    assert.equal(asDoc.registration_endpoint, "https://www.pirin.ai/oauth/register");
    assert.equal(asDoc.service_documentation, "https://www.pirin.ai/bootstrap-os/login");
    assert.doesNotMatch(JSON.stringify(asDoc), /bootstrap-os-mcp/);
    assert.doesNotMatch(JSON.stringify(asDoc), /v0-pirin-ai-founder-studio-git-be053a/);
    const asMetaMcp = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-authorization-server/mcp"),
    );
    assert.deepEqual(JSON.parse(await asMetaMcp.text()), { ...PIRIN_AUTHORIZATION_SERVER_METADATA });
    const tokenOnMcp = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/oauth/token"),
    );
    assert.equal(tokenOnMcp.status, 404);
    const registerOnMcp = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/oauth/register"),
    );
    assert.equal(registerOnMcp.status, 404);
    process.env.VERCEL_ENV = "production";
    assert.equal(wwwAuthenticateChallenge(), WWW_AUTHENTICATE_CHALLENGE);
    assert.equal(hostedMcpResource(), HOSTED_MCP_RESOURCE);
    assert.equal(authorizationServerUrl(), PIRIN_AUTHORIZATION_SERVER);
    const prodDoc = protectedResourceMetadataDocument(
      new Request("https://mcp.bootstrap.pirin.ai/.well-known/oauth-protected-resource"),
    );
    assert.equal(prodDoc.resource, HOSTED_MCP_RESOURCE);
    assert.notEqual(prodDoc.resource, HOSTED_MCP_RESOURCE_ALIAS);
    assert.deepEqual(prodDoc.authorization_servers, ["https://www.pirin.ai/bootstrap-os/login"]);
    const aliasDoc = protectedResourceMetadataDocument(
      new Request("https://bootstrap-os-mcp.vercel.app/.well-known/oauth-protected-resource"),
    );
    assert.equal(aliasDoc.resource, HOSTED_MCP_RESOURCE);
    assert.deepEqual(
      authorizationServerMetadataDocument(
        new Request("https://mcp.bootstrap.pirin.ai/.well-known/oauth-authorization-server"),
      ),
      PIRIN_AUTHORIZATION_SERVER_METADATA,
    );
    const prodWk = await handleHostedReadFetch(
      new Request(HOSTED_PROTECTED_RESOURCE_METADATA_URL),
    );
    assert.equal(prodWk.status, 200);
    const prodWkDoc = JSON.parse(await prodWk.text());
    assert.equal(prodWkDoc.resource, HOSTED_MCP_RESOURCE);
    assert.deepEqual(prodWkDoc.authorization_servers, [PIRIN_AUTHORIZATION_SERVER]);
    assert.match(
      wwwAuthenticateChallenge(),
      /resource_metadata="https:\/\/mcp\.bootstrap\.pirin\.ai\/\.well-known\/oauth-protected-resource"/,
    );
    const aliasWk = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp.vercel.app/.well-known/oauth-protected-resource"),
    );
    assert.equal(aliasWk.status, 200);
    assert.equal(JSON.parse(await aliasWk.text()).resource, HOSTED_MCP_RESOURCE);
  });

  it("Hold preview cookie-less initialize / GET SSE / tools/list 401; undeclared deploy alias and collab host handshake 401", async () => {
    process.env.VERCEL_ENV = "preview";
    const previewChallenge = wwwAuthenticateChallengeFor(
      PREVIEW_HOSTED_PROTECTED_RESOURCE_METADATA_URL,
      PREVIEW_HOSTED_MCP_RESOURCE,
    );
    const previewInit = new Request(PREVIEW_HOSTED_MCP_RESOURCE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 20,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "preview-handshake", version: "0.0.0" },
        },
      }),
    });
    assert.equal(requiresHandshakeAuth(previewInit), true);
    const initRes = await handleHostedReadFetch(previewInit);
    assert.equal(initRes.status, 401);
    assert.equal(initRes.headers.get("WWW-Authenticate"), previewChallenge);
    assert.equal(JSON.parse(await initRes.text()).resource, PREVIEW_HOSTED_MCP_RESOURCE);

    const sse = await handleHostedReadFetch(
      new Request(PREVIEW_HOSTED_MCP_RESOURCE, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }),
    );
    assert.equal(sse.status, 401);
    assert.equal(sse.headers.get("WWW-Authenticate"), previewChallenge);
    assert.doesNotMatch(sse.headers.get("content-type") ?? "", /text\/event-stream/i);

    const listed = await handleHostedReadFetch(
      new Request(PREVIEW_HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 21, method: "tools/list", params: {} }),
      }),
    );
    assert.equal(listed.status, 401);
    assert.equal(listed.headers.get("WWW-Authenticate"), previewChallenge);

    const wk = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-protected-resource"),
    );
    assert.equal(wk.status, 200);
    const asWk = await handleHostedReadFetch(
      new Request("https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-authorization-server"),
    );
    assert.equal(asWk.status, 200);

    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const authedInit = await handleHostedReadFetch(
      new Request(PREVIEW_HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${IVELIN_TOKEN}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 22,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "preview-handshake", version: "0.0.0" },
          },
        }),
      }),
    );
    assert.equal(authedInit.status, 200);

    process.env.VERCEL_ENV = "production";
    const initBody = {
      jsonrpc: "2.0",
      id: 23,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "prod-pin", version: "0.0.0" },
      },
    };
    const prodInit = new Request(HOSTED_MCP_RESOURCE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(initBody),
    });
    assert.equal(requiresHandshakeAuth(prodInit), true);
    const prodRes = await handleHostedReadFetch(prodInit);
    assert.equal(prodRes.status, 401);
    assert.equal(prodRes.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);
    assert.equal(JSON.parse(await prodRes.text()).resource, HOSTED_MCP_RESOURCE);

    const collabSse = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }),
    );
    assert.equal(collabSse.status, 401);
    assert.equal(collabSse.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);

    const collabList = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 24, method: "tools/list", params: {} }),
      }),
    );
    assert.equal(collabList.status, 401);
    assert.equal(collabList.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);

    const aliasInit = new Request(HOSTED_MCP_RESOURCE_ALIAS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ ...initBody, id: 25 }),
    });
    assert.equal(requiresHandshakeAuth(aliasInit), true);
    const aliasInitRes = await handleHostedReadFetch(aliasInit);
    assert.equal(aliasInitRes.status, 401);
    assert.equal(aliasInitRes.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);

    const aliasList = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE_ALIAS, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 26, method: "tools/list", params: {} }),
      }),
    );
    assert.equal(aliasList.status, 401);
    assert.equal(aliasList.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);

    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const prodWhoami = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 27,
          method: "tools/call",
          params: { name: "bootstrap_whoami", arguments: {} },
        }),
      }),
    );
    assert.equal(prodWhoami.status, 401);
    assert.equal(prodWhoami.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);
    assert.match(
      prodWhoami.headers.get("WWW-Authenticate") ?? "",
      /resource_metadata="https:\/\/mcp\.bootstrap\.pirin\.ai\/\.well-known\/oauth-protected-resource"/,
    );
    assert.match(
      prodWhoami.headers.get("WWW-Authenticate") ?? "",
      /resource="https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp"/,
    );

    const aliasWhoami = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE_ALIAS, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 28,
          method: "tools/call",
          params: { name: "bootstrap_whoami", arguments: {} },
        }),
      }),
    );
    assert.equal(aliasWhoami.status, 401);
    assert.equal(aliasWhoami.headers.get("WWW-Authenticate"), WWW_AUTHENTICATE_CHALLENGE);

    const authedCollabInit = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${IVELIN_TOKEN}`,
        },
        body: JSON.stringify({ ...initBody, id: 29 }),
      }),
    );
    assert.equal(authedCollabInit.status, 200);

    const authedCollabList = await handleHostedReadFetch(
      new Request(HOSTED_MCP_RESOURCE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${IVELIN_TOKEN}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 30, method: "tools/list", params: {} }),
      }),
    );
    assert.equal(authedCollabList.status, 200);
    const collabNames = JSON.parse(await authedCollabList.text()).result.tools.map((t) => t.name);
    for (const n of HOSTED_READ_TOOL_NAMES) {
      assert.ok(collabNames.includes(n), `authed collab missing public ${n}`);
    }
    for (const n of HOSTED_GATED_IDENTITY_TOOL_NAMES) {
      assert.ok(collabNames.includes(n), `authed collab missing gated ${n}`);
    }

    const authedWho = parseTool(
      JSON.parse(
        await (
          await handleHostedReadFetch(
            new Request(HOSTED_MCP_RESOURCE, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                Authorization: `Bearer ${IVELIN_TOKEN}`,
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 31,
                method: "tools/call",
                params: { name: "bootstrap_whoami", arguments: {} },
              }),
            }),
          )
        ).text(),
      ),
    );
    assert.equal(authedWho.authenticated, true);
    assert.equal(authedWho.email, IVELIN_SEED_EMAIL);
  });

  it("CORS allows Authorization and exposes WWW-Authenticate", async () => {
    const res = await handleHostedReadFetch(
      new Request("https://preview.example/mcp", { method: "OPTIONS" }),
    );
    assert.equal(res.status, 204);
    assert.match(res.headers.get("Access-Control-Allow-Headers") ?? "", /Authorization/i);
    assert.match(res.headers.get("Access-Control-Expose-Headers") ?? "", /WWW-Authenticate/i);
  });
});

/**
 * Per-authenticated-tool scope gate behind ACCEPT_SESSION_JWT.
 * Unscoped/no-aud → 403 insufficient_scope when flag is false (reads + writes).
 * Scoped+aud → not refused by the scope gate.
 * Flag default true keeps plain session JWTs working for every authenticated tool.
 * Fictional fixtures only. Never print secrets. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleHostedReadFetch,
  insufficientScopeToolResponse,
} from "../dist/hosted-handler.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { MemoryIdentityStore, hashMcpToken, setIdentityStoreForTests } from "../dist/identity.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { syntheticAccessToken } from "../dist/journey-auth.js";
import { HOSTED_MCP_RESOURCE, insufficientScopeChallenge } from "../dist/oauth.js";
import {
  ACCEPT_SESSION_JWT_ENV,
  PUBLIC_TOOL_NAMES,
  SCOPE_GATED_TOOL_NAMES,
  acceptSessionJwt,
  registeredToolMissingScopeEntry,
  toolScopeCallRefusal,
} from "../dist/tool-scopes.js";

const FOUNDER_EMAIL = "founder@example.test";
const FOUNDER_SUB = "auth-founder-scope";

const TOOL_ARGS = {
  bootstrap_whoami: {},
  bootstrap_list_companies: {},
  bootstrap_list_company_labels: {},
  bootstrap_use_company: { company: "alpha" },
  invite_member: { email: "invitee@example.test", company: "alpha" },
  accept_invite: { token: "inv_fictional_accept_token_xx" },
  create_company: { slug: "alpha-new", founderYes: true },
  create_starter_board: {},
  submit_feedback: {
    kind: "bug",
    summary: "scope gate probe",
    user_consented: true,
  },
  list_feedback: {},
  get_journey: { company: "alpha" },
  bootstrap_where_are_we: { company: "alpha" },
  create_idea: {
    company: "alpha",
    idea: "scope-bet",
    founderYes: true,
    why: "a fictional booth",
  },
  put_journey: {
    company: "alpha",
    why: "scope gate seed",
    founderYes: true,
    constraintThisWeek: "talk",
  },
  post_comment: { company: "alpha", body: "scope note" },
  unsubscribe_board: {
    company: "alpha",
    principal: "advisor@example.test",
    principalKind: "email",
  },
  list_subscribers: { company: "alpha" },
  enable_board_watch: { company: "alpha" },
  list_provenance: { company: "alpha" },
  put_portfolio_score: {
    company: "alpha",
    idea: "alpha",
    impact: 3,
    evidence: 3,
    leverage: 3,
    why: "operators already pay",
    founderYes: true,
  },
  subscribe_board: {
    company: "alpha",
    principal: "advisor@example.test",
    principalKind: "email",
    webhookUrl: "https://hooks.example.test/scope",
  },
};

function futureExp() {
  return Math.floor(Date.now() / 1000) + 3600;
}

function unscopedToken() {
  return syntheticAccessToken({
    email: FOUNDER_EMAIL,
    sub: FOUNDER_SUB,
    extra: { exp: futureExp() },
  });
}

function scopedToken() {
  return syntheticAccessToken({
    email: FOUNDER_EMAIL,
    sub: FOUNDER_SUB,
    extra: {
      exp: futureExp(),
      aud: HOSTED_MCP_RESOURCE,
      scope: "bootstrap-os openid",
    },
  });
}

function toolRequest(name, args, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://mcp.bootstrap.pirin.ai/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args ?? {} },
    }),
  });
}

function installFixtures(token) {
  setJourneyStoreForTests(
    new HostedMembershipJourneyStore((actor) =>
      actor.email === FOUNDER_EMAIL ? ["alpha"] : [],
    ),
  );
  setIdentityStoreForTests(
    new MemoryIdentityStore([
      {
        id: "mentee-founder-scope",
        email: FOUNDER_EMAIL,
        authUserId: FOUNDER_SUB,
        labels: ["alpha"],
        role: "super_admin",
        tokenHashes: [hashMcpToken(token)],
      },
    ]),
  );
}

afterEach(() => {
  delete process.env[ACCEPT_SESSION_JWT_ENV];
  setJourneyStoreForTests(undefined);
  setIdentityStoreForTests(undefined);
});

describe("ACCEPT_SESSION_JWT flag", () => {
  it("defaults to true (plain session JWTs still accepted)", () => {
    delete process.env[ACCEPT_SESSION_JWT_ENV];
    assert.equal(acceptSessionJwt(), true);
    assert.equal(toolScopeCallRefusal("put_journey", unscopedToken()), null);
    assert.equal(toolScopeCallRefusal("get_journey", unscopedToken()), null);
    assert.equal(toolScopeCallRefusal("bootstrap_whoami", unscopedToken()), null);
  });

  it("false turns on aud+scope enforcement for every authenticated tool", () => {
    process.env[ACCEPT_SESSION_JWT_ENV] = "false";
    assert.equal(acceptSessionJwt(), false);
    assert.equal(toolScopeCallRefusal("put_journey", unscopedToken()), "insufficient_scope");
    assert.equal(toolScopeCallRefusal("get_journey", unscopedToken()), "insufficient_scope");
    assert.equal(toolScopeCallRefusal("bootstrap_whoami", unscopedToken()), "insufficient_scope");
    assert.equal(toolScopeCallRefusal("put_journey", scopedToken()), null);
    assert.equal(toolScopeCallRefusal("bootstrap_os_info", unscopedToken()), null);
  });
});

describe("deny-by-default missing table entry", () => {
  it("refuses a registered tool name that is absent from TOOL_SCOPE_TABLE", () => {
    assert.equal(
      registeredToolMissingScopeEntry(["put_journey", "shadow_tool"], "shadow_tool"),
      true,
    );
    assert.equal(registeredToolMissingScopeEntry(["put_journey"], "put_journey"), false);
    assert.equal(registeredToolMissingScopeEntry(["put_journey"], "not_registered"), false);
  });

  it("unknown unregistered tool names still reach MCP not-found (not the table refuse)", async () => {
    const res = await handleHostedReadFetch(
      toolRequest("not_a_registered_scope_tool", {}, unscopedToken()),
    );
    assert.notEqual(res.status, 403);
    assert.match(await res.text(), /Tool not_a_registered_scope_tool not found/);
  });
});

describe("authenticated-tool scope gate (ACCEPT_SESSION_JWT=false)", () => {
  for (const name of SCOPE_GATED_TOOL_NAMES) {
    it(`${name}: unscoped/no-aud token → 403 insufficient_scope`, async () => {
      process.env[ACCEPT_SESSION_JWT_ENV] = "false";
      const token = unscopedToken();
      installFixtures(token);
      assert.ok(Object.hasOwn(TOOL_ARGS, name), `missing TOOL_ARGS for ${name}`);
      const req = toolRequest(name, TOOL_ARGS[name], token);
      const res = await handleHostedReadFetch(req);
      assert.equal(res.status, 403, name);
      assert.equal(res.headers.get("WWW-Authenticate"), insufficientScopeChallenge(req));
      assert.match(res.headers.get("WWW-Authenticate") || "", /error="insufficient_scope"/);
      assert.match(res.headers.get("WWW-Authenticate") || "", /scope="bootstrap-os"/);
      assert.match(res.headers.get("WWW-Authenticate") || "", /resource_metadata=/);
      const body = JSON.parse(await res.text());
      assert.equal(body.error, "insufficient_scope");
      assert.equal(Object.keys(body).sort().join(","), "error,error_description");
    });

    it(`${name}: scoped+aud token is not refused by the scope gate`, async () => {
      process.env[ACCEPT_SESSION_JWT_ENV] = "false";
      const token = scopedToken();
      installFixtures(token);
      const res = await handleHostedReadFetch(toolRequest(name, TOOL_ARGS[name], token));
      const www = res.headers.get("WWW-Authenticate") || "";
      assert.doesNotMatch(www, /error="insufficient_scope"/);
      if (res.status === 403) {
        const body = JSON.parse(await res.text());
        assert.notEqual(body.error, "insufficient_scope", name);
      } else {
        await res.arrayBuffer();
      }
    });
  }
});

describe("authenticated-tool scope gate (ACCEPT_SESSION_JWT=true / default)", () => {
  for (const name of SCOPE_GATED_TOOL_NAMES) {
    it(`${name}: unscoped session JWT is not insufficient_scope`, async () => {
      delete process.env[ACCEPT_SESSION_JWT_ENV];
      const token = unscopedToken();
      installFixtures(token);
      const res = await handleHostedReadFetch(toolRequest(name, TOOL_ARGS[name], token));
      assert.notEqual(res.status, 403);
      const www = res.headers.get("WWW-Authenticate") || "";
      assert.doesNotMatch(www, /error="insufficient_scope"/);
      await res.arrayBuffer();
    });
  }
});

describe("public tools stay exempt", () => {
  for (const name of PUBLIC_TOOL_NAMES) {
    it(`${name}: unscoped call is not insufficient_scope when flag is false`, async () => {
      process.env[ACCEPT_SESSION_JWT_ENV] = "false";
      const res = await handleHostedReadFetch(toolRequest(name, {}, unscopedToken()));
      assert.doesNotMatch(res.headers.get("WWW-Authenticate") || "", /error="insufficient_scope"/);
      if (res.status === 403) {
        const body = JSON.parse(await res.text());
        assert.notEqual(body.error, "insufficient_scope", name);
      } else {
        await res.arrayBuffer();
      }
    });
  }
});

describe("insufficient_scope response shape", () => {
  it("is a single clean 403 (no invalid_token)", () => {
    const res = insufficientScopeToolResponse(
      new Request("https://mcp.bootstrap.pirin.ai/mcp"),
    );
    assert.equal(res.status, 403);
    assert.doesNotMatch(res.headers.get("WWW-Authenticate") || "", /invalid_token/);
  });
});

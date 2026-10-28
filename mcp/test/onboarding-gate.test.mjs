/**
 * Invited-founder onboarding gate. PGlite only. Never prod. Never supabase-pirin-ai.
 * One regression per invited-founder session bug (fixtures: alpha / bravo / charlie, @example.test).
 */
import { afterEach, before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { hashMcpToken, IVELIN_SEED_EMAIL, setIdentityStoreForTests, whoamiFromLabelsRpc } from "../dist/identity.js";
import { actorClaimsFromAccessToken, syntheticAccessToken } from "../dist/journey-auth.js";
import { HOSTED_MCP_RESOURCE, isJwtAccessToken } from "../dist/oauth.js";
import { MemoryInviteStore, PgliteInviteStore, SupabaseInviteStore, setInviteStoreForTests } from "../dist/invite.js";
import { buildInviteMail } from "../dist/invite-mail.js";
import { clearHostedCompanyContextForTests, chooseCompany } from "../dist/hosted-company-context.js";
import {
  FORGOT_PASSWORD_PUBLIC_MESSAGE,
  NO_BOARDS_HINT,
  forgotPasswordPublicResponse,
  presentVerifiedWhoami,
} from "../dist/onboarding.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "pglite", "identity-schema.sql");
const IVELIN_UID = "33333333-3333-3333-3333-333333333333";
const A_UID = "11111111-1111-1111-1111-111111111111";
const NEW_UID = "88888888-8888-8888-8888-888888888888";
const BILL_UID = "66666666-6666-6666-6666-666666666666";
const BILL_EMAIL = "bill@example.test";
const SESSION = "https://mcp.bootstrap.pirin.ai/bootstrap-os/session";

let db;
let rpcId = 400;

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setInviteStoreForTests(undefined);
  clearHostedCompanyContextForTests();
  delete process.env.VERCEL_ENV;
});

function pgliteIdentityStore(database) {
  return {
    kind: "supabase",
    async whoami(token) {
      if (!token || token.length < 16) {
        return { authenticated: false, labels: [], reason: "missing_or_short_token", identityStore: "supabase" };
      }
      if (!isJwtAccessToken(token)) {
        return { authenticated: false, labels: [], reason: "not_a_pirin_access_token", identityStore: "supabase" };
      }
      const claims = actorClaimsFromAccessToken(token);
      if (!claims?.email) {
        return { authenticated: false, labels: [], reason: "not_a_pirin_access_token", identityStore: "supabase" };
      }
      await database.exec("RESET ROLE");
      await database.query("SELECT set_config('app.auth_uid', $1, false)", [claims.sub ?? ""]);
      await database.query("SELECT set_config('app.auth_email', $1, false)", [claims.email]);
      const body = (await database.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
      const who = whoamiFromLabelsRpc(claims.email, body, true);
      return who;
    },
  };
}

function useStores() {
  process.env.VERCEL_ENV = "production";
  setIdentityStoreForTests(pgliteIdentityStore(db));
  setInviteStoreForTests(new PgliteInviteStore(db));
}

function tokenFor(email, sub, extra = {}) {
  return syntheticAccessToken({ email, sub, extra: { exp: Math.floor(Date.now() / 1000) + 3600, ...extra } });
}

async function rawRpc(method, params, token, extraHeaders = {}) {
  rpcId += 1;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return handleHostedReadFetch(
    new Request(HOSTED_MCP_RESOURCE, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
    }),
  );
}

function parseTool(result) {
  const text = result.result.content.map((part) => part.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callTool(name, args, token, extraHeaders = {}) {
  const res = await rawRpc("tools/call", { name, arguments: args }, token, extraHeaders);
  const text = await res.text();
  return { res, body: JSON.parse(text), text };
}

async function sessionGrant(token, body = {}) {
  return handleHostedReadFetch(
    new Request(SESSION, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function invite(email, company) {
  const inviter = tokenFor(IVELIN_SEED_EMAIL, IVELIN_UID);
  const created = parseTool((await callTool("invite_member", { email, company }, inviter)).body);
  assert.equal(created.ok, true, JSON.stringify(created));
  return new URL(created.signInUrl).searchParams.get("invite");
}

describe("onboarding gate (PGlite, same commit, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("bug 1: invite mail is one link to sign in or create an account", () => {
    const mail = buildInviteMail({
      inviterEmail: "founder@example.test",
      inviteeEmail: "member@example.test",
      companyWorkspace: "alpha",
      inviteToken: "inv_fixture_token_xxxxxxxx",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.match(mail.text, /Base camp is ready\./);
    assert.equal((mail.text.match(/\?invite=/g) || []).length, 1);
    assert.equal((mail.text.match(/https:\/\//g) || []).length, 2);
    assert.match(mail.text, /https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp/);
    assert.match(mail.signupUrl, /\?invite=inv_fixture_token_xxxxxxxx/);
    assert.doesNotMatch(mail.text, /Sign in first/i);
    assert.doesNotMatch(mail.text, /already has an account/i);
  });

  it("bug 2: forgot password stays non-enumerating", () => {
    const known = forgotPasswordPublicResponse("founder@example.test");
    const unknown = forgotPasswordPublicResponse("nobody@example.test");
    assert.deepEqual(known, unknown);
    assert.equal(known.message, FORGOT_PASSWORD_PUBLIC_MESSAGE);
    assert.doesNotMatch(known.message, /founder@example\.test|nobody@example\.test|no account|does not exist/i);
  });

  it("bug 3: OAuth session with a pending invite accepts without the invite page", async () => {
    useStores();
    const inviteToken = await invite("member@example.test", "alpha");
    const access = tokenFor("member@example.test", NEW_UID);
    const grant = await sessionGrant(access, { invite: inviteToken, email: "someone-else@example.test" });
    assert.equal(grant.status, 200);
    const body = await grant.json();
    assert.equal(body.grant, "allow");
    assert.deepEqual(body.companies, ["alpha"]);
    assert.equal(body.hint, null);
    const who = parseTool((await callTool("bootstrap_whoami", {}, access)).body);
    assert.deepEqual(who.labels, ["alpha"]);
    const used = (
      await db.query("SELECT accepted_at IS NOT NULL AS used FROM bootstrap_mcp_invites WHERE invitee_email = 'member@example.test'")
    ).rows[0];
    assert.equal(used.used, true);
  });

  it("bugs 4 and 5: zero boards is 200, and repeating the call stays 200", async () => {
    useStores();
    const access = tokenFor("guest-empty@example.test", "99999999-9999-4999-8999-999999999999");
    const first = parseTool((await callTool("bootstrap_whoami", {}, access)).body);
    const second = parseTool((await callTool("bootstrap_list_companies", {}, access)).body);
    assert.equal(first.authenticated, true);
    assert.equal(first.reason, "no_membership");
    assert.equal(first.hint, NO_BOARDS_HINT);
    assert.deepEqual(first.companies, []);
    assert.equal(second.authenticated, true);
    assert.equal(second.hint, NO_BOARDS_HINT);
    const listed = await callTool("bootstrap_whoami", {}, access);
    assert.equal(listed.res.status, 200);
  });

  it("bug 6: repeated OAuth reuses one mentee; revoked token is a clean 401", async () => {
    useStores();
    const first = tokenFor("reconnect@example.test", "12121212-1212-4212-8212-121212121212");
    const second = tokenFor("reconnect@example.test", "12121212-1212-4212-8212-121212121212", { jti: "rotate" });
    await invite("reconnect@example.test", "bravo");
    const granted = await sessionGrant(first, {});
    assert.equal(granted.status, 200);
    assert.deepEqual((await granted.json()).companies, ["bravo"]);
    const again = await sessionGrant(first, {});
    assert.equal(again.status, 200);
    const rotated = await sessionGrant(second, {});
    assert.equal(rotated.status, 200);
    const mentees = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_mentees WHERE email = 'reconnect@example.test'")
    ).rows[0].n;
    const subjects = (
      await db.query(
        "SELECT count(*)::int AS n FROM bootstrap_mcp_oauth_subjects WHERE auth_user_id = '12121212-1212-4212-8212-121212121212'",
      )
    ).rows[0].n;
    const sameToken = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_access_tokens WHERE token_hash = $1", [
        hashMcpToken(first),
      ])
    ).rows[0].n;
    assert.equal(mentees, 1);
    assert.equal(subjects, 1);
    assert.equal(sameToken, 1);
    const still = parseTool((await callTool("bootstrap_whoami", {}, first)).body);
    assert.deepEqual(still.labels, ["bravo"]);
    await db.query("UPDATE bootstrap_mcp_access_tokens SET revoked_at = now() WHERE token_hash = $1", [
      hashMcpToken(first),
    ]);
    const revoked = await sessionGrant(first, {});
    assert.equal(revoked.status, 401);
    const revokedBody = await revoked.json();
    assert.equal(revokedBody.error, "invalid_token");
    assert.equal(revokedBody.reason, "invalid_or_revoked_token");
    const other = parseTool((await callTool("bootstrap_whoami", {}, second)).body);
    assert.deepEqual(other.labels, ["bravo"]);
  });

  it("bug 7: Allow grant with no membership returns guidance and still allows", async () => {
    useStores();
    const access = tokenFor("no-invite@example.test", "13131313-1313-4313-8313-131313131313");
    const grant = await sessionGrant(access, { invite: "inv_not_the_session_email_xxxx" });
    assert.equal(grant.status, 200);
    const body = await grant.json();
    assert.equal(body.grant, "allow");
    assert.equal(body.authenticated, true);
    assert.deepEqual(body.companies, []);
    assert.equal(body.hint, NO_BOARDS_HINT);
    assert.equal(body.reason, "no_membership");
  });

  it("bug 8: a membership written in the database is visible on the next call", async () => {
    useStores();
    const access = tokenFor("cache-guest@example.test", "14141414-1414-4414-8414-141414141414", {
      labels: ["zzz"],
      role: "super_admin",
    });
    const before = parseTool((await callTool("bootstrap_whoami", {}, access)).body);
    assert.deepEqual(before.companies, []);
    assert.equal(before.role === "super_admin", false);
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO bootstrap_mcp_mentees (id, email, auth_user_id) VALUES ('mentee-cache', 'cache-guest@example.test', NULL)",
    );
    await db.query(
      "INSERT INTO bootstrap_company_labels (id, mentee_id, label) VALUES ('lcache', 'mentee-cache', 'charlie')",
    );
    const after = parseTool((await callTool("bootstrap_whoami", {}, access)).body);
    assert.deepEqual(after.companies, ["charlie"]);
    assert.equal(after.companies.includes("zzz"), false);
  });

  it("bug 9: 401 says invalid_token and a zero-company invite returns setupSteps", async () => {
    useStores();
    const missing = await callTool("bootstrap_whoami", {});
    assert.equal(missing.res.status, 401);
    const missingBody = JSON.parse(missing.text);
    assert.equal(missingBody.error, "invalid_token");
    assert.equal(missingBody.reason, "missing_or_short_token");
    const access = tokenFor("plain-guest@example.test", "15151515-1515-4515-8515-151515151515");
    const before = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_invites WHERE invitee_email = 'other@example.test'")
    ).rows[0].n;
    const denied = await callTool("invite_member", { email: "other@example.test", company: "alpha" }, access);
    assert.equal(denied.res.status, 200);
    const deniedBody = JSON.parse(denied.text);
    assert.notEqual(deniedBody.result.isError, true);
    const payload = JSON.parse(deniedBody.result.content.map((part) => part.text).join("\n"));
    assert.equal(payload.reason, "no_membership");
    assert.equal(payload.setupSteps[0].id, "starter-bet-board");
    assert.equal(payload.setupSteps[0].nextTool, "create_starter_board");
    assert.equal(denied.res.headers.get("WWW-Authenticate"), null);
    assert.doesNotMatch(denied.text, /invalid_token/);
    const after = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_invites WHERE invitee_email = 'other@example.test'")
    ).rows[0].n;
    assert.equal(after, before);
  });

  it("existing user plus a new invite, case-insensitive email, wrong email, expired, double accept", async () => {
    useStores();
    const charlieToken = await invite("mentee-a@example.test", "charlie");
    const member = tokenFor("mentee-a@example.test", A_UID);
    const who = parseTool((await callTool("bootstrap_whoami", {}, member)).body);
    assert.deepEqual(who.labels, ["alpha", "charlie"]);

    const cased = await invite("cased-guest@example.test", "alpha");
    const casedAccess = tokenFor("Cased-Guest@Example.TEST", "16161616-1616-4616-8616-161616161616");
    const casedGrant = await sessionGrant(casedAccess, { invite: cased });
    assert.deepEqual((await casedGrant.json()).companies, ["alpha"]);

    const wrong = tokenFor("wrong-guest@example.test", "17171717-1717-4717-8717-171717171717");
    await sessionGrant(wrong, { invite: cased, email: "cased-guest@example.test" });
    const still = (
      await db.query(
        "SELECT count(*)::int AS n FROM bootstrap_mcp_mentees WHERE email = 'wrong-guest@example.test'",
      )
    ).rows[0].n;
    assert.equal(still, 0);

    await db.query(
      `INSERT INTO bootstrap_mcp_invites
        (id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at)
       VALUES ('inv-expired-gate', 'expired-guest@example.test', 'alpha', 'mentee-ivelin', 'founder@example.test', $1, '2000-01-01')`,
      [hashMcpToken("inv_expired_gate_token_xxxxxx")],
    );
    const expiredAccess = tokenFor("expired-guest@example.test", "18181818-1818-4818-8818-181818181818");
    const expiredGrant = await sessionGrant(expiredAccess, {});
    assert.deepEqual((await expiredGrant.json()).companies, []);

    const before = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_mentees WHERE email = 'cased-guest@example.test'")
    ).rows[0].n;
    await sessionGrant(casedAccess, {});
    const after = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_mentees WHERE email = 'cased-guest@example.test'")
    ).rows[0].n;
    const redemptions = (
      await db.query(
        `SELECT count(*)::int AS n FROM bootstrap_mcp_invite_redemptions r
         JOIN bootstrap_mcp_invites i ON i.id = r.invite_id
         WHERE i.invitee_email = 'cased-guest@example.test'`,
      )
    ).rows[0].n;
    assert.equal(before, 1);
    assert.equal(after, 1);
    assert.equal(redemptions, 1);
    void charlieToken;
  });

  it("unconfirmed email cannot claim an invite", async () => {
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", "20261015_bootstrap_mcp_accept_on_verified_signin.sql"),
      "utf8",
    );
    const queries = migration.match(
      /SELECT lower\(email\) INTO user_email\s+FROM auth\.users\s+WHERE id = uid\s+AND email_confirmed_at IS NOT NULL;/g,
    );
    assert.equal(queries?.length, 2);

    await db.exec("RESET ROLE");
    const token = "inv_unconfirmed_email_token_xx";
    await db.query(
      `INSERT INTO bootstrap_mcp_invites
        (id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at)
       VALUES ('inv-unconfirmed', 'unconfirmed@example.test', 'alpha', 'mentee-ivelin', 'founder@example.test', $1, now() + interval '7 days')`,
      [hashMcpToken(token)],
    );
    await db.query("SELECT set_config('app.auth_uid', $1, false)", ["19191919-1919-4919-8919-191919191919"]);
    await db.query("SELECT set_config('app.auth_email', $1, false)", ["unconfirmed@example.test"]);
    await db.query("SELECT set_config('app.email_confirmed_at', '', false)");

    const pending = (await db.query("SELECT bootstrap_mcp_accept_pending_invites($1) AS body", [token])).rows[0].body;
    assert.deepEqual(pending, { ok: false, reason: "email_required" });
    const explicit = (await db.query("SELECT bootstrap_mcp_accept_invite($1) AS body", [token])).rows[0].body;
    assert.deepEqual(explicit, { ok: false, reason: "email_required" });

    const row = (
      await db.query(
        "SELECT accepted_at IS NULL AS pending FROM bootstrap_mcp_invites WHERE id = 'inv-unconfirmed'",
      )
    ).rows[0];
    assert.equal(row.pending, true);
    const mentees = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_mentees WHERE email = 'unconfirmed@example.test'")
    ).rows[0].n;
    assert.equal(mentees, 0);

    const memory = new MemoryInviteStore([
      { id: "mentee-ivelin", email: IVELIN_SEED_EMAIL, authUserId: IVELIN_UID, labels: ["alpha"] },
    ]);
    const created = await memory.inviteMember(
      { email: IVELIN_SEED_EMAIL, sub: IVELIN_UID, labels: ["alpha"] },
      { email: "unconfirmed-memory@example.test", companyLabel: "alpha" },
    );
    assert.equal(created.ok, true);
    const denied = await memory.acceptPending(
      { email: "unconfirmed-memory@example.test", sub: "unconfirmed-sub", emailConfirmedAt: null },
      tokenFor("unconfirmed-memory@example.test", "21212121-2121-4212-8212-212121212121"),
    );
    assert.deepEqual(denied, { ok: false, reason: "email_required" });
    assert.equal(memory.mentees.some((row) => row.email === "unconfirmed-memory@example.test"), false);
  });

  it("token without a session grants nothing", async () => {
    useStores();
    const inviteToken = await invite("token-only@example.test", "alpha");
    const denied = await sessionGrant(undefined, { invite: inviteToken, email: "token-only@example.test" });
    assert.equal(denied.status, 401);
    const body = await denied.json();
    assert.equal(body.error, "invalid_token");
    const row = (
      await db.query(
        "SELECT accepted_at IS NULL AS pending FROM bootstrap_mcp_invites WHERE invitee_email = 'token-only@example.test'",
      )
    ).rows[0];
    assert.equal(row.pending, true);
    const mentees = (
      await db.query("SELECT count(*)::int AS n FROM bootstrap_mcp_mentees WHERE email = 'token-only@example.test'")
    ).rows[0].n;
    assert.equal(mentees, 0);
  });

  it("one board is auto-selected; several boards return the list", async () => {
    useStores();
    await invite("solo-board@example.test", "alpha");
    const one = tokenFor("solo-board@example.test", "20202020-2020-4020-8020-202020202020");
    const used = parseTool(
      (await callTool("bootstrap_use_company", {}, one, { "MCP-Session-Id": "onboarding-one" })).body,
    );
    assert.equal(used.ok, true);
    assert.equal(used.activeCompany, "alpha");
    assert.equal(used.isError, undefined);

    const many = tokenFor(IVELIN_SEED_EMAIL, IVELIN_UID);
    const listed = await callTool("bootstrap_use_company", {}, many, { "MCP-Session-Id": "onboarding-many" });
    assert.equal(listed.res.status, 200);
    assert.equal(listed.body.result.isError, undefined);
    const payload = parseTool(listed.body);
    assert.deepEqual(payload.companies, ["alpha", "bravo", "charlie"]);
  });

  it("chooseCompany and presentVerifiedWhoami do not treat no_membership as signed out", () => {
    const presented = presentVerifiedWhoami({
      authenticated: false,
      email: "Guest@Example.TEST",
      labels: [],
      reason: "not_invited",
      identityStore: "supabase",
    });
    assert.equal(presented.authenticated, true);
    assert.equal(presented.reason, "no_membership");
    assert.equal(presented.email, "guest@example.test");
    const authFail = presentVerifiedWhoami({
      authenticated: false,
      labels: [],
      reason: "invalid_or_revoked_token",
      identityStore: "supabase",
    });
    assert.equal(authFail.authenticated, false);
    clearHostedCompanyContextForTests();
    assert.deepEqual(chooseCompany({ sessionKey: "s", labels: ["alpha"] }), { kind: "chosen", company: "alpha" });
    assert.deepEqual(chooseCompany({ sessionKey: "s", labels: ["charlie", "alpha"] }), {
      kind: "list",
      companies: ["alpha", "charlie"],
    });
    assert.deepEqual(chooseCompany({ sessionKey: "s", labels: [] }), { kind: "none" });
  });

  it("memory acceptPending is single-use and ignores a mismatched email", async () => {
    const store = new MemoryInviteStore([
      { id: "mentee-ivelin", email: IVELIN_SEED_EMAIL, authUserId: IVELIN_UID, labels: ["alpha", "bravo", "charlie"] },
    ]);
    const invited = await store.inviteMember(
      { email: IVELIN_SEED_EMAIL, sub: IVELIN_UID, labels: ["alpha", "bravo", "charlie"] },
      { email: "Bill@Example.TEST", companyLabel: "alpha" },
    );
    assert.equal(invited.ok, true);
    const access = tokenFor(BILL_EMAIL, BILL_UID);
    const first = await store.acceptPending({ email: "Bill@Example.TEST", sub: BILL_UID }, access);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.deepEqual(first.accepted, ["alpha"]);
    const second = await store.acceptPending({ email: BILL_EMAIL, sub: BILL_UID }, access);
    assert.equal(second.ok, true);
    assert.equal(store.accessTokens.length, 1);
    assert.equal(store.subjects.length, 1);
    const wrong = await store.acceptPending({ email: "other@example.test", sub: "other-sub" }, tokenFor("other@example.test", "19191919-1919-4919-8919-191919191919"));
    assert.equal(wrong.ok, true);
    if (!wrong.ok) return;
    assert.deepEqual(wrong.accepted, []);
    store.accessTokens[0].revokedAt = new Date().toISOString();
    const revoked = await store.acceptPending({ email: BILL_EMAIL, sub: BILL_UID }, access);
    assert.deepEqual(revoked, { ok: false, reason: "invalid_token" });
  });

  it("supabase acceptPending posts the session token and ignores a URL email", async () => {
    const seen = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      seen.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true, email: "bill@example.test", accepted: ["alpha"], labels: ["alpha"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const store = new SupabaseInviteStore("https://fixture.example", "anon-key-fixture-xx", "header-token");
      const result = await store.acceptPending({ email: "bill@example.test", sub: BILL_UID }, tokenFor(BILL_EMAIL, BILL_UID));
      assert.equal(result.ok, true);
      assert.match(seen[0].url, /bootstrap_mcp_accept_pending_invites/);
      assert.equal(seen[0].body.p_email, undefined);
      assert.equal(typeof seen[0].body.p_token, "string");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

/**
 * CTO/PM E2E role-play matrix (PGlite + hosted handler).
 * Never supabase-pirin-ai. Never prod. Mail is outbox + dry-run only.
 *
 * Matrix + draft prod synthetic SRE (say once): mcp/docs/E2E_ROLEPLAY.md
 * Invite contract (say once): mcp/docs/INVITE.md
 */
import { afterEach, before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  HOSTED_GATED_TOOL_NAMES,
  HOSTED_READ_TOOL_NAMES,
} from "../dist/constants.js";
import {
  IVELIN_SEED_EMAIL,
  IVELIN_SEED_LABELS,
  hashMcpToken,
  setIdentityStoreForTests,
  whoamiFromLabelsRpc,
} from "../dist/identity.js";
import { actorClaimsFromAccessToken, syntheticAccessToken } from "../dist/journey-auth.js";
import { HOSTED_MCP_RESOURCE, WWW_AUTHENTICATE_CHALLENGE, isJwtAccessToken } from "../dist/oauth.js";
import {
  PgliteInviteStore,
  SupabaseInviteStore,
  setInviteClockForTests,
  setInviteStoreForTests,
} from "../dist/invite.js";
import {
  INVITE_MAIL_FROM,
  setInviteMailSinkForTests,
} from "../dist/invite-mail.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { REPO_ROOT } from "./helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(__dirname, "pglite", "identity-schema.sql");
const E2E_DOC = path.join(REPO_ROOT, "mcp", "docs", "E2E_ROLEPLAY.md");
const HOSTED_DOC = path.join(REPO_ROOT, "mcp", "docs", "HOSTED_IDENTITY.md");
const INVITE_DOC = path.join(REPO_ROOT, "mcp", "docs", "INVITE.md");

const IVELIN_UID = "33333333-3333-3333-3333-333333333333";
const A_UID = "11111111-1111-1111-1111-111111111111";
const B_UID = "22222222-2222-2222-2222-222222222222";
const STRANGER_UID = "99999999-9999-9999-9999-999999999999";
const CTO_UID = "55555555-5555-5555-5555-555555555555";
const BILL_UID = "66666666-6666-6666-6666-666666666666";
const BILL_EMAIL = "bill@example.test";
const OUTSIDER_UID = "77777777-7777-7777-7777-777777777777";
const OUTSIDER_EMAIL = "member@example.test";

let db;
let rpcId = 80;

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setInviteStoreForTests(undefined);
  setJourneyStoreForTests(undefined);
  setInviteClockForTests();
  setInviteMailSinkForTests(undefined);
  delete process.env.VERCEL_ENV;
  delete process.env.BOOTSTRAP_INVITE_MAIL;
});

function usePgliteStores() {
  setIdentityStoreForTests(pgliteIdentityStore(db));
  setInviteStoreForTests(new PgliteInviteStore(db));
}

function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

/** PGlite-backed store for role-play. Test-only. Never a prod adapter. */
function pgliteIdentityStore(database) {
  return {
    kind: "supabase",
    async whoami(token) {
      if (!token || token.length < 16) {
        return {
          authenticated: false,
          labels: [],
          reason: "missing_or_short_token",
          identityStore: "supabase",
        };
      }
      if (!isJwtAccessToken(token)) {
        return {
          authenticated: false,
          labels: [],
          reason: "not_a_pirin_access_token",
          identityStore: "supabase",
        };
      }
      const exp = jwtExp(token);
      if (typeof exp === "number" && exp * 1000 < Date.now()) {
        return {
          authenticated: false,
          labels: [],
          reason: "invalid_or_revoked_token",
          identityStore: "supabase",
        };
      }
      const claims = actorClaimsFromAccessToken(token);
      if (!claims) {
        return {
          authenticated: false,
          labels: [],
          reason: "not_a_pirin_access_token",
          identityStore: "supabase",
        };
      }
      const uid = claims.sub ?? "";
      const email = claims.email ?? "";
      await database.exec("RESET ROLE");
      await database.query("SELECT set_config('app.auth_uid', $1, false)", [uid]);
      await database.query("SELECT set_config('app.auth_email', $1, false)", [email]);
      try {
        const body = (await database.query("SELECT bootstrap_mcp_my_labels() AS body")).rows[0].body;
        return whoamiFromLabelsRpc(email || undefined, body, true);
      } catch {
        return {
          authenticated: false,
          labels: [],
          reason: "identity_lookup_failed",
          identityStore: "supabase",
        };
      }
    },
  };
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

async function assertGated401(res, reason) {
  assert.equal(res.status, 401);
  const challenge = res.headers.get("WWW-Authenticate") ?? "";
  assert.ok(challenge.startsWith(WWW_AUTHENTICATE_CHALLENGE));
  if (challenge !== WWW_AUTHENTICATE_CHALLENGE) {
    assert.match(challenge, /error="invalid_token"/);
  }
  const body = JSON.parse(await res.text());
  assert.equal(body.error, "invalid_token");
  if (reason) assert.equal(body.reason, reason);
  const blob = JSON.stringify(body);
  assert.doesNotMatch(blob, /"(alpha|bravo|bravo|alpha|secret-other)"/);
  assert.equal(body.labels, undefined);
  return body;
}

function parseTool(result) {
  const text = result.result.content.map((c) => c.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function inviteTokenFromPublic(payload) {
  const url = new URL(payload.signInUrl);
  return url.searchParams.get("invite");
}

async function whoamiPass(token) {
  const res = await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, token);
  const text = await res.text();
  assert.equal(res.status, 200, text);
  return parseTool(JSON.parse(text));
}

async function callTool(name, args, token, extraHeaders = {}) {
  const res = await rawRpc("tools/call", { name, arguments: args }, token, extraHeaders);
  const text = await res.text();
  return { res, body: JSON.parse(text), text };
}

function assertNoLabelLeak(blob) {
  assert.doesNotMatch(blob, /"(alpha|bravo|bravo|secret-other)"/);
}

describe("E2E role-play matrix (PGlite, never prod)", { concurrency: false }, () => {
  before(async () => {
    db = new PGlite();
    await db.exec(fs.readFileSync(SCHEMA, "utf8"));
  });

  after(async () => {
    await db?.close();
  });

  it("docs say the matrix once; P1–P3 shipped; no prod mail", () => {
    const e2e = fs.readFileSync(E2E_DOC, "utf8");
    const hosted = fs.readFileSync(HOSTED_DOC, "utf8");
    const invite = fs.readFileSync(INVITE_DOC, "utf8");
    assert.match(e2e, /E2E role-play matrix/);
    assert.match(e2e, /R1/);
    assert.match(e2e, /not_invited/);
    assert.match(e2e, /First-user|first-user/);
    assert.match(e2e, /alpha/);
    assert.match(e2e, /invite_member/);
    assert.match(e2e, /invite_store_unset/);
    assert.match(e2e, /accept_invite/);
    assert.match(e2e, /P1/);
    assert.match(e2e, /P2/);
    assert.match(e2e, /Invitee login-URL accept/);
    assert.match(e2e, /P4/);
    assert.match(e2e, /Existing user, second workspace/);
    assert.match(e2e, /P5/);
    assert.match(e2e, /What companies/);
    assert.match(e2e, /P6/);
    assert.match(e2e, /use_company/);
    assert.match(e2e, /P7/);
    assert.match(e2e, /Where are we/);
    assert.match(e2e, /R8/);
    assert.match(e2e, /cross-tenant-leak\.test\.mjs/);
    assert.match(e2e, /verify_invite/);
    assert.match(e2e, /bootstrap@pirin\.ai/);
    assert.match(e2e, /No prod Resend/);
    assert.match(e2e, /INVITE\.md/);
    assert.match(e2e, /Draft prod synthetic SRE/);
    assert.match(e2e, /GET \/health/);
    assert.match(e2e, /WWW-Authenticate/);
    assert.match(e2e, /Redeploy|previous production/);
    assert.match(e2e, /preview-live\.mjs/);
    assert.match(e2e, /not.*npm run ci/i);
    assert.match(e2e, /supabase-pirin-ai/);
    assert.match(e2e, /Never.*PR cloud agents|do \*\*not\*\* migrate/i);
    assert.match(e2e, /HOSTED_IDENTITY\.md#first-user-rebuild-from-github/);
    assert.doesNotMatch(e2e, /INSERT INTO public\.bootstrap_mcp_mentees/);
    assert.match(hosted, /E2E_ROLEPLAY\.md/);
    assert.match(hosted, /INVITE\.md/);
    assert.match(hosted, /First user \(rebuild from GitHub\)/);
    assert.match(invite, /DraftExternalMessage/);
    assert.match(invite, /Bill/);
  });

  it("wires invite_member / accept_invite into CI; mailer is enqueue + dry-run", () => {
    assert.ok(HOSTED_GATED_TOOL_NAMES.includes("invite_member"));
    assert.ok(HOSTED_GATED_TOOL_NAMES.includes("accept_invite"));
    for (const name of HOSTED_READ_TOOL_NAMES) {
      assert.doesNotMatch(name, /invite|mailer/i);
    }
    const server = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "server.ts"), "utf8");
    assert.match(server, /invite_member/);
    assert.match(server, /accept_invite/);
    const inviteSrc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "invite.ts"), "utf8");
    const mailSrc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "invite-mail.ts"), "utf8");
    assert.doesNotMatch(inviteSrc, /from ["']resend["']|smtp|nodemailer|sendgrid/i);
    assert.doesNotMatch(mailSrc, /from ["']resend["']|smtp|nodemailer|sendgrid/i);
    assert.match(mailSrc, /bootstrap@pirin\.ai/);
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "mcp", "package.json"), "utf8"));
    assert.match(pkg.scripts["test:unit"], /e2e-roleplay-matrix\.test\.mjs/);
    assert.match(pkg.scripts["test:coverage"], /scripts\/coverage\.mjs/);
    assert.match(pkg.scripts.ci, /test:coverage/);
    const cov = fs.readFileSync(path.join(REPO_ROOT, "mcp", "scripts", "coverage.mjs"), "utf8");
    assert.match(cov, /test-coverage-lines=80/);
    assert.match(pkg.scripts["test:unit"], /invite\.test\.mjs/);
    assert.match(pkg.scripts["test:unit"], /invite-mail\.test\.mjs/);
    assert.doesNotMatch(pkg.scripts["test:unit"], /preview-live/);
    assert.doesNotMatch(pkg.scripts.ci, /preview-live/);
  });

  it("R1 PM empty Bearer: handshake + whoami 401 missing_or_short_token", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const handshake = await rawRpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e-empty", version: "0.0.0" },
    });
    await assertGated401(handshake, "missing_or_short_token");
    await assertGated401(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }),
      "missing_or_short_token",
    );
  });

  it("R2 PM uninvited JWT: gated whoami 401 not_invited", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const token = syntheticAccessToken({
      email: "stranger@example.test",
      sub: STRANGER_UID,
    });
    const gated = await assertGated401(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, token),
      "not_invited",
    );
    assert.match(gated.error_description ?? "", /not on the hosted MCP allowlist/i);
    await assertGated401(
      await rawRpc("tools/call", { name: "bootstrap_list_company_labels", arguments: {} }, token),
      "not_invited",
    );
  });

  it("R3 CTO first-user SQL insert → invited whoami PASS (alpha)", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    await db.exec("RESET ROLE");
    await db.query(
      "INSERT INTO bootstrap_mcp_mentees (id, email, auth_user_id) VALUES ($1, lower($2), NULL)",
      ["mentee-cto-insert", "CTO-First@example.test"],
    );
    await db.query(
      "INSERT INTO bootstrap_company_labels (id, mentee_id, label) VALUES ($1, $2, $3)",
      ["lcto", "mentee-cto-insert", "alpha"],
    );
    const token = syntheticAccessToken({
      email: "CTO-First@example.test",
      sub: CTO_UID,
    });
    const who = await whoamiPass(token);
    assert.equal(who.authenticated, true);
    assert.equal(who.email, "cto-first@example.test");
    assert.deepEqual(who.labels, ["alpha"]);
    assert.match(String(who.note), /Companies this login can open/);
    const bound = (
      await db.query("SELECT auth_user_id, email FROM bootstrap_mcp_mentees WHERE id = 'mentee-cto-insert'")
    ).rows[0];
    assert.equal(bound.email, "cto-first@example.test");
    assert.equal(bound.auth_user_id, CTO_UID);
  });

  it("R4 wrong token: non-JWT Bearer stays 401 and leaks no labels", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    await assertGated401(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, "bos_not_a_real_token_xx"),
      "not_a_pirin_access_token",
    );
  });

  it("R5 expired JWT: invited email still 401 invalid_or_revoked_token", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const token = syntheticAccessToken({
      email: IVELIN_SEED_EMAIL,
      sub: IVELIN_UID,
      extra: { exp: 1 },
    });
    await assertGated401(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, token),
      "invalid_or_revoked_token",
    );
  });

  it("R6 cross-company labels + R7 invited Ivelin alpha dogfood", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const a = await whoamiPass(syntheticAccessToken({ email: "mentee-a@example.test", sub: A_UID }));
    const b = await whoamiPass(syntheticAccessToken({ email: "mentee-b@example.test", sub: B_UID }));
    const ivelin = await whoamiPass(syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID }));
    assert.deepEqual(a.labels, ["alpha"]);
    assert.deepEqual(b.labels, ["bravo"]);
    assert.deepEqual(ivelin.labels, [...IVELIN_SEED_LABELS]);
    assert.ok(!a.labels.includes("bravo") && !a.labels.includes("charlie"));
    assert.ok(!b.labels.includes("alpha") && !b.labels.includes("charlie"));
  });

  it("P1 invite_member: Ivelin invites Bill to alpha; uninvited and cross-company fail", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });
    const stranger = syntheticAccessToken({ email: "stranger@example.test", sub: STRANGER_UID });
    const aTok = syntheticAccessToken({ email: "mentee-a@example.test", sub: A_UID });

    await assertGated401(
      await rawRpc("tools/call", { name: "invite_member", arguments: { email: BILL_EMAIL, companyLabel: "alpha" } }),
      "missing_or_short_token",
    );
    await assertGated401(
      await rawRpc(
        "tools/call",
        { name: "invite_member", arguments: { email: BILL_EMAIL, companyLabel: "alpha" } },
        stranger,
      ),
      "not_invited",
    );

    const cross = await callTool("invite_member", { email: "other@example.test", companyLabel: "bravo" }, aTok);
    assert.equal(cross.res.status, 200, cross.text);
    assert.equal(cross.body.result.isError, true);
    assert.match(cross.body.result.content.map((c) => c.text).join("\n"), /does not hold/i);
    assertNoLabelLeak(cross.text);

    const invited = await callTool("invite_member", { email: "Bill@Example.TEST", companyLabel: "alpha" }, ivelin);
    assert.equal(invited.res.status, 200, invited.text);
    const payload = parseTool(invited.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.from, IVELIN_SEED_EMAIL);
    assert.equal(payload.invited, BILL_EMAIL);
    assert.equal(payload.company, "alpha");
    assert.match(payload.signInUrl, /^https:\/\/pirin\.ai\/bootstrap-os\/login\?invite=inv_/);
    assert.match(payload.note, /email at that address/);
    const blob = JSON.stringify(payload);
    assert.doesNotMatch(blob, /webhook|cron|queuedMail|mail mode|never talks to Resend/i);
    assert.match(inviteTokenFromPublic(payload), /^inv_/);
    const outbox = (await db.query("SELECT channel, payload FROM bootstrap_mcp_invite_outbox")).rows;
    const inChat = outbox.filter((row) => row.channel === "in_chat");
    const email = outbox.filter((row) => row.channel === "email");
    assert.ok(inChat.length >= 1);
    assert.ok(email.length >= 1);
    assert.equal(inChat[inChat.length - 1].payload.inviteToken, null);
    assert.equal(email[email.length - 1].payload.mailFrom, INVITE_MAIL_FROM);
    assert.match(String(email[email.length - 1].payload.signupUrl), /\/bootstrap-os\/login\?invite=inv_/);
  });

  it("P1 invite_member: unset store vs RPC failure are distinct user-facing errors", async () => {
    process.env.VERCEL_ENV = "production";
    setIdentityStoreForTests(pgliteIdentityStore(db));
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });

    setInviteStoreForTests(null);
    const unset = await callTool("invite_member", { email: BILL_EMAIL, companyLabel: "alpha" }, ivelin);
    assert.equal(unset.res.status, 200, unset.text);
    assert.equal(unset.body.result.isError, true);
    const unsetMsg = unset.body.result.content.map((c) => c.text).join("\n");
    assert.match(unsetMsg, /Invite store unset/);
    assert.doesNotMatch(unsetMsg, /Invite RPC failed/);

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/rest/v1/rpc/bootstrap_mcp_invite_member")) {
        return new Response(
          JSON.stringify({
            code: "PGRST202",
            message:
              "Could not find the function public.bootstrap_mcp_invite_member(p_email, p_company_label) in the schema cache",
          }),
          { status: 404 },
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    };
    try {
      setInviteStoreForTests(
        new SupabaseInviteStore("https://rpc-fail.example", "anon-key-fixture-xx", ivelin),
      );
      const failed = await callTool("invite_member", { email: BILL_EMAIL, companyLabel: "alpha" }, ivelin);
      assert.equal(failed.res.status, 200, failed.text);
      assert.equal(failed.body.result.isError, true);
      const msg = failed.body.result.content.map((c) => c.text).join("\n");
      assert.match(msg, /Invite RPC failed \(HTTP 404\)/);
      assert.match(msg, /PGRST202/);
      assert.match(msg, /schema cache/);
      assert.doesNotMatch(msg, /Invite store unset/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("P2 accept_invite: Bill lands on alpha; wrong email / expired / replay / bad token fail", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });
    const bill = syntheticAccessToken({ email: BILL_EMAIL, sub: BILL_UID });
    const stranger = syntheticAccessToken({ email: "stranger@example.test", sub: STRANGER_UID });

    const created = parseTool(
      (await callTool("invite_member", { email: BILL_EMAIL, companyLabel: "alpha" }, ivelin)).body,
    );
    const token = inviteTokenFromPublic(created);

    await assertGated401(
      await rawRpc("tools/call", { name: "accept_invite", arguments: { token } }),
      "missing_or_short_token",
    );

    const mismatch = await callTool("accept_invite", { token }, stranger);
    assert.equal(mismatch.body.result.isError, true);
    assert.match(mismatch.body.result.content.map((c) => c.text).join("\n"), /Invite rejected/);
    assertNoLabelLeak(mismatch.text);

    const bad = await callTool("accept_invite", { token: "inv_not_a_real_invite_token_xx" }, bill);
    assert.equal(bad.body.result.isError, true);
    assert.match(bad.body.result.content.map((c) => c.text).join("\n"), /Invite rejected/);

    const expiredToken = "inv_expired_fixture_token_xxxxxx";
    await db.exec("RESET ROLE");
    await db.query(
      `INSERT INTO bootstrap_mcp_invites
        (id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at, accepted_at)
       VALUES ($1, $2, 'alpha', 'mentee-ivelin', $3, $4, $5, NULL)`,
      ["inv-expired", "expired-verify@example.test", IVELIN_SEED_EMAIL, hashMcpToken(expiredToken), "2000-01-01T00:00:00.000Z"],
    );
    const expired = await callTool("accept_invite", { token: expiredToken }, bill);
    assert.equal(expired.body.result.isError, true);
    assert.match(expired.body.result.content.map((c) => c.text).join("\n"), /Invite rejected/);

    const accepted = await callTool("accept_invite", { token }, bill);
    assert.equal(accepted.res.status, 200, accepted.text);
    const ok = parseTool(accepted.body);
    assert.equal(ok.ok, true);
    assert.equal(ok.email, BILL_EMAIL);
    assert.deepEqual(ok.labels, ["alpha"]);

    const who = await whoamiPass(bill);
    assert.equal(who.authenticated, true);
    assert.equal(who.email, BILL_EMAIL);
    assert.deepEqual(who.labels, ["alpha"]);
    assert.ok(!who.labels.includes("bravo") && !who.labels.includes("charlie"));

    const replay = await callTool("accept_invite", { token }, bill);
    assert.equal(replay.body.result.isError, true);
    assert.match(replay.body.result.content.map((c) => c.text).join("\n"), /Invite rejected/);
  });

  it("P3 Invitee login-URL: mail outbox + verify + signup URL + accept → whoami alpha", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.BOOTSTRAP_INVITE_MAIL = "dry-run";
    usePgliteStores();
    const seen = [];
    setInviteMailSinkForTests((m) => seen.push(m));
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });
    const outsider = syntheticAccessToken({ email: OUTSIDER_EMAIL, sub: OUTSIDER_UID });

    const created = parseTool(
      (await callTool("invite_member", { email: OUTSIDER_EMAIL, companyLabel: "alpha" }, ivelin))
        .body,
    );
    assert.equal(created.ok, true);
    const token = inviteTokenFromPublic(created);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].from, INVITE_MAIL_FROM);
    assert.equal(seen[0].to, OUTSIDER_EMAIL);
    assert.match(seen[0].text, /Who invited: founder@example\.test/);
    assert.match(seen[0].signupUrl, new RegExp(`invite=${token}`));

    const store = new PgliteInviteStore(db);
    const verified = await store.verifyInvite(token);
    assert.deepEqual(verified, {
      ok: true,
      invitee_email: OUTSIDER_EMAIL,
      company_label: "alpha",
      inviter_email: IVELIN_SEED_EMAIL,
    });
    assert.deepEqual(await store.verifyInvite("inv_not_a_real_invite_token_xx"), { ok: false });

    const expiredToken = "inv_expired_login_url_token_xxxx";
    await db.exec("RESET ROLE");
    await db.query(
      `INSERT INTO bootstrap_mcp_invites
        (id, invitee_email, company_label, invited_by_mentee_id, invited_by_email, token_hash, expires_at, accepted_at)
       VALUES ($1, $2, 'alpha', 'mentee-ivelin', $3, $4, $5, NULL)`,
      ["inv-expired-url", "expired-login-url@example.test", IVELIN_SEED_EMAIL, hashMcpToken(expiredToken), "2000-01-01T00:00:00.000Z"],
    );
    const expiredVerify = await store.verifyInvite(expiredToken);
    assert.deepEqual(expiredVerify, { ok: false });
    assert.equal("reason" in expiredVerify, false);

    await assertGated401(
      await rawRpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, outsider),
      "not_invited",
    );

    const accepted = await callTool("accept_invite", { token }, outsider);
    assert.equal(accepted.res.status, 200, accepted.text);
    const ok = parseTool(accepted.body);
    assert.equal(ok.ok, true);
    assert.equal(ok.email, OUTSIDER_EMAIL);
    assert.deepEqual(ok.labels, ["alpha"]);

    const who = await whoamiPass(outsider);
    assert.equal(who.authenticated, true);
    assert.equal(who.email, OUTSIDER_EMAIL);
    assert.deepEqual(who.labels, ["alpha"]);

    assert.deepEqual(await store.verifyInvite(token), { ok: false });
  });

  it("P4 existing user second workspace: mentee-a (alpha) + charlie; already_member; isolation", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });
    const aTok = syntheticAccessToken({ email: "mentee-a@example.test", sub: A_UID });
    const bTok = syntheticAccessToken({ email: "mentee-b@example.test", sub: B_UID });

    const before = await whoamiPass(aTok);
    assert.deepEqual(before.labels, ["alpha"]);

    const created = parseTool(
      (await callTool("invite_member", { email: "mentee-a@example.test", companyLabel: "charlie" }, ivelin))
        .body,
    );
    assert.equal(created.ok, true);
    const token = inviteTokenFromPublic(created);

    const accepted = await callTool("accept_invite", { token }, aTok);
    assert.equal(accepted.res.status, 200, accepted.text);
    const ok = parseTool(accepted.body);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.labels, ["alpha", "charlie"]);

    const who = await whoamiPass(aTok);
    assert.equal(who.authenticated, true);
    assert.deepEqual(who.labels, ["alpha", "charlie"]);
    assert.ok(!who.labels.includes("bravo"));

    const again = await callTool(
      "invite_member",
      { email: "mentee-a@example.test", companyLabel: "charlie" },
      ivelin,
    );
    assert.equal(again.body.result.isError, true);
    assert.match(again.body.result.content.map((c) => c.text).join("\n"), /already on this company workspace/);

    const b = await whoamiPass(bTok);
    assert.deepEqual(b.labels, ["bravo"]);
    assert.ok(!b.labels.includes("alpha"));
    assert.ok(!b.labels.includes("charlie"));
  });

  it("P5 Grok App: what companies do I have — whoami/list_companies, not docs, not journey", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });

    const listed = await rawRpc("tools/list", {}, ivelin);
    assert.equal(listed.status, 200);
    const names = JSON.parse(await listed.text()).result.tools.map((t) => t.name);
    assert.ok(names.includes("bootstrap_whoami"));
    assert.ok(names.includes("bootstrap_list_companies"));
    assert.ok(names.includes("bootstrap_use_company"));
    assert.ok(!names.includes("get_journey"));

    const who = await whoamiPass(ivelin);
    assert.deepEqual(who.companies, [...IVELIN_SEED_LABELS]);
    assert.doesNotMatch(JSON.stringify(who), /user-bootstrap-os-mcp|operating-system|first-hour|clock-examples/);

    const companies = parseTool((await callTool("bootstrap_list_companies", {}, ivelin)).body);
    assert.deepEqual(companies.companies, [...IVELIN_SEED_LABELS]);

    const docs = parseTool((await callTool("bootstrap_list_docs", {}, ivelin)).body);
    const docKeys = JSON.stringify(docs);
    assert.match(docKeys, /operating-system/);
    assert.match(docKeys, /clock-examples/);
    for (const company of IVELIN_SEED_LABELS) {
      assert.ok(companies.companies.includes(company));
      assert.doesNotMatch(docKeys, new RegExp(`"${company}"`));
    }
  });

  it("P6 look at alpha then invite without naming company; reject a company you do not hold", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });
    const session = { "MCP-Session-Id": "e2e-p6-alpha" };

    const denied = await callTool(
      "bootstrap_use_company",
      { company: "not-a-team" },
      ivelin,
      session,
    );
    assert.equal(denied.body.result.isError, true);
    assert.match(denied.body.result.content[0].text, /don't have access/i);

    const used = parseTool((await callTool("bootstrap_use_company", { company: "alpha" }, ivelin, session)).body);
    assert.equal(used.ok, true);
    assert.equal(used.activeCompany, "alpha");

    const who = parseTool((await callTool("bootstrap_whoami", {}, ivelin, session)).body);
    assert.equal(who.activeCompany, "alpha");
    assert.deepEqual(who.companies, [...IVELIN_SEED_LABELS]);

    const invited = parseTool(
      (await callTool("invite_member", { email: "p6-invitee@example.test" }, ivelin, session)).body,
    );
    assert.equal(invited.ok, true);
    assert.equal(invited.company, "alpha");
  });

  it("P7 where are we on alpha — shared board snapshot, not GitHub", async () => {
    process.env.VERCEL_ENV = "production";
    usePgliteStores();
    setJourneyStoreForTests(
      new HostedMembershipJourneyStore((actor) =>
        actor.email === IVELIN_SEED_EMAIL ? [...IVELIN_SEED_LABELS] : [],
      ),
    );
    const ivelin = syntheticAccessToken({ email: IVELIN_SEED_EMAIL, sub: IVELIN_UID });
    const session = { "MCP-Session-Id": "e2e-p7-alpha" };
    await callTool("bootstrap_use_company", { company: "alpha" }, ivelin, session);
    const listed = await rawRpc("tools/list", {}, ivelin, session);
    const names = JSON.parse(await listed.text()).result.tools.map((t) => t.name);
    assert.ok(names.includes("get_journey"));
    assert.ok(names.includes("bootstrap_where_are_we"));
    const board = parseTool((await callTool("bootstrap_where_are_we", {}, ivelin, session)).body);
    assert.equal(board.ok, true);
    assert.equal(board.company.slug, "alpha");
    assert.equal(board.ideas[0].clocks.journeyPhase, 1);
    assert.match(String(board.ideas[0].visualFlow), /mermaid/);
    assert.doesNotMatch(JSON.stringify(board), /github.com|alpha\.bot/);
    const other = parseTool((await callTool("get_journey", { company: "not-a-team" }, ivelin, session)).body);
    assert.equal(other.ok, false);
  });
});

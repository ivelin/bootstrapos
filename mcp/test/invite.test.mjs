/**
 * Invite + accept unit locks (memory). PGlite HTTP matrix lives in e2e-roleplay-matrix.
 * Never supabase-pirin-ai. Never prod. No Resend HTTP from this repo.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MemoryInviteStore,
  SupabaseInviteStore,
  buildAcceptCard,
  buildSignupAuthCard,
  createInviteStore,
  decideInviteAccept,
  decideInviteCreate,
  decideInviteVerify,
  enqueueInviteEmail,
  enqueueInviteInChat,
  inviteEmailOutboxPayload,
  inviteFailMessage,
  inviteOutboxPayload,
  inviteRpcFailed,
  normalizeCompanyLabel,
  normalizeInviteEmail,
  parseInviteRpcJson,
  setInviteClockForTests,
  setInviteEnqueueHook,
  setInviteStoreForTests,
} from "../dist/invite.js";
import { INVITE_MAIL_FROM } from "../dist/invite-mail.js";
import { IVELIN_SEED_EMAIL, IVELIN_SEED_LABELS } from "../dist/identity.js";
import { REPO_ROOT } from "./helpers.mjs";

const INVITE_DOC = path.join(REPO_ROOT, "mcp", "docs", "INVITE.md");
const HOSTED_DOC = path.join(REPO_ROOT, "mcp", "docs", "HOSTED_IDENTITY.md");
const SQL = path.join(
  REPO_ROOT,
  "mcp",
  "supabase",
  "migrations",
  "20260910_bootstrap_mcp_invite_accept.sql",
);
const QUALIFY_SQL = path.join(
  REPO_ROOT,
  "mcp",
  "supabase",
  "migrations",
  "20260910_bootstrap_mcp_invite_qualify_label.sql",
);
const PGCRYPTO_SQL = path.join(
  REPO_ROOT,
  "mcp",
  "supabase",
  "migrations",
  "20260911_bootstrap_mcp_invite_pgcrypto_search_path.sql",
);
const VERIFY_SQL = path.join(
  REPO_ROOT,
  "mcp",
  "supabase",
  "migrations",
  "20260911_bootstrap_mcp_invite_verify_email_outbox.sql",
);
const PGLITE_SCHEMA = path.join(REPO_ROOT, "mcp", "test", "pglite", "identity-schema.sql");

afterEach(() => {
  setInviteStoreForTests(undefined);
  setInviteClockForTests();
  setInviteEnqueueHook(undefined);
  delete process.env.VERCEL_ENV;
});

function ivelinStore() {
  return new MemoryInviteStore([
    {
      id: "mentee-ivelin",
      email: IVELIN_SEED_EMAIL,
      authUserId: "33333333-3333-3333-3333-333333333333",
      labels: [...IVELIN_SEED_LABELS],
    },
    {
      id: "mentee-a",
      email: "mentee-a@example.test",
      authUserId: "11111111-1111-1111-1111-111111111111",
      labels: ["alpha"],
    },
  ]);
}

describe("invite + accept (memory, never prod)", { concurrency: false }, () => {
  it("docs say invite once and keep first-user SQL on HOSTED_IDENTITY", () => {
    const invite = fs.readFileSync(INVITE_DOC, "utf8");
    const hosted = fs.readFileSync(HOSTED_DOC, "utf8");
    assert.match(invite, /invite_member/);
    assert.match(invite, /accept_invite/);
    assert.match(invite, /DraftExternalMessage/);
    assert.match(invite, /who invited/);
    assert.match(invite, /Bill/);
    assert.match(invite, /alpha/);
    assert.match(invite, /mail/i);
    assert.match(invite, /QR/);
    assert.match(invite, /SMS/);
    assert.match(invite, /login\?invite=/);
    assert.match(invite, /Universal/);
    assert.match(invite, /already_member/);
    assert.match(invite, /HOSTED_IDENTITY\.md#first-user-rebuild-from-github/);
    assert.match(invite, /20260910_bootstrap_mcp_invite_accept\.sql/);
    assert.match(invite, /20260910_bootstrap_mcp_invite_qualify_label\.sql/);
    assert.match(invite, /20260911_bootstrap_mcp_invite_pgcrypto_search_path\.sql/);
    assert.match(invite, /20260911_bootstrap_mcp_invite_verify_email_outbox\.sql/);
    assert.match(invite, /20260912_bootstrap_mcp_invite_existing_member\.sql/);
    assert.match(invite, /bootstrap_mcp_verify_invite/);
    assert.match(invite, /bootstrap@pirin\.ai/);
    assert.match(invite, /login\?invite=/);
    assert.match(invite, /service_role/);
    assert.match(invite, /no Cos yes per invite/);
    assert.match(invite, /PGlite/);
    assert.match(invite, /supabase-pirin-ai/);
    assert.match(invite, /invite_store_unset/);
    assert.match(invite, /invite_rpc_failed/);
    assert.doesNotMatch(invite, /INSERT INTO public\.bootstrap_mcp_mentees/);
    assert.match(hosted, /INVITE\.md/);
    assert.match(hosted, /First user \(rebuild from GitHub\)/);
    assert.match(hosted, /20260910_bootstrap_mcp_invite_qualify_label\.sql/);
    assert.match(hosted, /20260911_bootstrap_mcp_invite_pgcrypto_search_path\.sql/);
    assert.match(hosted, /20260911_bootstrap_mcp_invite_verify_email_outbox\.sql/);
    assert.match(hosted, /20260912_bootstrap_mcp_invite_existing_member\.sql/);
    const sql = fs.readFileSync(SQL, "utf8");
    assert.match(sql, /DO NOT apply from a PR cloud agent/);
    assert.match(sql, /bootstrap_mcp_invite_member/);
    assert.match(sql, /bootstrap_mcp_accept_invite/);
    assert.match(sql, /channel = 'in_chat'/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_invite_member[\s\S]{0,40}anon/);
    assert.doesNotMatch(sql, /smtp|nodemailer|sendgrid/i);
    assert.doesNotMatch(sql, /supabase\.co/);
    const qualify = fs.readFileSync(QUALIFY_SQL, "utf8");
    const pglite = fs.readFileSync(PGLITE_SCHEMA, "utf8");
    const withoutComments = (sql) => sql.replace(/--[^\n]*/g, "");
    assert.match(qualify, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.match(qualify, /cl\.label = company_label/);
    assert.doesNotMatch(withoutComments(qualify), /AND label = label/);
    assert.match(qualify, /DO NOT apply from a PR cloud agent/);
    assert.doesNotMatch(qualify, /supabase\.co/);
    assert.match(pglite, /SELECT bootstrap_mcp_invite_member|bootstrap_mcp_invite_member\(p_email/);
    assert.match(pglite, /cl\.label = workspace/);
    assert.doesNotMatch(withoutComments(pglite), /AND label = label/);
    assert.match(pglite, /SET search_path = public, extensions/);
    assert.match(pglite, /extensions\.gen_random_bytes\(24\)/);
    assert.match(pglite, /bootstrap_mcp_verify_invite/);
    assert.match(pglite, /channel IN \('in_chat', 'email'\)/);
    assert.match(pglite, /REVOKE ALL ON FUNCTION bootstrap_mcp_verify_invite/);
    const pgcrypto = fs.readFileSync(PGCRYPTO_SQL, "utf8");
    assert.match(pgcrypto, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.match(pgcrypto, /SET search_path = public, extensions/);
    assert.match(pgcrypto, /extensions\.gen_random_bytes\(24\)/);
    assert.match(pgcrypto, /CREATE EXTENSION IF NOT EXISTS pgcrypto/);
    assert.match(pgcrypto, /DO NOT apply from a PR cloud agent/);
    assert.match(pgcrypto, /42883/);
    assert.doesNotMatch(withoutComments(pgcrypto), /AND label = label/);
    assert.match(pgcrypto, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.doesNotMatch(pgcrypto, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_invite_member[\s\S]{0,40}anon/);
    assert.doesNotMatch(pgcrypto, /supabase\.co/);
    assert.doesNotMatch(pgcrypto, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_accept_invite/);
    assert.doesNotMatch(pgcrypto, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_mint_token/);
    const verifySql = fs.readFileSync(VERIFY_SQL, "utf8");
    const withoutVerifyComments = (s) => s.replace(/--[^\n]*/g, "");
    assert.match(verifySql, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_verify_invite/);
    assert.match(verifySql, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.match(verifySql, /channel IN \('in_chat', 'email'\)/);
    assert.match(verifySql, /delivered_at/);
    assert.match(verifySql, /bootstrap@pirin\.ai/);
    assert.match(verifySql, /login\?invite=/);
    assert.match(verifySql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_verify_invite\(text\) TO service_role/);
    assert.match(verifySql, /REVOKE ALL ON FUNCTION public\.bootstrap_mcp_verify_invite\(text\) FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(verifySql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_verify_invite[\s\S]{0,40}anon/);
    assert.doesNotMatch(verifySql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_verify_invite[\s\S]{0,60}authenticated/);
    assert.doesNotMatch(withoutVerifyComments(verifySql), /AND label = label/);
    assert.match(verifySql, /jsonb_build_object\('ok', false\)/);
    assert.doesNotMatch(verifySql, /'reason', 'invite_expired'/);
    assert.doesNotMatch(verifySql, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_accept_invite/);
    assert.match(verifySql, /DO NOT apply from a PR cloud agent/);
    assert.doesNotMatch(verifySql, /supabase\.co/);
    assert.doesNotMatch(verifySql, /smtp|nodemailer|sendgrid|from ["']resend["']/i);
    const existingSql = fs.readFileSync(
      path.join(REPO_ROOT, "mcp", "supabase", "migrations", "20260912_bootstrap_mcp_invite_existing_member.sql"),
      "utf8",
    );
    assert.match(existingSql, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.match(existingSql, /already_member/);
    assert.match(existingSql, /bootstrap_mcp_invites_pending_email_label_idx/);
    assert.match(existingSql, /i\.company_label = workspace/);
    assert.doesNotMatch(existingSql.replace(/--[^\n]*/g, ""), /AND company_label = company_label/);
    assert.match(existingSql, /Sign in or create account/);
    assert.match(existingSql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_invite_member/);
    assert.doesNotMatch(existingSql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_mcp_invite_member[\s\S]{0,40}anon/);
    assert.doesNotMatch(existingSql, /CREATE OR REPLACE FUNCTION public\.bootstrap_mcp_accept_invite/);
    assert.doesNotMatch(existingSql.replace(/--[^\n]*/g, ""), /AND label = label/);
    assert.match(existingSql, /DO NOT apply from a PR cloud agent/);
    assert.doesNotMatch(existingSql, /supabase\.co/);
    assert.match(pglite, /already_member/);
    assert.match(pglite, /bootstrap_mcp_invites_pending_email_label_idx/);
    assert.match(pglite, /i\.company_label = workspace/);
    assert.match(pglite, /cl\.label = workspace/);
    assert.doesNotMatch(withoutComments(pglite), /AND company_label = company_label/);
    const storeSrc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "invite.ts"), "utf8");
    assert.match(storeSrc, /SELECT bootstrap_mcp_invite_member\(\$1, \$2\)/);
    assert.match(storeSrc, /SELECT bootstrap_mcp_accept_invite\(\$1\)/);
    assert.match(storeSrc, /SELECT bootstrap_mcp_verify_invite\(\$1\)/);
  });

  it("normalizes email/label and refuses a label the inviter does not hold", () => {
    assert.equal(normalizeInviteEmail("Bill@Example.TEST"), "bill@example.test");
    assert.equal(normalizeInviteEmail("not-an-email"), null);
    assert.equal(normalizeCompanyLabel("Alpha"), "alpha");
    assert.equal(normalizeCompanyLabel("../etc"), null);
    assert.deepEqual(decideInviteCreate(["charlie", "alpha"], "alpha"), { ok: true });
    assert.deepEqual(decideInviteCreate(["alpha"], "bravo"), { ok: false, reason: "label_not_held" });
  });

  it("accept fail-closed: missing, expired, replay, wrong email", () => {
    const base = {
      id: "inv-1",
      inviteeEmail: "bill@example.test",
      companyLabel: "alpha",
      invitedByMenteeId: "mentee-ivelin",
      invitedByEmail: IVELIN_SEED_EMAIL,
      tokenHash: "abc",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    };
    assert.equal(decideInviteAccept({ now: Date.now(), actorEmail: "bill@example.test" }).reason, "invite_not_found");
    assert.equal(
      decideInviteAccept({
        now: Date.now() + 120_000,
        actorEmail: "bill@example.test",
        invite: base,
      }).reason,
      "invite_expired",
    );
    assert.equal(
      decideInviteAccept({
        now: Date.now(),
        actorEmail: "bill@example.test",
        invite: { ...base, acceptedAt: new Date().toISOString() },
      }).reason,
      "invite_already_used",
    );
    assert.equal(
      decideInviteAccept({
        now: Date.now(),
        actorEmail: "stranger@example.test",
        invite: base,
      }).reason,
      "invite_email_mismatch",
    );
    assert.deepEqual(
      decideInviteAccept({ now: Date.now(), actorEmail: "bill@example.test", invite: base }),
      { ok: true },
    );
    assert.deepEqual(decideInviteVerify({ now: Date.now(), invite: undefined }), { ok: false });
    assert.deepEqual(
      decideInviteVerify({
        now: Date.now() + 120_000,
        invite: base,
      }),
      { ok: false },
    );
    assert.deepEqual(
      decideInviteVerify({
        now: Date.now(),
        invite: { ...base, acceptedAt: new Date().toISOString() },
      }),
      { ok: false },
    );
    assert.deepEqual(decideInviteVerify({ now: Date.now(), invite: base }), {
      ok: true,
      invitee_email: "bill@example.test",
      company_label: "alpha",
      inviter_email: IVELIN_SEED_EMAIL,
    });
  });

  it("Accept card is DraftExternalMessage-shaped; outbox strips the raw token", () => {
    const card = buildAcceptCard({
      fromEmail: IVELIN_SEED_EMAIL,
      toEmail: "bill@example.test",
      companyWorkspace: "alpha",
      inviteToken: "inv_once_only_fixture_token_xx",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.equal(card.card, "accept_invite");
    assert.equal(card.shape, "DraftExternalMessage");
    assert.equal(card.from.email, IVELIN_SEED_EMAIL);
    assert.equal(card.to.email, "bill@example.test");
    assert.equal(card.companyWorkspace, "alpha");
    assert.equal(card.action, "Accept");
    assert.equal(card.tool, "accept_invite");
    assert.match(card.note, /Login URL is the universal path/);
    const queued = enqueueInviteInChat("inv-1", card);
    assert.equal(queued.channel, "in_chat");
    assert.equal(queued.payload.inviteToken, null);
    assert.doesNotMatch(JSON.stringify(inviteOutboxPayload(card)), /inv_once_only/);
    const auth = buildSignupAuthCard({
      inviterEmail: IVELIN_SEED_EMAIL,
      toEmail: "bill@example.test",
      companyWorkspace: "alpha",
      inviteToken: "inv_once_only_fixture_token_xx",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.equal(auth.card, "invite_signup");
    assert.equal(auth.action, "Sign in or create account");
    assert.equal(auth.from.email, INVITE_MAIL_FROM);
    assert.equal(auth.inviterEmail, IVELIN_SEED_EMAIL);
    assert.match(auth.signupUrl, /\/bootstrap-os\/login\?invite=inv_once_only_fixture_token_xx/);
    assert.equal(auth.qrPayload, auth.signupUrl);
    const mailRow = enqueueInviteEmail("inv-1", card);
    assert.equal(mailRow.channel, "email");
    assert.equal(mailRow.payload.mailFrom, INVITE_MAIL_FROM);
    assert.equal(mailRow.payload.inviteToken, "inv_once_only_fixture_token_xx");
    assert.match(String(mailRow.payload.signupUrl), /invite=inv_once_only/);
    assert.doesNotMatch(JSON.stringify(inviteEmailOutboxPayload(card)), /ivelin@pirin\.ai","to"/);
    assert.equal(inviteEmailOutboxPayload(card).mailFrom, INVITE_MAIL_FROM);
  });

  it("memory store: Ivelin invites Bill to alpha; Bill accepts; A cannot invite to bravo", async () => {
    const store = ivelinStore();
    const invited = await store.inviteMember(
      { email: IVELIN_SEED_EMAIL, labels: [...IVELIN_SEED_LABELS] },
      { email: "Bill@Example.TEST", companyLabel: "alpha" },
    );
    assert.equal(invited.ok, true);
    if (!invited.ok) return;
    assert.equal(invited.card.shape, "DraftExternalMessage");
    assert.equal(invited.queued.channel, "in_chat");
    assert.equal(invited.queuedMail.channel, "email");
    assert.equal(invited.queuedMail.from, INVITE_MAIL_FROM);
    assert.equal(invited.authCard.from.email, INVITE_MAIL_FROM);
    assert.match(invited.card.inviteToken, /^inv_/);
    const preview = await store.verifyInvite(invited.card.inviteToken);
    assert.deepEqual(preview, {
      ok: true,
      invitee_email: "bill@example.test",
      company_label: "alpha",
      inviter_email: IVELIN_SEED_EMAIL,
    });
    assert.deepEqual(await store.verifyInvite("inv_not_a_real_invite_token_xx"), { ok: false });

    const cross = await store.inviteMember(
      { email: "mentee-a@example.test", labels: ["alpha"] },
      { email: "other@example.test", companyLabel: "bravo" },
    );
    assert.deepEqual(cross, { ok: false, reason: "label_not_held" });

    const stranger = await store.acceptInvite(
      { email: "stranger@example.test", sub: "s-stranger" },
      invited.card.inviteToken,
    );
    assert.equal(stranger.ok, false);
    if (stranger.ok) return;
    assert.equal(stranger.reason, "invite_email_mismatch");

    const accepted = await store.acceptInvite(
      { email: "bill@example.test", sub: "s-bill" },
      invited.card.inviteToken,
    );
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.email, "bill@example.test");
    assert.deepEqual(accepted.labels, ["alpha"]);
    assert.equal(store.menteeByEmail("bill@example.test")?.authUserId, "s-bill");

    const replay = await store.acceptInvite(
      { email: "bill@example.test", sub: "s-bill" },
      invited.card.inviteToken,
    );
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.deepEqual(replay.labels, ["alpha"]);
    assert.equal(store.menteeByEmail("bill@example.test")?.labels.length, 1);
    assert.deepEqual(await store.verifyInvite(invited.card.inviteToken), { ok: false });
  });

  it("existing user joins a second workspace; already_member on the same one; pending rotates", async () => {
    const store = ivelinStore();
    const actorA = {
      email: "mentee-a@example.test",
      sub: "11111111-1111-1111-1111-111111111111",
    };
    const ivelin = { email: IVELIN_SEED_EMAIL, labels: [...IVELIN_SEED_LABELS] };

    const first = await store.inviteMember(ivelin, { email: actorA.email, companyLabel: "charlie" });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const firstToken = first.card.inviteToken;

    const pendingOther = await store.inviteMember(ivelin, {
      email: actorA.email,
      companyLabel: "bravo",
    });
    assert.equal(pendingOther.ok, true);
    if (!pendingOther.ok) return;

    const rotated = await store.inviteMember(ivelin, { email: actorA.email, companyLabel: "charlie" });
    assert.equal(rotated.ok, true);
    if (!rotated.ok) return;
    assert.notEqual(rotated.card.inviteToken, firstToken);
    assert.deepEqual(await store.verifyInvite(firstToken), { ok: false });
    assert.equal((await store.verifyInvite(rotated.card.inviteToken)).ok, true);

    const accepted = await store.acceptInvite(actorA, rotated.card.inviteToken);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.deepEqual(accepted.labels, ["alpha", "charlie"]);
    assert.equal(store.menteeByEmail(actorA.email)?.authUserId, actorA.sub);
    assert.ok(!accepted.labels.includes("bravo"));

    const again = await store.inviteMember(ivelin, { email: actorA.email, companyLabel: "charlie" });
    assert.deepEqual(again, { ok: false, reason: "already_member" });
    assert.match(inviteFailMessage("already_member"), /already on this company workspace/);

    const bravo = await store.acceptInvite(actorA, pendingOther.card.inviteToken);
    assert.equal(bravo.ok, true);
    if (!bravo.ok) return;
    assert.deepEqual(bravo.labels, ["alpha", "bravo", "charlie"]);
  });

  it("invite_store_unset is missing env/client only; failed RPC keeps status+body", async () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "invite.ts"), "utf8");
    const serverSrc = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "server.ts"), "utf8");
    const rpcFn = src.match(/private async rpc\([\s\S]*?^  \}/m);
    assert.ok(rpcFn, "rpc() must exist");
    assert.doesNotMatch(rpcFn[0], /invite_store_unset/);
    assert.match(rpcFn[0], /inviteRpcFailed/);
    assert.match(src, /if \(!url \|\| !key \|\| !accessToken\) return null/);
    assert.match(serverSrc, /inviteFailMessage\(result\)/);
    assert.doesNotMatch(serverSrc, /inviteFailMessage\(result\.reason\)/);

    const prev = {
      BOOTSTRAP_SUPABASE_URL: process.env.BOOTSTRAP_SUPABASE_URL,
      BOOTSTRAP_SUPABASE_ANON_KEY: process.env.BOOTSTRAP_SUPABASE_ANON_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };
    delete process.env.BOOTSTRAP_SUPABASE_URL;
    delete process.env.BOOTSTRAP_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      assert.equal(createInviteStore("tok"), null);
      process.env.BOOTSTRAP_SUPABASE_URL = "https://example.supabase.co";
      assert.equal(createInviteStore("tok"), null);
      process.env.BOOTSTRAP_SUPABASE_ANON_KEY = "anon-key-fixture-xx";
      assert.equal(createInviteStore(undefined), null);
      process.env.VERCEL_ENV = "preview";
      assert.equal(createInviteStore("tok"), null, "preview must not attach prod invite store");
      process.env.VERCEL_ENV = "development";
      assert.equal(createInviteStore("tok"), null, "development must not attach prod invite store");
      delete process.env.VERCEL_ENV;
      assert.equal(createInviteStore("tok"), null, "unset VERCEL_ENV must not attach prod invite store");
      process.env.VERCEL_ENV = "production";
      const configured = createInviteStore("tok");
      assert.ok(configured);
      assert.equal(configured.kind, "supabase");
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    assert.match(inviteFailMessage("invite_store_unset"), /Invite store unset/);
    const rpcMsg = inviteFailMessage(
      inviteRpcFailed(404, '{"code":"PGRST202","message":"schema cache"}'),
    );
    assert.match(rpcMsg, /Invite RPC failed \(HTTP 404\)/);
    assert.match(rpcMsg, /PGRST202/);
    assert.doesNotMatch(rpcMsg, /Invite store unset/);
    assert.deepEqual(parseInviteRpcJson(JSON.stringify({ ok: false, reason: "invalid_email" })), {
      ok: false,
      reason: "invalid_email",
    });
    assert.deepEqual(
      parseInviteRpcJson(JSON.stringify(JSON.stringify({ ok: false, reason: "invalid_email" }))),
      { ok: false, reason: "invalid_email" },
    );

    const origFetch = globalThis.fetch;
    const store = new SupabaseInviteStore(
      "https://rpc-fail.example",
      "anon-key-fixture-xx",
      "access-token-fixture",
    );
    try {
      globalThis.fetch = async (url) => {
        const u = String(url);
        assert.match(u, /https:\/\/rpc-fail\.example\/rest\/v1\/rpc\//);
        if (u.endsWith("/bootstrap_mcp_invite_member")) {
          return new Response(
            JSON.stringify({
              code: "PGRST202",
              message:
                "Could not find the function public.bootstrap_mcp_invite_member(p_email, p_company_label) in the schema cache",
            }),
            { status: 404 },
          );
        }
        if (u.endsWith("/bootstrap_mcp_accept_invite")) {
          return new Response(
            JSON.stringify({
              code: "42501",
              message: "permission denied for function bootstrap_mcp_accept_invite",
            }),
            { status: 403 },
          );
        }
        throw new Error(`unexpected fetch ${u}`);
      };
      const invited = await store.inviteMember(
        { email: IVELIN_SEED_EMAIL },
        { email: "bill@example.test", companyLabel: "alpha" },
      );
      assert.equal(invited.ok, false);
      if (invited.ok) return;
      assert.equal(invited.reason, "invite_rpc_failed");
      assert.equal(invited.status, 404);
      assert.match(invited.body, /PGRST202/);
      assert.match(invited.body, /schema cache/);
      assert.doesNotMatch(inviteFailMessage(invited), /Invite store unset/);

      const accepted = await store.acceptInvite({ email: "bill@example.test" }, "inv_fixture_token_xxxx");
      assert.equal(accepted.ok, false);
      if (accepted.ok) return;
      assert.equal(accepted.reason, "invite_rpc_failed");
      assert.equal(accepted.status, 403);
      assert.match(accepted.body, /42501/);
      assert.notEqual(accepted.reason, "invite_not_found");

      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: false, reason: "label_not_held" }), { status: 200 });
      assert.deepEqual(
        await store.inviteMember(
          { email: IVELIN_SEED_EMAIL },
          { email: "bill@example.test", companyLabel: "bravo" },
        ),
        { ok: false, reason: "label_not_held" },
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

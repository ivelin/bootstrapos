/**
 * Invite mail contract (From bootstrap@ only). Never Resend HTTP. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INVITE_MAIL_FROM,
  INVITE_MAIL_NOTE,
  INVITE_SIGNUP_QUERY,
  assertInviteMailFrom,
  BOOTSTRAP_MCP_CONNECT_LEAD,
  BOOTSTRAP_MCP_CONNECT_TAIL,
  BOOTSTRAP_MCP_URL,
  buildInviteMail,
  deliverInviteMailDryRun,
  inviteSignupUrl,
  inviterNameForKick,
  notifyPirinInviteMail,
  resolveInviteMailMode,
  setInviteMailSinkForTests,
  shouldPostPirinInviteMail,
} from "../dist/invite-mail.js";
import { actorClaimsFromAccessToken, syntheticAccessToken } from "../dist/journey-auth.js";
import { REPO_ROOT } from "./helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  setInviteMailSinkForTests(undefined);
  delete process.env.BOOTSTRAP_INVITE_MAIL;
  delete process.env.VERCEL_ENV;
  delete process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
  delete process.env.BOOTSTRAP_INVITE_MAIL_URL;
});

describe("invite mail contract (never prod Resend)", { concurrency: false }, () => {
  it("From is bootstrap@pirin.ai only; signup URL is login?invite=", () => {
    assert.equal(INVITE_MAIL_FROM, "bootstrap@pirin.ai");
    assert.equal(INVITE_SIGNUP_QUERY, "invite");
    const url = inviteSignupUrl("inv_fixture_token_xxxxxxxx");
    assert.equal(url, "https://pirin.ai/bootstrap-os/login?invite=inv_fixture_token_xxxxxxxx");
    assert.doesNotMatch(url, /ivelin@|cos@/);
    assert.throws(() => assertInviteMailFrom("founder@example.test"), /bootstrap@pirin\.ai/);
    assert.throws(() => assertInviteMailFrom("cos@pirin.ai"), /bootstrap@pirin\.ai/);
    assert.doesNotThrow(() => assertInviteMailFrom(INVITE_MAIL_FROM));
  });

  it("body names inviter, invitee, workspace, token, URL, QR", () => {
    const mail = buildInviteMail({
      inviterEmail: "founder@example.test",
      inviteeEmail: "member@example.test",
      companyWorkspace: "alpha",
      inviteToken: "inv_fixture_token_xxxxxxxx",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.equal(mail.from, INVITE_MAIL_FROM);
    assert.equal(mail.to, "member@example.test");
    assert.equal(
      mail.subject,
      "founder@example.test invited you to base camp: the alpha bet board",
    );
    assert.match(mail.text, /Base camp is ready\./);
    assert.match(mail.text, /Invited by founder@example\.test/);
    assert.match(mail.text, /Sign in or create your account as member@example\.test/);
    const fixturePath = path.join(__dirname, "fixtures", "invite-base-camp.txt");
    const fixture = fs.readFileSync(fixturePath, "utf8");
    assert.equal(fixture.endsWith("\n"), true);
    assert.equal(mail.text.endsWith("\n"), true);
    assert.equal(mail.text, fixture);
    assert.equal(Buffer.compare(Buffer.from(mail.text), Buffer.from(fixture)), 0);
    assert.match(mail.text, /a private bet board on Bootstrap OS/);
    assert.match(mail.text, /Connect it to the bet board/);
    assert.match(mail.text, /https:\/\/pirin\.ai\/bootstrap-os\/login\?invite=inv_fixture_token_xxxxxxxx/);
    assert.match(mail.text, new RegExp(BOOTSTRAP_MCP_CONNECT_LEAD.replace(/[.]/g, "\\.")));
    assert.match(mail.text, /https:\/\/mcp\.bootstrap\.pirin\.ai\/mcp/);
    assert.match(mail.text, /Sign in on pirin\.ai with the invited email\. Then ask where you are\./);
    assert.equal(BOOTSTRAP_MCP_CONNECT_LEAD, "Install the Bootstrap OS connector.");
    assert.equal(BOOTSTRAP_MCP_URL, "https://mcp.bootstrap.pirin.ai/mcp");
    assert.equal(
      BOOTSTRAP_MCP_CONNECT_TAIL,
      "Sign in on pirin.ai with the invited email. Then ask where you are.",
    );
    assert.equal(mail.signupUrl, mail.qrPayload);
    assert.equal((mail.text.match(/\?invite=/g) || []).length, 1);
    assert.equal((mail.text.match(/https:\/\//g) || []).length, 2);
    assert.match(INVITE_MAIL_NOTE, /pirin-ai sends From bootstrap@pirin.ai on production/);
    assert.match(INVITE_MAIL_NOTE, /any agentic client/);
    assert.match(INVITE_MAIL_NOTE, /Open this to sign in or create your account/);
    assert.doesNotMatch(mail.text, /Sign in first/);
    assert.doesNotMatch(mail.from, /ivelin@|cos@/);
  });

  it("default off; dry-run sinks; send never fires in production", () => {
    assert.equal(resolveInviteMailMode({}), "off");
    assert.equal(resolveInviteMailMode({ BOOTSTRAP_INVITE_MAIL: "off" }), "off");
    assert.equal(resolveInviteMailMode({ BOOTSTRAP_INVITE_MAIL: "dry-run" }), "dry-run");
    assert.equal(
      resolveInviteMailMode({ BOOTSTRAP_INVITE_MAIL: "send", VERCEL_ENV: "production" }),
      "off",
    );
    assert.equal(resolveInviteMailMode({ BOOTSTRAP_INVITE_MAIL: "send" }), "dry-run");

    const seen = [];
    setInviteMailSinkForTests((m) => seen.push(m));
    deliverInviteMailDryRun(
      buildInviteMail({
        inviterEmail: "founder@example.test",
        inviteeEmail: "bill@example.test",
        companyWorkspace: "alpha",
        inviteToken: "inv_fixture_token_xxxxxxxx",
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].from, INVITE_MAIL_FROM);

    const src = fs.readFileSync(path.join(REPO_ROOT, "mcp", "src", "invite-mail.ts"), "utf8");
    assert.doesNotMatch(src, /from ["']resend["']|smtp|nodemailer|sendgrid/i);
    assert.match(src, /Never blast prod mail/);
  });

  it("production POSTs charlie invite-mail webhook; preview never", async () => {
    assert.equal(shouldPostPirinInviteMail({}), false);
    assert.equal(shouldPostPirinInviteMail({ VERCEL_ENV: "preview", BOOTSTRAP_INVITE_MAIL_SECRET: "s" }), false);
    assert.equal(shouldPostPirinInviteMail({ VERCEL_ENV: "production" }), false);
    assert.equal(
      shouldPostPirinInviteMail({ VERCEL_ENV: "production", BOOTSTRAP_INVITE_MAIL_SECRET: "s" }),
      true,
    );

    const skipped = await notifyPirinInviteMail(
      {
        inviteeEmail: "member@example.test",
        invitedByEmail: "founder@example.test",
        companyLabel: "alpha",
        inviteToken: "inv_fixture_token_xxxxxxxx",
      },
      { VERCEL_ENV: "preview", BOOTSTRAP_INVITE_MAIL_SECRET: "s" },
      async () => {
        throw new Error("must not fetch");
      },
    );
    assert.equal(skipped.skipped, "not_production");

    const hits = [];
    const posted = await notifyPirinInviteMail(
      {
        inviteeEmail: "member@example.test",
        invitedByEmail: "founder@example.test",
        companyLabel: "alpha",
        inviteToken: "inv_fixture_token_xxxxxxxx",
      },
      { VERCEL_ENV: "production", BOOTSTRAP_INVITE_MAIL_SECRET: "s" },
      async (url, init) => {
        hits.push({ url: String(url), auth: init.headers.Authorization, body: init.body });
        return { status: 200 };
      },
    );
    assert.equal(posted.status, 200);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, "https://www.pirin.ai/api/bootstrap-os/invite-mail");
    assert.equal(hits[0].auth, "Bearer s");
    const postedBody = JSON.parse(hits[0].body);
    assert.equal(postedBody.inviteeEmail, "member@example.test");
    assert.equal(postedBody.inviteToken, "inv_fixture_token_xxxxxxxx");
    assert.equal(postedBody.inviterName, undefined);
    assert.equal(Object.hasOwn(postedBody, "inviterName"), false);
    assert.equal(inviterNameForKick("founder@example.test", "founder@example.test"), undefined);
    assert.equal(inviterNameForKick("Ada", "founder@example.test"), "Ada");
    const namedClaims = actorClaimsFromAccessToken(
      syntheticAccessToken({
        email: "founder@example.test",
        sub: "auth-founder",
        extra: { name: "Ada", user_metadata: { full_name: "Ada Lovelace" } },
      }),
    );
    assert.equal(namedClaims?.name, "Ada");
    const emailName = actorClaimsFromAccessToken(
      syntheticAccessToken({
        email: "founder@example.test",
        sub: "auth-founder",
        extra: { name: "founder@example.test" },
      }),
    );
    assert.equal(emailName?.name, undefined);

    const named = [];
    await notifyPirinInviteMail(
      {
        inviteeEmail: "member@example.test",
        invitedByEmail: "founder@example.test",
        inviterName: "Ada",
        companyLabel: "alpha",
        inviteToken: "inv_fixture_token_xxxxxxxx",
      },
      { VERCEL_ENV: "production", BOOTSTRAP_INVITE_MAIL_SECRET: "s" },
      async (_url, init) => {
        named.push(JSON.parse(init.body));
        return { status: 200 };
      },
    );
    assert.equal(named[0].inviterName, "Ada");
    const namedMail = buildInviteMail({
      inviterEmail: "founder@example.test",
      inviterName: "Ada",
      inviteeEmail: "member@example.test",
      companyWorkspace: "alpha",
      inviteToken: "inv_fixture_token_xxxxxxxx",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.equal(namedMail.subject, "Ada invited you to base camp: the alpha bet board");
  });
});

/**
 * Invite mail contract (From bootstrap@ only). Never Resend HTTP. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  INVITE_MAIL_FROM,
  INVITE_MAIL_NOTE,
  INVITE_SIGNUP_QUERY,
  assertInviteMailFrom,
  buildInviteMail,
  deliverInviteMailDryRun,
  inviteSignupUrl,
  notifyPirinInviteMail,
  resolveInviteMailMode,
  setInviteMailSinkForTests,
  shouldPostPirinInviteMail,
} from "../dist/invite-mail.js";
import { REPO_ROOT } from "./helpers.mjs";

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
    assert.match(mail.subject, /founder@example\.test/);
    assert.match(mail.subject, /alpha/);
    assert.match(mail.text, /Who invited: founder@example\.test/);
    assert.match(mail.text, /Invitee email: member@example\.test/);
    assert.match(mail.text, /Company workspace: alpha/);
    assert.match(mail.text, /Invite token: inv_fixture_token_xxxxxxxx/);
    assert.match(mail.text, /Signup URL: https:\/\/pirin\.ai\/bootstrap-os\/login\?invite=inv_fixture_token_xxxxxxxx/);
    assert.match(mail.text, /QR payload \(same as signup URL\)/);
    assert.equal(mail.signupUrl, mail.qrPayload);
    assert.match(mail.text, /accept_invite/);
    assert.match(mail.text, /Sign in or create/);
    assert.match(mail.text, /form card in the chat/);
    assert.match(mail.text, /Email and Password/);
    assert.match(mail.text, /Press Continue, then Accept invite/);
    assert.match(INVITE_MAIL_NOTE, /pirin-ai sends From bootstrap@pirin.ai on production/);
    assert.match(INVITE_MAIL_NOTE, /any agentic client/);
    assert.match(INVITE_MAIL_NOTE, /form card in the chat/);
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
    assert.match(hits[0].body, /member@example.test/);
    assert.match(hits[0].body, /inv_fixture_token_xxxxxxxx/);
  });
});

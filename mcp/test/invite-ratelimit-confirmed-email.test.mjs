/**
 * TS unit coverage for email_unconfirmed / rate_limited reason codes (WO4).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { whoamiFromLabelsRpc } from "../dist/identity.js";
import {
  inviteFailMessage,
  MemoryInviteStore,
  parseInviteRpcJson,
} from "../dist/invite.js";
import { publicAdminResult, BET_BOARD_CONFIRM_MESSAGE } from "../dist/company-admin.js";
import { refusalMessage } from "../dist/hosted-caps.js";

describe("confirmed-email and rate-limit reason codes", () => {
  it("whoamiFromLabelsRpc maps email_unconfirmed and grants no labels", () => {
    const denied = whoamiFromLabelsRpc(
      "unconfirmed@example.test",
      {
        ok: false,
        error: "email_unconfirmed",
        authenticated: false,
        email: "unconfirmed@example.test",
        labels: ["alpha"],
        reason: "email_unconfirmed",
      },
      true,
    );
    assert.equal(denied.authenticated, false);
    assert.equal(denied.reason, "email_unconfirmed");
    assert.deepEqual(denied.labels, []);
  });

  it("inviteFailMessage speaks email_unconfirmed", () => {
    assert.match(inviteFailMessage({ ok: false, reason: "email_unconfirmed" }), /Confirm your email/);
  });

  it("MemoryInviteStore refuse accept when emailConfirmedAt is null", async () => {
    const store = new MemoryInviteStore([
      { id: "mentee-a", email: "founder@example.test", authUserId: "sub-a", labels: ["alpha"] },
    ]);
    const created = await store.inviteMember(
      { email: "founder@example.test", sub: "sub-a", labels: ["alpha"] },
      { email: "invitee@example.test", companyLabel: "alpha" },
    );
    assert.equal(created.ok, true);
    const token = created.ok && "card" in created ? created.card.inviteToken : "";
    const denied = await store.acceptInvite(
      { email: "invitee@example.test", sub: "sub-b", emailConfirmedAt: null },
      token,
    );
    assert.deepEqual(denied, { ok: false, reason: "email_unconfirmed" });
    const pending = await store.acceptPending(
      { email: "invitee@example.test", sub: "sub-b", emailConfirmedAt: null },
      "bos_access_token_fixture_xx",
    );
    assert.equal(pending.ok, false);
    assert.equal(pending.reason, "email_unconfirmed");
    assert.equal(pending.error, "email_unconfirmed");
  });

  it("parseInviteRpcJson keeps email_unconfirmed error objects", () => {
    const raw = parseInviteRpcJson('{"ok":false,"error":"email_unconfirmed"}');
    assert.deepEqual(raw, { ok: false, error: "email_unconfirmed" });
  });

  it("publicAdminResult keeps email_unconfirmed; refusalMessage keeps rate codes", () => {
    assert.deepEqual(publicAdminResult({ ok: false, error: "email_unconfirmed", message: "raw" }), {
      ok: false,
      status: 403,
      error: "email_unconfirmed",
      message: BET_BOARD_CONFIRM_MESSAGE,
    });
    assert.match(
      refusalMessage({
        ok: false,
        error: "rate_limited",
        reason: "rate_limited",
        message: "Limit reached for invite_member. Try again after 2026-11-14T00:00:00.000Z.",
        retryAt: "2026-11-14T00:00:00.000Z",
      }),
      /Limit reached for invite_member/,
    );
    assert.equal(
      refusalMessage({
        ok: false,
        error: "rate_limiter_unavailable",
        reason: "rate_limiter_unavailable",
      }),
      "The limiter could not be reached. This action was refused.",
    );
  });
});

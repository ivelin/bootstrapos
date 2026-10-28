import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryInviteStore } from "../dist/invite.js";
import { planScopedInvite } from "../dist/invite-scope.js";
import { buildScopedInviteMail, INVITE_MAIL_FROM } from "../dist/invite-mail.js";

const owner = {
  id: "mentee-owner",
  email: "founder@example.test",
  authUserId: "auth-owner",
  labels: ["alpha", "bravo"],
  boardRoles: { alpha: "founder", bravo: "founder" },
};

function store(extra = [], limiter) {
  return new MemoryInviteStore([owner, ...extra], limiter ? { limiter } : undefined);
}

describe("company-scoped invites", () => {
  it("defaults an omitted tier to viewer", () => {
    const plan = planScopedInvite({
      held: [{ slug: "alpha", rank: "owner" }],
      inviteeHeld: [],
      requested: [{ slug: "alpha" }],
    });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.grants, [{ slug: "alpha", role: "viewer" }]);
  });

  it("an editor cannot grant editor", () => {
    const plan = planScopedInvite({
      held: [{ slug: "alpha", rank: "editor" }],
      inviteeHeld: [],
      requested: [{ slug: "alpha", role: "editor" }],
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, "invite_partial_authority");
    assert.equal(plan.denied[0].reason, "tier_forbidden");
  });

  it("a commenter cannot invite", () => {
    const plan = planScopedInvite({
      held: [{ slug: "alpha", rank: "commenter" }],
      inviteeHeld: [],
      requested: [{ slug: "alpha", role: "viewer" }],
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.denied[0].reason, "tier_forbidden");
  });

  it("partial authority creates nothing", async () => {
    const invites = store();
    const result = await invites.inviteMember(
      { email: "founder@example.test" },
      {
        email: "member@example.test",
        companies: [
          { slug: "alpha", role: "editor" },
          { slug: "charlie", role: "viewer" },
        ],
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invite_partial_authority");
    assert.deepEqual(result.allowed, ["alpha"]);
    assert.equal(result.denied[0].slug, "charlie");
    assert.equal(invites.invites.length, 0);
  });

  it("a zero-company invite adds no bet board", async () => {
    const invites = store();
    const created = await invites.inviteMember(
      { email: "founder@example.test" },
      { email: "member@example.test", companies: [] },
    );
    assert.equal(created.ok, true);
    assert.deepEqual(created.companies, []);
    const accepted = await invites.acceptInvite(
      { email: "member@example.test" },
      created.token,
    );
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.labels, []);
  });

  it("does not downgrade a higher tier on accept", async () => {
    const invites = store([
      {
        id: "mentee-member",
        email: "member@example.test",
        authUserId: null,
        labels: ["alpha"],
        boardRoles: { alpha: "editor" },
      },
    ]);
    const created = await invites.inviteMember(
      { email: "founder@example.test" },
      { email: "member@example.test", companies: [{ slug: "alpha", role: "viewer" }] },
    );
    assert.equal(created.ok, false);
    assert.equal(created.reason, "already_member");
  });

  it("limiter trips per inviter and per invitee email", async () => {
    const counts = new Map();
    const limiter = {
      async take(input) {
        const key = `${input.action}:${input.actorId}`;
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        if (next > 1) {
          return {
            ok: false,
            reason: "rate_limited",
            retryAt: "2030-01-01T00:00:00.000Z",
            message: `Limit reached for ${input.action}.`,
          };
        }
        return { ok: true, remaining: 0 };
      },
    };
    const invites = store([], limiter);
    const first = await invites.inviteMember(
      { email: "founder@example.test", sub: "owner-sub" },
      { email: "member@example.test", companies: [{ slug: "alpha" }] },
    );
    assert.equal(first.ok, true);
    const sameInvitee = await invites.inviteMember(
      { email: "founder@example.test", sub: "owner-sub" },
      { email: "member@example.test", companies: [{ slug: "bravo", role: "commenter" }] },
    );
    assert.equal(sameInvitee.ok, false);
    assert.equal(sameInvitee.reason, "rate_limited");
    assert.ok([...counts.keys()].some((key) => key.startsWith("invite_invitee:")));
    assert.ok([...counts.keys()].some((key) => key.startsWith("invite_member:")));
  });

  it("mail names every bet board and does not say workspace", () => {
    const mail = buildScopedInviteMail({
      inviterEmail: "founder@example.test",
      inviteeEmail: "member@example.test",
      companies: [
        { slug: "alpha", role: "commenter" },
        { slug: "bravo", role: "editor" },
      ],
      inviteToken: "inv_fixture_token_xxxxxxxx",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    assert.equal(mail.from, INVITE_MAIL_FROM);
    assert.match(mail.subject, /2 bet boards: alpha, bravo/);
    assert.match(mail.text, /founder@example\.test/);
    assert.match(mail.text, /member@example\.test/);
    assert.match(mail.text, /alpha: can read and comment on bet cards/);
    assert.match(mail.text, /bravo: can edit bet cards/);
    assert.doesNotMatch(`${mail.subject}\n${mail.text}`, /workspace/i);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryInviteStore, SupabaseInviteStore } from "../dist/invite.js";
import { aclRoleForTier, legacyRank, planScopedInvite, tierLine } from "../dist/invite-scope.js";
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

  it("maps each tier to an acl role and a spoken line", () => {
    assert.equal(aclRoleForTier("editor"), "founder_authorized");
    assert.equal(aclRoleForTier("commenter"), "advisor");
    assert.equal(aclRoleForTier("viewer"), "viewer");
    assert.equal(tierLine("editor"), "can edit bet cards");
    assert.equal(tierLine("commenter"), "can read and comment on bet cards");
    assert.equal(tierLine("viewer"), "can read bet cards");
    assert.equal(legacyRank("founder"), "owner");
    assert.equal(legacyRank("owner"), "owner");
    assert.equal(legacyRank("founder_authorized"), "editor");
    assert.equal(legacyRank("editor"), "editor");
    assert.equal(legacyRank("advisor"), "commenter");
    assert.equal(legacyRank("mentor"), "commenter");
    assert.equal(legacyRank("commenter"), "commenter");
    assert.equal(legacyRank("viewer"), "viewer");
    assert.equal(legacyRank("nope"), null);
    assert.equal(legacyRank(undefined), null);
  });

  it("rejects an invalid label, an owner grant, and records a dropped higher tier", () => {
    const ownerGrant = planScopedInvite({
      held: [{ slug: "alpha", rank: "owner" }],
      inviteeHeld: [],
      requested: [{ slug: "alpha", role: "owner" }],
    });
    assert.equal(ownerGrant.ok, false);
    assert.equal(ownerGrant.reason, "invite_partial_authority");
    assert.equal(ownerGrant.denied[0].reason, "owner_forbidden");

    const unknown = planScopedInvite({
      held: [{ slug: "alpha", rank: "owner" }],
      inviteeHeld: [],
      requested: [{ slug: "alpha", role: "founder" }],
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.denied[0].reason, "owner_forbidden");

    const invalid = planScopedInvite({
      held: [{ slug: "alpha", rank: "owner" }],
      inviteeHeld: [],
      requested: [{ slug: "Alpha!", role: "viewer" }],
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.denied[0].reason, "invalid_label");
    assert.equal(invalid.denied[0].slug, "alpha!");

    const dropped = planScopedInvite({
      held: [
        { slug: "alpha", rank: "owner" },
        { slug: "bravo", rank: "owner" },
      ],
      inviteeHeld: [{ slug: "alpha", rank: "editor" }],
      requested: [
        { slug: "  ", role: "viewer" },
        { slug: "alpha", role: "" },
        { slug: "alpha", role: "viewer" },
        { slug: "bravo", role: "commenter" },
      ],
    });
    assert.equal(dropped.ok, true);
    assert.deepEqual(dropped.dropped, [{ slug: "alpha", role: "viewer" }]);
    assert.deepEqual(dropped.grants, [{ slug: "bravo", role: "commenter" }]);

    const already = planScopedInvite({
      held: [{ slug: "alpha", rank: "owner" }],
      inviteeHeld: [{ slug: "alpha", rank: "commenter" }],
      requested: [{ slug: "alpha", role: "viewer" }],
    });
    assert.equal(already.ok, false);
    assert.equal(already.reason, "already_member");
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

  it("a legacy invitee cannot mint an editor invite", async () => {
    const invites = store();
    const created = await invites.inviteMember(
      { email: "founder@example.test" },
      { email: "member@example.test", companyLabel: "alpha" },
    );
    assert.equal(created.ok, true);
    const accepted = await invites.acceptInvite(
      { email: "member@example.test" },
      created.card.inviteToken,
    );
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.labels, ["alpha"]);
    const minted = await invites.inviteMember(
      { email: "member@example.test" },
      { email: "other@example.test", companies: [{ slug: "alpha", role: "editor" }] },
    );
    assert.equal(minted.ok, false);
    assert.equal(minted.reason, "invite_partial_authority");
    assert.equal(invites.invites.length, 1);
  });

  it("accept posts to the scoped RPC and does not fall back when the token is expired", async () => {
    const origFetch = globalThis.fetch;
    const store = new SupabaseInviteStore(
      "https://rpc-fixture.example",
      "anon-key-fixture-xx",
      "access-token-fixture",
    );
    const urls = [];
    try {
      globalThis.fetch = async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/bootstrap_os_invite_accept")) {
          return new Response(JSON.stringify({ ok: false, reason: "expired" }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, email: "member@example.test", labels: ["alpha"] }), {
          status: 200,
        });
      };
      const accepted = await store.acceptInvite(
        { email: "member@example.test" },
        "inv_fixture_token_xxxxxxxx",
      );
      assert.equal(accepted.ok, false);
      assert.equal(accepted.reason, "expired");
      assert.deepEqual(urls, ["https://rpc-fixture.example/rest/v1/rpc/bootstrap_os_invite_accept"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("falls back to the legacy accept RPC only when the token is absent", async () => {
    const origFetch = globalThis.fetch;
    const store = new SupabaseInviteStore(
      "https://rpc-fixture.example",
      "anon-key-fixture-xx",
      "access-token-fixture",
    );
    const urls = [];
    try {
      globalThis.fetch = async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/bootstrap_os_invite_accept")) {
          return new Response(JSON.stringify({ ok: false, reason: "token_not_found" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            email: "member@example.test",
            labels: ["alpha"],
            companyWorkspace: "alpha",
            note: "joined",
          }),
          { status: 200 },
        );
      };
      const accepted = await store.acceptInvite(
        { email: "member@example.test" },
        "inv_legacy_token_xxxxxxxx",
      );
      assert.equal(accepted.ok, true);
      assert.deepEqual(urls, [
        "https://rpc-fixture.example/rest/v1/rpc/bootstrap_os_invite_accept",
        "https://rpc-fixture.example/rest/v1/rpc/bootstrap_mcp_accept_invite",
      ]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("the hosted invite RPC sends the company list", async () => {
    const origFetch = globalThis.fetch;
    const store = new SupabaseInviteStore(
      "https://rpc-fixture.example",
      "anon-key-fixture-xx",
      "access-token-fixture",
    );
    try {
      globalThis.fetch = async (url, init) => {
        assert.match(String(url), /\/rpc\/bootstrap_os_invite_create$/);
        const body = JSON.parse(init.body);
        assert.equal(body.p_email, "member@example.test");
        assert.deepEqual(body.p_companies, [{ slug: "alpha", role: "viewer" }]);
        return new Response(
          JSON.stringify({
            ok: true,
            token: "inv_fixture_token_xxxxxxxx",
            inviteeEmail: "member@example.test",
            companies: [{ slug: "alpha", role: "viewer" }],
            dropped: [],
          }),
          { status: 200 },
        );
      };
      const created = await store.inviteMember(
        { email: "founder@example.test" },
        { email: "member@example.test", companies: [{ slug: "alpha", role: "viewer" }] },
      );
      assert.equal(created.ok, true);
      assert.equal(created.token, "inv_fixture_token_xxxxxxxx");
      assert.equal(created.inviteeEmail, "member@example.test");
      assert.deepEqual(created.companies, [{ slug: "alpha", role: "viewer" }]);
      assert.deepEqual(created.dropped, []);
    } finally {
      globalThis.fetch = origFetch;
    }
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

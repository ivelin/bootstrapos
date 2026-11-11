/**
 * Memory-store change_board_role. Fictional fixtures only.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syntheticAccessToken, actorFromAuthorizationHeader } from "../dist/journey-auth.js";
import { MemoryJourneyStore, defaultScoreboard } from "../dist/journey.js";

function bearer(email) {
  return actorFromAuthorizationHeader(
    `Bearer ${syntheticAccessToken({ email, sub: `sub-${email}` })}`,
    "memory",
  );
}

function storeWith(role, email) {
  return new MemoryJourneyStore(
    [{ id: "co-alpha", slug: "alpha", label: "Alpha" }],
    [{ companyId: "co-alpha", principal: email, principalKind: "email", role }],
    [
      {
        id: "idea-1",
        companyId: "co-alpha",
        slug: "default",
        name: "Default",
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard: defaultScoreboard(),
      },
    ],
    [],
    [],
  );
}

describe("change_board_role memory store", () => {
  it("owner grants founder and revoke writes audit before/after", async () => {
    const store = storeWith("owner", "owner@example.test");
    const owner = bearer("owner@example.test");
    const granted = await store.changeAcl(owner, {
      companySlug: "alpha",
      principal: "Founder@example.test",
      principalKind: "email",
      role: "founder",
      op: "grant",
    });
    assert.equal(granted.ok, true);
    assert.equal(granted.audit.whatChanged.op, "grant");
    assert.equal(granted.audit.whatChanged.before, null);
    assert.equal(granted.audit.whatChanged.after.principal, "founder@example.test");
    assert.equal(granted.audit.whatChanged.after.role, "founder");

    const founder = bearer("founder@example.test");
    const board = await store.getJourney(founder, { companySlug: "alpha" });
    assert.equal(board.ok, true);
    assert.equal(board.company.slug, "alpha");

    const revoked = await store.changeAcl(owner, {
      companySlug: "alpha",
      principal: "founder@example.test",
      principalKind: "email",
      role: "founder",
      op: "revoke",
    });
    assert.equal(revoked.ok, true);
    assert.equal(revoked.audit.whatChanged.op, "revoke");
    assert.equal(revoked.audit.whatChanged.after, null);
    assert.equal(revoked.audit.whatChanged.before.role, "founder");
    const gone = await store.getJourney(founder, { companySlug: "alpha" });
    assert.equal(gone.ok, false);
  });

  it("commenter and editor cannot change a board role", async () => {
    for (const role of ["commenter", "editor"]) {
      const store = storeWith(role, `${role}@example.test`);
      const hit = await store.changeAcl(bearer(`${role}@example.test`), {
        companySlug: "alpha",
        principal: "founder@example.test",
        principalKind: "email",
        role: "founder",
        op: "grant",
      });
      assert.equal(hit.ok, false);
      assert.equal(hit.error, "forbidden_role");
      assert.equal(hit.message, "Only board owners can change roles.");
    }
  });

  it("refuses to revoke the last owner and allows one of two owners to revoke the other", async () => {
    const sole = storeWith("owner", "owner@example.test");
    const self = await sole.changeAcl(bearer("owner@example.test"), {
      companySlug: "alpha",
      principal: "owner@example.test",
      principalKind: "email",
      role: "owner",
      op: "revoke",
    });
    assert.equal(self.ok, false);
    assert.equal(self.error, "last_owner");
    const still = await sole.getJourney(bearer("owner@example.test"), { companySlug: "alpha" });
    assert.equal(still.ok, true);

    const pair = new MemoryJourneyStore(
      [{ id: "co-alpha", slug: "alpha", label: "Alpha" }],
      [
        { companyId: "co-alpha", principal: "owner-a@example.test", principalKind: "email", role: "owner" },
        { companyId: "co-alpha", principal: "owner-b@example.test", principalKind: "email", role: "owner" },
      ],
      [],
      [],
      [],
    );
    const gone = await pair.changeAcl(bearer("owner-a@example.test"), {
      companySlug: "alpha",
      principal: "owner-b@example.test",
      principalKind: "email",
      role: "owner",
      op: "revoke",
    });
    assert.equal(gone.ok, true);
    const left = await pair.getJourney(bearer("owner-a@example.test"), { companySlug: "alpha" });
    assert.equal(left.ok, true);
    const dropped = await pair.getJourney(bearer("owner-b@example.test"), { companySlug: "alpha" });
    assert.equal(dropped.ok, false);
  });

  it("re-grant of a different role conflicts and writes no audit; the same role is idempotent", async () => {
    const store = storeWith("owner", "owner@example.test");
    const owner = bearer("owner@example.test");
    await store.changeAcl(owner, {
      companySlug: "alpha",
      principal: "editor@example.test",
      principalKind: "email",
      role: "editor",
      op: "grant",
    });
    const before = (await store.getJourney(owner, { companySlug: "alpha" })).audit.length;
    const clash = await store.changeAcl(owner, {
      companySlug: "alpha",
      principal: "editor@example.test",
      principalKind: "email",
      role: "advisor",
      op: "grant",
    });
    assert.equal(clash.ok, false);
    assert.equal(clash.message, "already has role editor; revoke first");
    const after = (await store.getJourney(owner, { companySlug: "alpha" })).audit.length;
    assert.equal(after, before);
    const same = await store.changeAcl(owner, {
      companySlug: "alpha",
      principal: "editor@example.test",
      principalKind: "email",
      role: "editor",
      op: "grant",
    });
    assert.equal(same.ok, true);
  });
});

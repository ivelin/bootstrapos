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
    }
  });
});

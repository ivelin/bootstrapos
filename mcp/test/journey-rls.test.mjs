/**
 * SQL + in-memory ACL replica. No network. PGlite runtime is journey-pglite.test.mjs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  actorFromAuthorizationHeader,
  syntheticAccessToken,
} from "../dist/journey-auth.js";
import {
  JOURNEY_FIXTURE,
  MemoryJourneyStore,
  canPostComment,
  canReadCompany,
  canWriteJourney,
  auditEventsMayBeUpdated,
  canWriteAuditDirectly,
  commentsMayMutateGate,
  fixtureJourneyStore,
  parseJourneyQuery,
  roleOnCompany,
  agentMayRubberStampConstraint,
  preferenceMayNameConstraint,
} from "../dist/journey.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260902_bootstrap_os_journey.sql",
);

function actor(email, sub) {
  return {
    authenticated: true,
    email,
    sub,
    principal: email || sub,
    identityStore: "memory",
  };
}

describe("journey RLS file lock + memory replica", () => {
  it("migration enables FORCE RLS and email-then-sub ACL; no FAST claim; no seed slugs", () => {
    const sql = fs.readFileSync(SQL, "utf8");
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(sql, /auth\.jwt\(\) ->> 'email'/);
    assert.match(sql, /auth\.jwt\(\) ->> 'sub'/);
    assert.doesNotMatch(sql, /auth\.jwt\(\) ->> 'fast'/);
    assert.doesNotMatch(sql, /USING\s*\(\s*true\s*\)/i);
    assert.match(sql, /DO NOT apply from a PR cloud agent/);
    assert.match(sql, /companies_select_member/);
    assert.match(sql, /ideas_update_founder/);
    assert.match(sql, /comments_insert_advisor/);
    assert.match(sql, /gate_events_insert_founder/);
    assert.match(sql, /audit_events/);
    assert.match(sql, /audit_events_select_member/);
    assert.match(sql, /emit_audit/);
    assert.match(sql, /Append-only/);
    assert.match(sql, /constraint_this_week/);
    assert.match(sql, /ideas_constraint_this_week_short/);
    assert.match(sql, /board_subscribers/);
    assert.match(sql, /notify_outbox/);
    assert.match(sql, /enqueue_board_notify/);
    assert.doesNotMatch(sql, /GRANT INSERT ON TABLE bootstrap_os\.notify_outbox TO authenticated/);
    assert.doesNotMatch(sql, /nodemailer|smtp\.|sendEmail|CREATE EXTENSION\s+.*mail/i);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]{0,80}audit_events[\s\S]{0,120}FOR UPDATE/i);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]{0,80}audit_events[\s\S]{0,120}FOR DELETE/i);
    assert.doesNotMatch(sql, /GRANT INSERT ON TABLE bootstrap_os\.audit_events TO authenticated/);
    assert.doesNotMatch(sql, /INSERT INTO bootstrap_os\.companies/);
    assert.doesNotMatch(sql, /dyeconverter/);
    assert.doesNotMatch(sql, /corehaul/);
    assert.doesNotMatch(sql, /~\/\.bootstrap-os/);
  });

  it("founder write, advisor read+comment, stranger none, mentee isolation", () => {
    const acl = JOURNEY_FIXTURE.acl;
    const dye = JOURNEY_FIXTURE.companies[0].id;
    const core = JOURNEY_FIXTURE.companies[1].id;
    const founderDye = actor("founder-dye@example.test");
    const founderCore = actor("founder-core@example.test");
    const cos = actor("advisor-cos@example.test");
    const authorized = actor("authorized-dye@example.test");
    const stranger = actor("stranger@example.test");
    const subOnly = actor(undefined, "sub-only-corehaul");

    assert.equal(canReadCompany(acl, founderDye, dye), true);
    assert.equal(canReadCompany(acl, founderDye, core), false);
    assert.equal(canWriteJourney(acl, founderDye, dye), true);
    assert.equal(canWriteJourney(acl, founderDye, core), false);
    assert.equal(canPostComment(acl, founderDye, dye), false);

    assert.equal(canReadCompany(acl, cos, dye), true);
    assert.equal(canReadCompany(acl, cos, core), true);
    assert.equal(canWriteJourney(acl, cos, dye), false);
    assert.equal(canPostComment(acl, cos, dye), true);
    assert.equal(roleOnCompany(acl, cos, dye), "advisor");

    assert.equal(canWriteJourney(acl, authorized, dye), true);
    assert.equal(canPostComment(acl, authorized, dye), false);

    assert.equal(canReadCompany(acl, stranger, dye), false);
    assert.equal(canReadCompany(acl, founderCore, dye), false);
    assert.equal(canReadCompany(acl, subOnly, core), true);
    assert.equal(canReadCompany(acl, subOnly, dye), false);
    assert.equal(commentsMayMutateGate(), false);
    assert.equal(canWriteAuditDirectly(), false);
    assert.equal(auditEventsMayBeUpdated(), false);
    assert.equal(preferenceMayNameConstraint(), false);
    assert.equal(agentMayRubberStampConstraint(), false);
  });

  it("JWT FAST claim does not grant access; email then sub", () => {
    const fastOnly = syntheticAccessToken({
      email: "stranger@example.test",
      extra: { fast: true, FAST: "mentee" },
    });
    const decoded = actorFromAuthorizationHeader(`Bearer ${fastOnly}`, "memory");
    assert.equal(decoded.authenticated, true);
    assert.equal(decoded.email, "stranger@example.test");
    const store = fixtureJourneyStore();
    assert.equal(store.actorOnAllowlist(decoded), false);

    const subTok = syntheticAccessToken({ sub: "sub-only-corehaul", extra: { fast: true } });
    const subActor = actorFromAuthorizationHeader(`Bearer ${subTok}`, "memory");
    assert.equal(store.actorOnAllowlist(subActor), true);
    assert.equal(subActor.email, undefined);
  });

  it("parseJourneyQuery splits company vs idea, not a composite key", () => {
    assert.deepEqual(parseJourneyQuery({ q: "CoreHaul" }), {
      companySlug: "corehaul",
      ideaSlug: undefined,
    });
    assert.deepEqual(parseJourneyQuery({ q: "CoreHaul / last-mile" }), {
      companySlug: "corehaul",
      ideaSlug: "last-mile",
    });
    assert.deepEqual(parseJourneyQuery({ company: "dyeconverter" }), {
      companySlug: "dyeconverter",
      ideaSlug: undefined,
    });
  });

  it("commenter and mentor can comment; commenter cannot put_journey", async () => {
    const store = new MemoryJourneyStore(
      [{ id: "co-1", slug: "alpha", label: "alpha" }],
      [
        {
          companyId: "co-1",
          principal: "commenter@example.invalid",
          principalKind: "email",
          role: "commenter",
        },
        {
          companyId: "co-1",
          principal: "mentor@example.invalid",
          principalKind: "email",
          role: "mentor",
        },
      ],
      [
        {
          id: "id-1",
          companyId: "co-1",
          slug: "default",
          name: "alpha",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: { schema_version: 1, constraint_this_week: "" },
        },
      ],
      [],
      [],
    );
    const commenter = {
      authenticated: true,
      email: "commenter@example.invalid",
      principal: "commenter@example.invalid",
    };
    const mentor = {
      authenticated: true,
      email: "mentor@example.invalid",
      principal: "mentor@example.invalid",
    };
    assert.equal(canPostComment(store.acl, commenter, "co-1"), true);
    assert.equal(canWriteJourney(store.acl, commenter, "co-1"), false);
    assert.equal((await store.postComment(commenter, { companySlug: "alpha", body: "note" })).ok, true);
    assert.equal(
      (await store.putJourney(commenter, { companySlug: "alpha", why: "no", founderYes: true })).ok,
      false,
    );
    assert.equal(canPostComment(store.acl, mentor, "co-1"), true);
    assert.equal((await store.postComment(mentor, { companySlug: "alpha", body: "mentor note" })).ok, true);
  });

  it("memory first create seeds founder and commenter; existing first touch stays founder_authorized", () => {
    const store = new MemoryJourneyStore([], [], [], [], []);
    const admin = {
      authenticated: true,
      email: "admin@example.invalid",
      principal: "admin@example.invalid",
    };
    store.ensureCompanyForMember("newco", admin, { founderEmail: "founder@example.invalid" });
    assert.deepEqual(
      store.acl.map((row) => ({ principal: row.principal, role: row.role })).sort((a, b) => a.role.localeCompare(b.role)),
      [
        { principal: "admin@example.invalid", role: "commenter" },
        { principal: "founder@example.invalid", role: "founder" },
      ],
    );
    const caller = {
      authenticated: true,
      email: "solo@example.invalid",
      principal: "solo@example.invalid",
    };
    store.ensureCompanyForMember("solo", caller);
    assert.equal(store.acl.find((row) => row.principal === "solo@example.invalid").role, "founder");
    store.ensureCompanyForMember("solo", {
      authenticated: true,
      email: "late@example.invalid",
      principal: "late@example.invalid",
    }, { founderEmail: "other@example.invalid" });
    assert.equal(store.acl.find((row) => row.principal === "late@example.invalid").role, "founder_authorized");
    assert.equal(store.acl.find((row) => row.principal === "solo@example.invalid").role, "founder");
    assert.equal(store.acl.some((row) => row.principal === "other@example.invalid"), false);
    assert.throws(
      () => store.ensureCompanyForMember("billco", admin, { superAdmin: true }),
      /founder_email_required/,
    );
    assert.throws(
      () => store.ensureCompanyForMember("bad", caller, { founderEmail: "not-an-email" }),
      /invalid_founder_email/,
    );
  });
});

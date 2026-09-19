/**
 * Visual flow, two-minute snapshot, and meeting doc are generated views.
 * Comments never mutate gates. Company query vs idea query.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syntheticAccessToken } from "../dist/journey-auth.js";
import { actorFromAuthorizationHeader } from "../dist/journey-auth.js";
import {
  JOURNEY_FIXTURE,
  JOURNEY_DIGEST_CONTRACT,
  MemoryJourneyStore,
  PORTFOLIO_KILLED_OUT,
  PORTFOLIO_RANK_FORMULA,
  PORTFOLIO_SCORE_OUT_OF_RANGE,
  PORTFOLIO_SKIP_NEED_TWO_LIVE,
  PORTFOLIO_WHY_REQUIRED,
  PORTFOLIO_WHY_TOO_LONG,
  commentsMayMutateGate,
  defaultScoreboard,
  digestMayAdvanceGate,
  digestMayInventStage,
  fixtureJourneyStore,
  LANDING_PAGE_CONSTRAINT_REFUSE,
  agentMayRubberStampConstraint,
  mayWriteConstraintThisWeek,
  normalizePortfolioScore,
  portfolioScoreMayPromote,
  portfolioScoreOf,
  portfolioViewOf,
  preferenceMayNameConstraint,
  preferWebhookOverPoll,
  scoreboardMayCarryOwner,
} from "../dist/journey.js";

const GATE_ENR = {
  whatChanged: "moved the clocks",
  whatWereNotDoing: "not a landing-page side quest",
};

function bearer(email, sub) {
  return actorFromAuthorizationHeader(
    `Bearer ${syntheticAccessToken({ email, sub })}`,
    "memory",
  );
}

describe("journey views + tools (memory store)", () => {
  it("company query returns every idea; idea query returns one; default idea on a one-thesis company", async () => {
    const extra = new MemoryJourneyStore(
      JOURNEY_FIXTURE.companies.map((c) => ({ ...c })),
      JOURNEY_FIXTURE.acl.map((a) => ({ ...a })),
      [
        ...JOURNEY_FIXTURE.ideas.map((i) => ({ ...i, scoreboard: defaultScoreboard() })),
        {
          id: "idea-core-2",
          companyId: "co-core",
          slug: "last-mile",
          name: "last-mile",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: defaultScoreboard(),
        },
      ],
      [],
      [],
    );
    const founder = bearer("founder-core@example.test");
    const company = await extra.getJourney(founder, { companySlug: "corehaul" });
    assert.equal(company.ok, true);
    assert.deepEqual(
      company.ideas.map((i) => i.slug).sort(),
      ["corehaul", "last-mile"],
    );
    const one = await extra.getJourney(founder, {
      companySlug: "corehaul",
      ideaSlug: "last-mile",
    });
    assert.equal(one.ideas.length, 1);
    assert.equal(one.ideas[0].slug, "last-mile");

    const dyeStore = fixtureJourneyStore();
    const dyeFounder = bearer("founder-dye@example.test");
    const dye = await dyeStore.getJourney(dyeFounder, { companySlug: "dyeconverter" });
    assert.equal(dye.ideas.length, 1);
    assert.equal(dye.ideas[0].slug, "dyeconverter");
    assert.equal(dye.ideas[0].clocks.journeyPhase, 1);
    assert.equal(dye.ideas[0].clocks.loopStage, 1);
    assert.equal(dye.ideas[0].clocks.journeySpoken, "Write the bet");
    assert.equal(dye.ideas[0].clocks.loopSpoken, "Ask");
  });

  it("visual/snapshot always; meeting doc only on expand; not stored", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const basic = await store.getJourney(founder, { companySlug: "corehaul" });
    const idea = basic.ideas[0];
    assert.match(idea.visualFlow, /mermaid/);
    assert.match(idea.visualFlow, /subgraph journey \[Journey\]/);
    assert.match(idea.visualFlow, /subgraph loop \[Loop\]/);
    assert.match(idea.visualFlow, /Write the bet/);
    assert.match(idea.visualFlow, /Ask/);
    assert.match(idea.snapshot, /Journey: Write the bet \(1\)/);
    assert.match(idea.snapshot, /Loop: Ask \(1\)/);
    assert.equal(idea.clocks.journeySpoken, "Write the bet");
    assert.equal(idea.clocks.loopSpoken, "Ask");
    assert.match(idea.snapshot, /two-minute read/);
    assert.match(idea.snapshot, /Owner \(from ACL\): founder-core@example.test, sub-only-corehaul/);
    assert.match(
      idea.snapshot,
      /Constraint this week \(honest biggest bottleneck; where help is required\): none yet/,
    );
    assert.match(idea.snapshot, /Not a fun side quest/);
    assert.match(idea.snapshot, /Preference/);
    assert.match(idea.snapshot, /Teaching picture, not extra law/);
    assert.match(idea.snapshot, /weakest link/);
    assert.match(idea.snapshot, /slowest soldier/);
    assert.match(idea.snapshot, /not on that link is not progress/);
    assert.equal(idea.constraintThisWeek, "");
    assert.match(idea.visualFlow, /Constraint this week:/);
    assert.equal(idea.meetingDoc, undefined);
    const expanded = await store.getJourney(founder, {
      companySlug: "corehaul",
      expandMeetingDoc: true,
    });
    assert.match(expanded.ideas[0].meetingDoc, /Generated as a view/);
    assert.match(expanded.ideas[0].meetingDoc, /Where help is needed/);
    assert.match(
      expanded.ideas[0].meetingDoc,
      /Constraint this week \(honest biggest bottleneck; where help is required\): none yet/,
    );
    assert.equal(commentsMayMutateGate(), false);
  });

  it("create_idea starts an empty board; put_journey does not invent a missing slug", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const advisor = bearer("advisor-cos@example.test");
    const dyeFounder = bearer("founder-dye@example.test");

    const noYes = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "second-bet",
      founderYes: false,
    });
    assert.equal(noYes.ok, false);

    const advisorCreate = await store.createIdea(advisor, {
      companySlug: "corehaul",
      ideaSlug: "second-bet",
      founderYes: true,
    });
    assert.equal(advisorCreate.ok, false);

    const cross = await store.createIdea(dyeFounder, {
      companySlug: "corehaul",
      ideaSlug: "second-bet",
      founderYes: true,
    });
    assert.equal(cross.ok, false);

    const badSlug = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "../etc",
      founderYes: true,
    });
    assert.equal(badSlug.ok, false);

    const created = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "second-bet",
      name: "Second bet",
      founderYes: true,
      why: "separate 0-1 board",
    });
    assert.equal(created.ok, true);
    assert.equal(created.ideas.length, 1);
    assert.equal(created.ideas[0].slug, "second-bet");
    assert.equal(created.ideas[0].name, "Second bet");
    assert.equal(created.ideas[0].clocks.journeyPhase, 1);
    assert.equal(created.ideas[0].clocks.loopStage, 1);
    assert.equal(created.ideas[0].clocks.currentGate, "hold");

    const dup = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "second-bet",
      founderYes: true,
    });
    assert.equal(dup.ok, false);
    assert.match(String(dup.error), /already exists/);

    const missing = await store.putJourney(founder, {
      companySlug: "corehaul",
      ideaSlug: "not-a-row",
      why: "write missing",
      founderYes: true,
      currentGate: "hold",
    });
    assert.equal(missing.ok, false);
    assert.match(String(missing.error), /create_idea first/);

    const board = await store.getJourney(founder, { companySlug: "corehaul" });
    assert.ok(board.ideas.some((i) => i.slug === "second-bet"));
    assert.ok(board.ideas.some((i) => i.slug === "corehaul"));
  });

  it("put_journey is founder+yes; advisor comments cannot mutate gates", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const advisor = bearer("advisor-cos@example.test");
    const dyeFounder = bearer("founder-dye@example.test");

    const refused = await store.putJourney(founder, {
      companySlug: "corehaul",
      journeyPhase: 2,
      currentGate: "advance",
      why: "thesis written",
      founderYes: false,
    });
    assert.equal(refused.ok, false);

    const advisorWrite = await store.putJourney(advisor, {
      companySlug: "corehaul",
      journeyPhase: 9,
      currentGate: "advance",
      why: "nope",
      founderYes: true,
    });
    assert.equal(advisorWrite.ok, false);

    const cross = await store.putJourney(dyeFounder, {
      companySlug: "corehaul",
      journeyPhase: 9,
      why: "nope",
      founderYes: true,
    });
    assert.equal(cross.ok, false);

    const ok = await store.putJourney(founder, {
      companySlug: "corehaul",
      journeyPhase: 2,
      loopStage: 2,
      currentGate: "advance",
      scoreboard: {
        schema_version: 1,
        openQuestions: ["who already has this job"],
        progress: ["thesis draft"],
      },
      why: "founder yes in chat",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.idea.clocks.journeyPhase, 2);
    assert.equal(ok.idea.lastTransitions.length, 1);

    const before = ok.idea.clocks;
    const comment = await store.postComment(advisor, {
      companySlug: "corehaul",
      body: "I can intro two operators",
    });
    assert.equal(comment.ok, true);
    assert.deepEqual(comment.clocksUnchanged, before);
    const founderComment = await store.postComment(founder, {
      companySlug: "corehaul",
      body: "should fail",
    });
    assert.equal(founderComment.ok, false);
    const after = await store.getJourney(founder, { companySlug: "corehaul" });
    assert.equal(after.ideas[0].clocks.journeyPhase, 2);
    assert.equal(after.ideas[0].clocks.currentGate, "advance");
  });

  it("one mentee cannot read another; jsonb clocks stay out of scoreboard writes", async () => {
    const store = fixtureJourneyStore();
    const dye = bearer("founder-dye@example.test");
    const hidden = await store.getJourney(dye, { companySlug: "corehaul" });
    assert.equal(hidden.ok, false);
    await store.putJourney(dye, {
      companySlug: "dyeconverter",
      scoreboard: { schema_version: 1, journeyPhase: 9, currentGate: "advance" },
      why: "jsonb must not be clocks",
      founderYes: true,
    });
    const after = await store.getJourney(dye, { companySlug: "dyeconverter" });
    assert.equal(after.ideas[0].clocks.journeyPhase, 1);
    assert.equal(after.ideas[0].clocks.currentGate, "hold");
    assert.equal(after.ideas[0].scoreboard.journeyPhase, 9);
  });

  it("put_journey, post_comment, and ACL changes emit append-only audit; advisors read, cannot write", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const advisor = bearer("advisor-cos@example.test");
    const dye = bearer("founder-dye@example.test");

    await store.putJourney(founder, {
      companySlug: "corehaul",
      journeyPhase: 2,
      why: "founder yes",
      founderYes: true,
      client: "cursor-agent",
      gateEnrichment: GATE_ENR,
    });
    await store.postComment(advisor, {
      companySlug: "corehaul",
      body: "noted",
      client: "cursor-agent",
    });
    const granted = await store.changeAcl(founder, {
      companySlug: "corehaul",
      principal: "specialist@example.test",
      principalKind: "email",
      role: "advisor",
      op: "grant",
      client: "cursor-agent",
    });
    assert.equal(granted.ok, true);
    const advisorWriteAcl = await store.changeAcl(advisor, {
      companySlug: "corehaul",
      principal: "nope@example.test",
      principalKind: "email",
      role: "advisor",
      op: "grant",
    });
    assert.equal(advisorWriteAcl.ok, false);

    const seen = await store.getJourney(advisor, { companySlug: "corehaul" });
    assert.equal(seen.ok, true);
    const vias = seen.audit.map((a) => a.whatChanged.via).sort();
    assert.deepEqual(vias, ["acl", "post_comment", "put_journey"]);
    assert.ok(seen.audit.every((a) => a.client === "cursor-agent"));
    assert.ok(seen.audit.some((a) => a.ideaId === null && a.whatChanged.via === "acl"));

    const hidden = await store.getJourney(dye, { companySlug: "corehaul" });
    assert.equal(hidden.ok, false);
    const dyeView = await store.getJourney(dye, { companySlug: "dyeconverter" });
    assert.equal(dyeView.audit.length, 0);
  });

  it("constraint_this_week is fluid, surfaced by get_journey, and writes emit audit", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const advisor = bearer("advisor-cos@example.test");

    const empty = await store.getJourney(founder, { companySlug: "corehaul" });
    assert.equal(empty.ideas[0].constraintThisWeek, "");
    assert.match(empty.ideas[0].snapshot, /where help is required/);

    const tooLong = await store.putJourney(founder, {
      companySlug: "corehaul",
      constraintThisWeek: "x".repeat(281),
      why: "too long",
      founderYes: true,
    });
    assert.equal(tooLong.ok, false);

    const written = await store.putJourney(founder, {
      companySlug: "corehaul",
      constraintThisWeek: "need two operators who already pay for dispatch",
      why: "this week's constraint",
      founderYes: true,
      client: "cursor-agent",
    });
    assert.equal(written.ok, true);
    assert.equal(written.idea.clocks.journeyPhase, 1);
    assert.equal(written.idea.clocks.currentGate, "hold");
    assert.equal(
      written.idea.constraintThisWeek,
      "need two operators who already pay for dispatch",
    );
    assert.equal(written.audit.whatChanged.constraint_this_week, written.idea.constraintThisWeek);

    const seen = await store.getJourney(advisor, {
      companySlug: "corehaul",
      expandMeetingDoc: true,
    });
    assert.equal(seen.ideas[0].constraintThisWeek, "need two operators who already pay for dispatch");
    assert.match(seen.ideas[0].snapshot, /need two operators who already pay for dispatch/);
    assert.match(seen.ideas[0].visualFlow, /need two operators who already pay for dispatch/);
    assert.match(seen.ideas[0].meetingDoc, /need two operators who already pay for dispatch/);
    assert.ok(
      seen.audit.some(
        (a) =>
          a.whatChanged.via === "put_journey" &&
          a.whatChanged.constraint_this_week ===
            "need two operators who already pay for dispatch",
      ),
    );
  });

  it("cold agent refuses “new landing page” as constraint unless founder writes an override", async () => {
    assert.equal(preferenceMayNameConstraint(), false);
    assert.equal(agentMayRubberStampConstraint(), false);
    const refuse = mayWriteConstraintThisWeek({
      constraint: "new landing page",
      talkedToCustomers: false,
    });
    assert.equal(refuse.ok, false);
    assert.equal(refuse.error, LANDING_PAGE_CONSTRAINT_REFUSE);
    const override = mayWriteConstraintThisWeek({
      constraint: "new landing page",
      talkedToCustomers: false,
      founderWrittenDecision: "We already know the slice; page is the unlock this week.",
    });
    assert.equal(override.ok, true);
    const afterTalks = mayWriteConstraintThisWeek({
      constraint: "new landing page",
      talkedToCustomers: true,
    });
    assert.equal(afterTalks.ok, true);

    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const rubber = await store.putJourney(founder, {
      companySlug: "corehaul",
      constraintThisWeek: "new landing page",
      why: "this is interesting",
      founderYes: true,
    });
    assert.equal(rubber.ok, false);
    assert.match(rubber.error, /fun side quest/);
    assert.match(rubber.error, /Do not rubber-stamp/);

    const stillEmpty = await store.getJourney(founder, { companySlug: "corehaul" });
    assert.equal(stillEmpty.ok, true);
    assert.equal(stillEmpty.ideas[0].constraintThisWeek, "");
    assert.match(stillEmpty.ideas[0].snapshot, /honest biggest bottleneck/);

    const written = await store.putJourney(founder, {
      companySlug: "corehaul",
      constraintThisWeek: "new landing page",
      why: "founder override after challenge",
      founderYes: true,
      founderWrittenDecision:
        "I heard the challenge. The unlock this week is still a new landing page.",
    });
    assert.equal(written.ok, true);
    assert.equal(written.idea.constraintThisWeek, "new landing page");
    assert.match(written.idea.snapshot, /new landing page/);
    assert.match(written.idea.constraintChallenge, /fun side quest/);
    assert.match(written.idea.constraintChallenge, /written override/);

    const seen = await store.getJourney(founder, { companySlug: "corehaul" });
    assert.equal(seen.ideas[0].constraintThisWeek, "new landing page");
    assert.match(seen.ideas[0].snapshot, /Challenge:/);
    assert.match(seen.ideas[0].snapshot, /honest biggest bottleneck/);
  });

  it("board notify: founder grants ACL members; mentee A cannot subscribe to B; webhook only to ACL; comments do not move gates", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const advisor = bearer("advisor-cos@example.test");
    const dye = bearer("founder-dye@example.test");

    const strangerGrant = await store.subscribeBoard(founder, {
      companySlug: "corehaul",
      principal: "stranger@example.test",
      principalKind: "email",
      webhookUrl: "https://hooks.example.test/stranger",
    });
    assert.equal(strangerGrant.ok, false);

    const http = await store.subscribeBoard(founder, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
      webhookUrl: "http://hooks.example.test/insecure",
    });
    assert.equal(http.ok, false);

    const cross = await store.subscribeBoard(dye, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
      webhookUrl: "https://hooks.example.test/core",
    });
    assert.equal(cross.ok, false);

    const advisorGrant = await store.subscribeBoard(advisor, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
      webhookUrl: "https://hooks.example.test/core",
    });
    assert.equal(advisorGrant.ok, false);

    const granted = await store.subscribeBoard(founder, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
      webhookUrl: "https://hooks.example.test/core",
      emailOptIn: true,
    });
    assert.equal(granted.ok, true);

    const listed = await store.listSubscribers(advisor, { companySlug: "corehaul" });
    assert.equal(listed.ok, true);
    assert.equal(listed.subscribers.length, 1);
    assert.equal(listed.subscribers[0].webhookUrl, "https://hooks.example.test/core");
    const hiddenList = await store.listSubscribers(dye, { companySlug: "corehaul" });
    assert.equal(hiddenList.ok, false);

    const advisorBoard = await store.getJourney(advisor, { companySlug: "corehaul" });
    assert.equal(advisorBoard.ok, true);
    assert.doesNotMatch(JSON.stringify(advisorBoard.audit), /hooks\.example\.test|webhookUrl/);
    const advisorProv = await store.listProvenance(advisor, { companySlug: "corehaul" });
    assert.equal(advisorProv.ok, true);
    assert.doesNotMatch(JSON.stringify(advisorProv), /hooks\.example\.test|webhookUrl/);
    const subAudit = advisorBoard.audit.find((a) => a.whatChanged?.via === "subscribe_board");
    assert.ok(subAudit);
    assert.equal(subAudit.whatChanged.after.principal, "advisor-cos@example.test");
    assert.equal(subAudit.whatChanged.after.webhookUrl, undefined);

    const wrote = await store.putJourney(founder, {
      companySlug: "corehaul",
      journeyPhase: 2,
      why: "founder yes",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(wrote.ok, true);
    assert.equal(wrote.notify.webhook, 1);
    assert.equal(wrote.notify.emailQueued, 1);
    assert.equal(store.webhookDeliveries.length, 1);
    assert.equal(store.webhookDeliveries[0].url, "https://hooks.example.test/core");
    assert.equal(store.webhookDeliveries[0].payload.event, "put_journey");
    assert.equal(store.webhookDeliveries[0].payload.company.slug, "corehaul");
    assert.doesNotMatch(JSON.stringify(store.webhookDeliveries[0].payload), /scoreboard|openQuestions/);

    const before = wrote.idea.clocks;
    const comment = await store.postComment(advisor, {
      companySlug: "corehaul",
      body: "help on the slice",
    });
    assert.equal(comment.ok, true);
    assert.deepEqual(comment.clocksUnchanged, before);
    assert.equal(comment.notify.webhook, 1);
    assert.equal(store.webhookDeliveries.at(-1).payload.event, "post_comment");
    assert.equal(store.webhookDeliveries.at(-1).payload.summary, "help on the slice");

    await store.changeAcl(founder, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
      role: "advisor",
      op: "revoke",
    });
    const afterRevoke = await store.putJourney(founder, {
      companySlug: "corehaul",
      loopStage: 2,
      why: "after revoke",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(afterRevoke.notify.webhook, 0);
  });

  it("owner comes from ACL; Cos-invented owner fields are stripped; digest cannot Advance", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const seen = await store.getJourney(founder, { companySlug: "corehaul" });
    assert.deepEqual(
      seen.owners.map((row) => row.principal).sort(),
      ["founder-core@example.test", "sub-only-corehaul"],
    );
    assert.ok(seen.owners.every((row) => row.role === "founder"));
    assert.ok(seen.acl.some((row) => row.role === "advisor"));
    assert.deepEqual(seen.digest, JOURNEY_DIGEST_CONTRACT);
    assert.match(seen.note, /Owner comes from ACL/);
    assert.match(seen.note, /webhook notify over polling/);

    const written = await store.putJourney(founder, {
      companySlug: "corehaul",
      scoreboard: {
        schema_version: 1,
        owner: "Cos invented this",
        owners: ["not-an-acl-principal"],
        ownerName: "Fake Founder",
        ownerEmail: "fake@example.test",
        openQuestions: ["who already has this job"],
      },
      why: "founder yes",
      founderYes: true,
    });
    assert.equal(written.ok, true);
    assert.equal(written.idea.scoreboard.owner, undefined);
    assert.equal(written.idea.scoreboard.owners, undefined);
    assert.equal(written.idea.scoreboard.ownerName, undefined);
    assert.equal(written.idea.scoreboard.ownerEmail, undefined);
    assert.deepEqual(written.owners.map((row) => row.principal).sort(), [
      "founder-core@example.test",
      "sub-only-corehaul",
    ]);
    assert.equal(scoreboardMayCarryOwner(), false);
    assert.equal(digestMayInventStage(), false);
    assert.equal(digestMayAdvanceGate(), false);
    assert.equal(preferWebhookOverPoll(), true);
    assert.equal(commentsMayMutateGate(), false);
  });

  it("list_provenance rebuilds clocks/scoreboard; kill requires postmortem and stays readable", async () => {
    const store = fixtureJourneyStore();
    const founder = bearer("founder-core@example.test");
    const dye = bearer("founder-dye@example.test");

    const silent = await store.putJourney(founder, {
      companySlug: "corehaul",
      currentGate: "kill",
      why: "did not work",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(silent.ok, false);
    assert.match(String(silent.error), /lessonsLearned and actionableInsights/);

    const noGateNote = await store.putJourney(founder, {
      companySlug: "corehaul",
      currentGate: "hold",
      why: "still holding",
      founderYes: true,
    });
    assert.equal(noGateNote.ok, false);
    assert.match(String(noGateNote.error), /whatChanged and whatWereNotDoing/);

    const held = await store.putJourney(founder, {
      companySlug: "corehaul",
      currentGate: "hold",
      constraintThisWeek: "talk to two operators",
      why: "hold while we talk",
      founderYes: true,
      gateEnrichment: GATE_ENR,
    });
    assert.equal(held.ok, true);
    assert.equal(held.audit.whatChanged.before.clocks.currentGate, "hold");
    assert.equal(held.audit.whatChanged.after.scoreboard.constraint_this_week, "talk to two operators");
    assert.equal(held.audit.whatChanged.whatChanged, GATE_ENR.whatChanged);
    assert.equal(held.audit.whatChanged.whatWereNotDoing, GATE_ENR.whatWereNotDoing);

    const created = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "retired-bet",
      founderYes: true,
      why: "second 0-1 board",
    });
    assert.equal(created.ok, true);

    const killed = await store.putJourney(founder, {
      companySlug: "corehaul",
      ideaSlug: "retired-bet",
      currentGate: "kill",
      why: "no one would pay for the slice",
      founderYes: true,
      gateEnrichment: {
        whatChanged: "retired the bet",
        whatWereNotDoing: "not retrying the same pitch",
        evidenceLinks: ["https://docs.example.test/retired-bet"],
      },
      killPostmortem: {
        lessonsLearned: "operators already have a dispatcher they trust",
        actionableInsights: "next bet must start from an observed paid workaround",
        evidenceLinks: ["https://docs.example.test/retired-bet"],
      },
    });
    assert.equal(killed.ok, true);
    assert.equal(killed.idea.killed, true);
    assert.equal(killed.idea.killPostmortem.lessonsLearned, "operators already have a dispatcher they trust");
    assert.equal(
      killed.idea.killPostmortem.actionableInsights,
      "next bet must start from an observed paid workaround",
    );
    assert.match(killed.idea.killedCard, /☠ Killed — operators already have a dispatcher they trust/);
    assert.equal(killed.audit.whatChanged.after.clocks.currentGate, "kill");
    assert.equal(killed.audit.whatChanged.lessonsLearned, "operators already have a dispatcher they trust");

    const board = await store.getJourney(founder, { companySlug: "corehaul" });
    const retired = board.ideas.find((i) => i.slug === "retired-bet");
    assert.ok(retired);
    assert.equal(retired.clocks.currentGate, "kill");
    assert.equal(retired.killedCard, killed.idea.killedCard);
    assert.match(retired.snapshot, /☠ Killed — operators already have a dispatcher they trust/);

    const listed = await store.listKilledIdeas(founder, { companySlug: "corehaul" });
    assert.equal(listed.ok, true);
    assert.equal(listed.ideas.length, 1);
    assert.equal(listed.ideas[0].slug, "retired-bet");
    assert.equal(listed.ideas[0].killPostmortem.lessonsLearned, retired.killPostmortem.lessonsLearned);

    const prov = await store.listProvenance(founder, {
      companySlug: "corehaul",
      ideaSlug: "retired-bet",
    });
    assert.equal(prov.ok, true);
    assert.ok(prov.events.some((e) => e.kind === "audit" && e.whatChanged?.after?.clocks?.currentGate === "kill"));
    assert.ok(prov.gateEvents.some((e) => e.action === "kill" && e.why === "no one would pay for the slice"));
    const lastAfter = [...prov.events]
      .reverse()
      .find((e) => e.kind === "audit" && e.whatChanged?.after?.clocks);
    assert.equal(lastAfter.whatChanged.after.clocks.currentGate, "kill");
    assert.equal(
      lastAfter.whatChanged.after.scoreboard.killPostmortem.lessonsLearned,
      "operators already have a dispatcher they trust",
    );

    const hidden = await store.listProvenance(dye, { companySlug: "corehaul" });
    assert.equal(hidden.ok, false);
    const hiddenKilled = await store.listKilledIdeas(dye, { companySlug: "corehaul" });
    assert.equal(hiddenKilled.ok, false);
  });

  it("portfolio scores are 1–5 labels; never invent; never promote; rank live ideas only", async () => {
    assert.equal(portfolioScoreMayPromote(), false);
    assert.equal(normalizePortfolioScore({ impact: 0, evidence: 3, leverage: 3 }).ok, false);
    assert.equal(normalizePortfolioScore({ impact: 6, evidence: 3, leverage: 3 }).ok, false);
    assert.equal(normalizePortfolioScore({ impact: 3.5, evidence: 3, leverage: 3 }).ok, false);
    assert.equal(normalizePortfolioScore({ impact: 3, evidence: 3 }).ok, false);
    assert.equal(normalizePortfolioScore({ impact: 3, evidence: 3, leverage: 3 }).ok, false);
    assert.equal(normalizePortfolioScore({ impact: 3, evidence: 3, leverage: 3 }).error, PORTFOLIO_WHY_REQUIRED);
    assert.equal(
      normalizePortfolioScore({ impact: 3, evidence: 3, leverage: 3, why: "x".repeat(281) }).error,
      PORTFOLIO_WHY_TOO_LONG,
    );
    assert.match(normalizePortfolioScore({ impact: 9, evidence: 1, leverage: 1, why: "out of range" }).error, /1–5/);
    assert.equal(PORTFOLIO_SCORE_OUT_OF_RANGE.includes("1–5"), true);

    const unscored = {
      id: "idea-alpha-a",
      companyId: "co-alpha",
      slug: "bet-a",
      name: "bet-a",
      journeyPhase: 1,
      loopStage: 1,
      currentGate: "hold",
      scoreboard: defaultScoreboard(),
    };
    assert.equal(portfolioScoreOf(unscored), undefined);
    assert.equal(portfolioViewOf([unscored]).applies, false);
    assert.equal(portfolioViewOf([unscored]).reason, PORTFOLIO_SKIP_NEED_TWO_LIVE);

    const store = new MemoryJourneyStore(
      [
        { id: "co-alpha", slug: "alpha", label: "alpha" },
        { id: "co-bravo", slug: "bravo", label: "bravo" },
      ],
      [
        {
          companyId: "co-alpha",
          principal: "founder@example.test",
          principalKind: "email",
          role: "founder",
        },
        {
          companyId: "co-bravo",
          principal: "founder-bravo@example.test",
          principalKind: "email",
          role: "founder",
        },
        {
          companyId: "co-alpha",
          principal: "advisor@example.test",
          principalKind: "email",
          role: "advisor",
        },
      ],
      [
        {
          id: "idea-alpha-default",
          companyId: "co-alpha",
          slug: "default",
          name: "alpha",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: defaultScoreboard(),
        },
        {
          id: "idea-bravo-default",
          companyId: "co-bravo",
          slug: "default",
          name: "bravo",
          journeyPhase: 1,
          loopStage: 1,
          currentGate: "hold",
          scoreboard: defaultScoreboard(),
        },
      ],
      [],
      [],
    );
    const founder = bearer("founder@example.test");
    const advisor = bearer("advisor@example.test");
    const bravo = bearer("founder-bravo@example.test");

    const skipNoWhy = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 4,
      evidence: 3,
      leverage: 5,
      why: "",
      founderYes: true,
    });
    assert.equal(skipNoWhy.ok, false);
    assert.equal(skipNoWhy.error, PORTFOLIO_WHY_REQUIRED);

    const skip = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 4,
      evidence: 3,
      leverage: 5,
      why: "need a second live idea before ranking",
      founderYes: true,
    });
    assert.equal(skip.ok, true);
    assert.equal(skip.skipped, true);
    assert.equal(skip.reason, PORTFOLIO_SKIP_NEED_TWO_LIVE);
    const one = await store.getJourney(founder, { companySlug: "alpha" });
    assert.equal(one.portfolio.applies, false);
    assert.equal(one.ideas[0].portfolioScore, undefined);
    assert.equal(one.ideas[0].scoreboard.portfolioScore, undefined);

    const created = await store.createIdea(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      founderYes: true,
      why: "second live idea",
    });
    assert.equal(created.ok, true);

    const badRange = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 9,
      evidence: 3,
      leverage: 3,
      why: "out of range",
      founderYes: true,
    });
    assert.equal(badRange.ok, false);
    assert.match(String(badRange.error), /1–5/);

    const advisorWrite = await store.putPortfolioScore(advisor, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 3,
      evidence: 3,
      leverage: 3,
      why: "advisor cannot label",
      founderYes: true,
    });
    assert.equal(advisorWrite.ok, false);

    const noYes = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 3,
      evidence: 3,
      leverage: 3,
      why: "no founder yes",
      founderYes: false,
    });
    assert.equal(noYes.ok, false);

    const first = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 5,
      evidence: 4,
      leverage: 3,
      why: "operators already pay for a dispatcher",
      founderYes: true,
    });
    assert.equal(first.ok, true);
    assert.equal(first.skipped, false);
    assert.equal(first.idea.clocks.currentGate, "hold");
    assert.deepEqual(
      { ...first.idea.portfolioScore, scoredAt: undefined, scoredBy: undefined },
      {
        impact: 5,
        evidence: 4,
        leverage: 3,
        why: "operators already pay for a dispatcher",
        scoredAt: undefined,
        scoredBy: undefined,
      },
    );
    assert.equal(first.idea.portfolioScore.scoredBy, "founder@example.test");
    assert.equal(first.audit.whatChanged.via, "put_portfolio_score");
    assert.equal(first.audit.whatChanged.why, "operators already pay for a dispatcher");
    assert.equal(first.audit.whatChanged.before.scoreboard.portfolioScore, undefined);
    assert.equal(first.audit.whatChanged.after.scoreboard.portfolioScore.impact, 5);
    assert.equal(first.audit.whatChanged.after.scoreboard.portfolioScore.why, "operators already pay for a dispatcher");
    assert.equal(first.notify, undefined);

    const second = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      impact: 2,
      evidence: 2,
      leverage: 2,
      why: "weaker observed pull",
      founderYes: true,
    });
    assert.equal(second.ok, true);
    assert.equal(second.portfolio.applies, true);
    assert.equal(second.portfolio.formula, PORTFOLIO_RANK_FORMULA);
    assert.deepEqual(
      second.portfolio.ranked.map((row) => row.slug),
      ["default", "second-bet"],
    );
    assert.equal(second.portfolio.ranked[0].total, 12);
    assert.equal(second.portfolio.ranked[1].total, 6);
    assert.deepEqual(second.portfolio.unscored, []);
    assert.equal(second.portfolio.ranked[0].why, "operators already pay for a dispatcher");

    const missingWhy = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      why: "relabel",
      founderYes: true,
      portfolioScore: { impact: 1, evidence: 1, leverage: 1 },
    });
    assert.equal(missingWhy.ok, false);
    assert.equal(missingWhy.error, PORTFOLIO_WHY_REQUIRED);

    const viaPut = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      why: "relabel",
      founderYes: true,
      portfolioScore: { impact: 1, evidence: 1, leverage: 1, why: "relabel after a weaker week" },
    });
    assert.equal(viaPut.ok, true);
    assert.equal(viaPut.idea.portfolioScore.impact, 1);
    assert.equal(viaPut.idea.portfolioScore.why, "relabel after a weaker week");
    assert.equal(viaPut.idea.clocks.currentGate, "hold");
    assert.equal(viaPut.audit.whatChanged.after.scoreboard.portfolioScore.why, "relabel after a weaker week");

    const invalidBoard = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      why: "bad score",
      founderYes: true,
      scoreboard: { schema_version: 1, portfolioScore: { impact: 0, evidence: 3, leverage: 3 } },
    });
    assert.equal(invalidBoard.ok, false);

    const killed = await store.putJourney(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      currentGate: "kill",
      why: "retire the weaker bet",
      founderYes: true,
      gateEnrichment: GATE_ENR,
      killPostmortem: {
        lessonsLearned: "buyers already have a workaround",
        actionableInsights: "next bet starts from an observed paid workaround",
      },
    });
    assert.equal(killed.ok, true);
    const afterKill = await store.getJourney(founder, { companySlug: "alpha" });
    assert.equal(afterKill.portfolio.applies, false);
    assert.equal(afterKill.portfolio.ranked.length, 0);
    const live = afterKill.ideas.find((i) => i.slug === "default");
    const dead = afterKill.ideas.find((i) => i.slug === "second-bet");
    assert.ok(live.portfolioScore);
    assert.equal(dead.killed, true);

    const scoreKilled = await store.putPortfolioScore(founder, {
      companySlug: "alpha",
      ideaSlug: "second-bet",
      impact: 5,
      evidence: 5,
      leverage: 5,
      why: "killed bets stay off the live rank",
      founderYes: true,
    });
    assert.equal(scoreKilled.ok, false);
    assert.equal(scoreKilled.error, PORTFOLIO_KILLED_OUT);

    const leak = await store.putPortfolioScore(bravo, {
      companySlug: "alpha",
      ideaSlug: "default",
      impact: 5,
      evidence: 5,
      leverage: 5,
      why: "cross-tenant leak",
      founderYes: true,
    });
    assert.equal(leak.ok, false);
    const hiddenBoard = await store.getJourney(bravo, { companySlug: "alpha" });
    assert.equal(hiddenBoard.ok, false);
    assert.doesNotMatch(JSON.stringify(hiddenBoard), /portfolioScore|impact/);
  });
});

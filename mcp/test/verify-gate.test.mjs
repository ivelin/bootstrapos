/**
 * Verify receipt gate and tool-list tiers. Memory stores only. Never prod.
 * Fixtures: alpha, bravo, charlie, founder@example.test.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { MemoryCompanyAdminStore, setCompanyAdminStoreForTests } from "../dist/company-admin.js";
import { hashMcpToken, MemoryIdentityStore, setIdentityStoreForTests } from "../dist/identity.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import { actorFromAuthorizationHeader, syntheticAccessToken } from "../dist/journey-auth.js";
import { filterToolsListJson, hidesHighTierTools, toolTier } from "../dist/tool-tier.js";
import { journeyRevision, readVerifyReceipt, runVerify, signVerifyReceipt, verifyMacKey } from "../dist/verify-evidence.js";
const EMAIL = "founder@example.test";
const SECRET = "verify-fixture-secret-not-a-real-invite-key";
const WHY = "operators who already pay for dispatch — kill if they do not use the weekly report";
const GATE = { whatChanged: "moved the clocks", whatWereNotDoing: "not a landing-page side quest" };
const HIGH = ["create_company", "grant_super_admin", "revoke_super_admin"];
const exp = Math.floor(Date.now() / 1000) + 3600;
function jwt(sub) {
  return syntheticAccessToken({ email: EMAIL, sub, extra: { exp } });
}
const memberToken = jwt("auth-alpha");
const adminToken = jwt("auth-admin");
const unsetToken = jwt("auth-unset");
const mentorToken = jwt("auth-mentor");
function mentee(id, token, role) {
  return {
    id,
    email: EMAIL,
    authUserId: id,
    labels: ["alpha", "bravo", "charlie"],
    tokenHashes: [hashMcpToken(token)],
    role,
  };
}
function boardScore(host, status = "unknown") {
  return {
    schema_version: 1,
    hypothesis: "Operators who already pay for dispatch hurt when the weekly report is late.",
    openQuestions: ["dispatch operators", "fleet owners", "yard leads"],
    readyForHumanEyes: {
      status,
      happyPath: "Open the weekly report and read this week's bet.",
      evidencePath: `https://${host}.example.test/board`,
      blockers: [],
    },
  };
}
let store;
let priorSecret;
const actor = actorFromAuthorizationHeader(`Bearer ${memberToken}`, "memory");
before(() => {
  priorSecret = process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
  process.env.BOOTSTRAP_INVITE_MAIL_SECRET = SECRET;
  store = new HostedMembershipJourneyStore((who) =>
    who.email === EMAIL ? ["alpha", "bravo", "charlie"] : [],
  );
  setJourneyStoreForTests(store);
  setIdentityStoreForTests(
    new MemoryIdentityStore([
      mentee("auth-alpha", memberToken, "member"),
      mentee("auth-admin", adminToken, "super_admin"),
      mentee("auth-unset", unsetToken, "unset"),
      mentee("auth-mentor", mentorToken, "mentor"),
    ]),
  );
  setCompanyAdminStoreForTests(
    new MemoryCompanyAdminStore([{ email: EMAIL, role: "member", labels: ["alpha", "bravo", "charlie"] }]),
  );
});
after(() => {
  setJourneyStoreForTests(undefined);
  setIdentityStoreForTests(undefined);
  setCompanyAdminStoreForTests(undefined);
  if (priorSecret === undefined) delete process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
  else process.env.BOOTSTRAP_INVITE_MAIL_SECRET = priorSecret;
});
let rpcId = 1;
async function rpc(method, params, token) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    }),
  );
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  return JSON.parse(raw);
}
function textOf(body) {
  return (body.result?.content ?? []).map((part) => part.text ?? "").join("\n");
}
function jsonOf(body) {
  return JSON.parse(textOf(body));
}
async function call(name, args, token = memberToken) {
  return rpc("tools/call", { name, arguments: args }, token);
}
async function put(args) {
  return call("put_journey", { why: WHY, founderYes: true, ...args });
}
async function listed(token) {
  const body = await rpc("tools/list", {}, token);
  return body.result.tools.map((tool) => tool.name).sort();
}
async function reject(args) {
  const body = await put(args);
  assert.equal(body.result?.isError, true, textOf(body));
  assert.match(textOf(body), /call bootstrap_verify/);
}

describe("verify gate and tool tiers", { concurrency: false }, () => {
  it("maps tiers and hides admin tools from member, unset, and mentor", async () => {
    assert.equal(toolTier("bootstrap_verify"), "low");
    assert.equal(toolTier("put_journey"), "medium");
    assert.equal(toolTier("create_company"), "high");
    assert.equal(hidesHighTierTools("mentor", true), true);
    assert.equal(hidesHighTierTools("unset", true), true);
    assert.equal(hidesHighTierTools("super_admin", true), false);
    assert.equal(hidesHighTierTools(undefined, false), false);
    assert.equal(filterToolsListJson("not-json", "member", true), null);
    assert.equal(filterToolsListJson("{}", "member", true), null);
    const member = await listed(memberToken);
    const admin = await listed(adminToken);
    assert.deepEqual(admin, await listed(undefined));
    for (const name of HIGH) {
      assert.equal(member.includes(name), false, name);
      assert.equal(admin.includes(name), true, name);
    }
    assert.equal((await listed(unsetToken)).includes("grant_super_admin"), false);
    assert.equal((await listed(mentorToken)).includes("revoke_super_admin"), false);
    assert.equal(member.includes("bootstrap_verify"), true);
    assert.equal(member.includes("put_journey"), true);
    for (const name of ["grant_super_admin", "revoke_super_admin"]) {
      const body = await call(name, { email: "other@example.test" });
      assert.notEqual(body.result?.isError, true);
      assert.deepEqual(jsonOf(body), { ok: false, status: 403 });
    }
  });
  it("signs with the derived key, not the raw secret", () => {
    const token = signVerifyReceipt(
      { v: 1, pass: true, company: "alpha", claim: "phase", sub: "auth-alpha", revision: "rev", exp: Date.now() + 60_000 },
      SECRET,
    );
    const [payload, mac] = token.split(".");
    const raw = createHmac("sha256", SECRET).update(payload).digest("base64url");
    assert.notEqual(raw, mac);
    assert.equal(readVerifyReceipt(`${payload}.${raw}`, SECRET, Date.now()).ok, false);
    assert.equal(readVerifyReceipt(token, SECRET, Date.now()).ok, true);
    assert.equal(verifyMacKey(SECRET).equals(Buffer.from(SECRET)), false);
  });
  it("rejects a phase or Ready-for-human-eyes write unless the receipt still matches", async () => {
    const early = jsonOf(await call("bootstrap_verify", { company: "alpha", claim: "phase" }));
    assert.equal(early.pass, false);
    assert.equal(early.evidence_id, null);
    assert.ok(early.gaps.length > 0);
    for (const company of ["alpha", "bravo", "charlie"]) {
      const setup = await put({ company, scoreboard: boardScore(company) });
      assert.equal(jsonOf(setup).ok, true, textOf(setup));
    }
    const unknown = jsonOf(await call("bootstrap_verify", { company: "alpha", claim: "marketing" }));
    assert.equal(unknown.pass, false);
    assert.equal(unknown.evidence_id, null);
    const verified = jsonOf(await call("bootstrap_verify", { company: "alpha", claim: "phase" }));
    assert.equal(verified.pass, true);
    assert.equal(verified.gaps.length, 0);
    const left = Date.parse(verified.expires_at) - Date.now();
    assert.ok(left > 23 * 60 * 60 * 1000 && left < 25 * 60 * 60 * 1000);
    const bravo = jsonOf(await call("bootstrap_verify", { company: "bravo", claim: "phase" }));
    const revision = journeyRevision(await store.getJourney(actor, { companySlug: "alpha" }));
    const base = { v: 1, pass: true, company: "alpha", claim: "phase", sub: "auth-alpha", revision, exp: Date.now() + 60_000 };
    const phaseWrite = { company: "alpha", journeyPhase: 2, gateEnrichment: GATE };
    const cases = [
      [{ ...phaseWrite }, "missing"],
      [{ ...phaseWrite, evidence_id: signVerifyReceipt({ ...base, exp: Date.now() - 1000 }, SECRET), claim: "phase" }, "expired"],
      [{ ...phaseWrite, evidence_id: bravo.evidence_id, claim: "phase" }, "foreign company"],
      [{ ...phaseWrite, evidence_id: verified.evidence_id, claim: "phase:2" }, "foreign claim"],
      [{ ...phaseWrite, evidence_id: signVerifyReceipt({ ...base, sub: "auth-bravo" }, SECRET), claim: "phase" }, "foreign caller"],
      [{
        ...phaseWrite,
        evidence_id: `${verified.evidence_id.slice(0, -1)}${verified.evidence_id.endsWith("a") ? "b" : "a"}`,
        claim: "phase",
      }, "tampered"],
      [{ ...phaseWrite, evidence_id: signVerifyReceipt({ ...base, pass: false }, SECRET), claim: "phase" }, "failing"],
    ];
    for (const [args, label] of cases) {
      const body = await put(args);
      assert.equal(body.result?.isError, true, `${label} ${textOf(body)}`);
      assert.match(textOf(body), /call bootstrap_verify/, label);
    }
    assert.equal(jsonOf(await call("get_journey", { company: "alpha" })).ideas[0].clocks.journeyPhase, 1);
    const advanced = jsonOf(await put({ ...phaseWrite, evidence_id: verified.evidence_id, claim: "phase" }));
    assert.equal(advanced.ok, true, JSON.stringify(advanced));
    assert.equal(advanced.idea.clocks.journeyPhase, 2);
    const again = jsonOf(await call("bootstrap_verify", { company: "alpha", claim: "phase" }));
    assert.equal(again.pass, false);
    assert.equal(again.evidence_id, null);
    const eyes = jsonOf(await call("bootstrap_verify", { company: "alpha", claim: "ready-for-human-eyes" }));
    assert.equal(eyes.pass, true, JSON.stringify(eyes));
    await reject({ company: "alpha", scoreboard: boardScore("alpha", "green") });
    const green = jsonOf(
      await put({
        company: "alpha",
        claim: "ready-for-human-eyes",
        evidence_id: eyes.evidence_id,
        scoreboard: boardScore("alpha", "green"),
      }),
    );
    assert.equal(green.ok, true, JSON.stringify(green));
    assert.equal(green.idea.scoreboard.readyForHumanEyes.status, "green");
  });
  it("a board change after verify kills the receipt", async () => {
    const verified = jsonOf(await call("bootstrap_verify", { company: "charlie", claim: "phase" }));
    assert.equal(verified.pass, true);
    const noted = jsonOf(await put({ company: "charlie", constraintThisWeek: "the weekly report is late" }));
    assert.equal(noted.ok, true, JSON.stringify(noted));
    assert.equal(noted.idea.clocks.journeyPhase, 1);
    await reject({
      company: "charlie",
      journeyPhase: 2,
      gateEnrichment: GATE,
      evidence_id: verified.evidence_id,
      claim: "phase",
    });
    const fresh = jsonOf(await call("bootstrap_verify", { company: "charlie", claim: "phase" }));
    assert.equal(fresh.pass, true);
    const advanced = jsonOf(
      await put({
        company: "charlie",
        journeyPhase: 2,
        gateEnrichment: GATE,
        evidence_id: fresh.evidence_id,
        claim: "phase",
      }),
    );
    assert.equal(advanced.ok, true);
    assert.equal(advanced.idea.clocks.journeyPhase, 2);
  });
  it("a passing check with no signing secret returns no receipt", async () => {
    delete process.env.BOOTSTRAP_INVITE_MAIL_SECRET;
    try {
      const missed = await runVerify({ store, actor, company: "bravo", claim: "phase", secret: undefined });
      assert.match(missed.error, /call bootstrap_verify/);
    } finally {
      process.env.BOOTSTRAP_INVITE_MAIL_SECRET = SECRET;
    }
  });
});

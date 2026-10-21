import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REDACT_ALLOW_KEYS } from "../dist/board-plain-words.js";
import {
  applySpokenPayloadLead,
  droppedRedactKeys,
  resetDroppedRedactKeys,
} from "../dist/initiative-card.js";
import { fixtureJourneyStore } from "../dist/journey.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(HERE, "../supabase/migrations");
const JOURNEY_SRC = path.resolve(HERE, "../src/journey.ts");

function takeParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return "";
}

function splitTop(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  let quote = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" && body[i - 1] !== "\\") quote = !quote;
    if (!quote) {
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      else if (c === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function buildObjectKeys(body) {
  const keys = new Set();
  const re = /jsonb?_build_object\s*\(/gi;
  let match;
  while ((match = re.exec(body))) {
    const inner = takeParen(body, match.index + match[0].length - 1);
    const parts = splitTop(inner);
    for (let i = 0; i < parts.length; i += 2) {
      const hit = parts[i].trim().match(/^'([A-Za-z_][A-Za-z0-9_]*)'$/);
      if (hit) keys.add(hit[1]);
    }
  }
  return keys;
}

function insertAuditKeys(sql) {
  const keys = new Set();
  const re = /INSERT\s+INTO\s+(?:bootstrap_os\.)?audit_events\s*\(/gi;
  let match;
  while ((match = re.exec(sql))) {
    const open = match.index + match[0].length - 1;
    const columns = takeParen(sql, open);
    for (const col of splitTop(columns)) {
      const hit = col.match(/([A-Za-z_][A-Za-z0-9_]*)/);
      if (hit) keys.add(hit[1]);
    }
    const end = sql.indexOf(";", open);
    for (const key of buildObjectKeys(sql.slice(match.index, end === -1 ? sql.length : end))) keys.add(key);
  }
  return keys;
}

function sqlFiles() {
  return fs.readdirSync(SQL_DIR).filter((name) => name.endsWith(".sql")).sort();
}

function sqlEmittedKeys() {
  const keys = new Set();
  for (const file of sqlFiles()) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), "utf8");
    for (const key of buildObjectKeys(sql)) keys.add(key);
    for (const key of insertAuditKeys(sql)) keys.add(key);
    const call = /emit_audit\s*\(/g;
    let match;
    while ((match = call.exec(sql))) {
      for (const key of buildObjectKeys(takeParen(sql, match.index + match[0].length - 1))) keys.add(key);
    }
  }
  return keys;
}

function memoryEmittedKeys() {
  const src = fs.readFileSync(JOURNEY_SRC, "utf8");
  const keys = new Set();
  const re = /whatChanged:\s*\{/g;
  let match;
  while ((match = re.exec(src))) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = src.slice(open, end);
    for (const key of body.matchAll(/(?:^|[,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*(?::|,|\})/g)) keys.add(key[1]);
  }
  return keys;
}

function board(extra = {}) {
  return applySpokenPayloadLead({
    ok: true,
    company: { slug: "alpha", label: "alpha" },
    ideas: [{ slug: "default", name: "alpha", scoreboard: { schema_version: 1, initiatives: [] } }],
    ...extra,
  });
}

const SECRET_KEYS_STAY_OFF = [
  "authCard",
  "inviteToken",
  "invitee_email",
  "inviterEmail",
  "inviter_email",
  "mailFrom",
  "mentee_id",
  "qrPayload",
  "queuedMail",
  "signupUrl",
  "token",
  "url",
  "webhookUrl",
];

describe("spoken payload allowlist", () => {
  it("keeps every audit, snapshot, notify, and get_journey key the SQL and the memory store emit", () => {
    const files = sqlFiles();
    assert.ok(files.length > 20);
    assert.ok(files.some((name) => !name.includes("bootstrap_os")));
    const emitted = new Set([...sqlEmittedKeys(), ...memoryEmittedKeys()]);
    assert.ok(emitted.has("journey_phase"));
    assert.ok(emitted.has("comment_id"));
    assert.ok(emitted.has("commentId"));
    assert.ok(emitted.has("principal_kind"));
    assert.ok(emitted.has("event"));
    assert.ok(emitted.has("summary"));
    assert.ok(emitted.has("source"));
    assert.ok(emitted.has("what_changed"));
    assert.ok(emitted.has("company_id"));
    assert.ok(emitted.has("principal"));
    assert.ok(emitted.has("ideaId"));
    for (const key of SECRET_KEYS_STAY_OFF) {
      assert.equal(emitted.has(key), true, key);
      assert.equal(REDACT_ALLOW_KEYS.has(key), false, key);
    }
    const missing = [...emitted].filter((key) => !SECRET_KEYS_STAY_OFF.includes(key) && !REDACT_ALLOW_KEYS.has(key)).sort();
    assert.deepEqual(missing, []);
  });

  it("keeps snake_case phase fields inside whatChanged before and after", () => {
    const seen = board({
      audit: [
        {
          whatChanged: {
            op: "put_journey",
            journey_phase: 2,
            before: { journey_phase: 1 },
            after: { journey_phase: 2 },
          },
        },
      ],
    });
    assert.equal(seen.audit[0].whatChanged.journey_phase, 2);
    assert.equal(seen.audit[0].whatChanged.before.journey_phase, 1);
    assert.equal(seen.audit[0].whatChanged.after.journey_phase, 2);
  });

  it("redacts a shared object every time and returns null for a cycle", () => {
    const shared = { premise: "close the SAFE", internal_token: "tok_secret" };
    const seen = board({ audit: [shared, shared] });
    assert.equal(seen.audit[0].internal_token, undefined);
    assert.equal(seen.audit[1].internal_token, undefined);
    assert.match(seen.audit[0].premise, /investment/);
    assert.match(seen.audit[1].premise, /investment/);
    assert.notEqual(seen.audit[1], shared);

    const cycle = { premise: "a booth" };
    cycle.after = cycle;
    const looped = board({ audit: [cycle] });
    assert.equal(looped.audit[0].after, null);
    assert.equal(looped.audit[0].premise, "a booth");
  });

  it("keeps nested enum arrays literal", () => {
    const seen = board({ controlPlaneOrder: [["primary", "supporting", "engagements"]] });
    assert.deepEqual(seen.controlPlaneOrder, [["primary", "supporting", "engagements"]]);
  });

  it("masks addresses and secret tokens in why, note, and premise only", () => {
    const seen = board({
      owners: [{ principal: "SAFE holder sam@example.test", role: "founder", email: "sam@example.test" }],
      note: "mail sam@example.test holds sk_live_note",
      audit: [
        {
          who: "sam@example.test",
          principal: "advisor-cos@example.test",
          why: "close the SAFE with sk_live_abc and sk_test_def",
          premise: "the booth SAFE sk_test_prem",
        },
      ],
    });
    assert.equal(seen.owners[0].principal, "investment holder sam@example.test");
    assert.equal(seen.owners[0].email, "sam@example.test");
    assert.equal(seen.audit[0].who, "sam@example.test");
    assert.equal(seen.audit[0].principal, "advisor-cos@example.test");
    assert.match(seen.audit[0].why, /investment/);
    assert.doesNotMatch(seen.audit[0].why, /@|sk_live_|sk_test_/);
    assert.match(seen.audit[0].why, /\[redacted\]/);
    assert.doesNotMatch(seen.note, /@|sk_live_/);
    assert.match(seen.note, /\[redacted\]/);
    assert.match(seen.audit[0].premise, /investment/);
    assert.doesNotMatch(seen.audit[0].premise, /sk_test_|@/);
  });

  it("leaves create_idea JSON stored and still redacts the following get_journey", async () => {
    const store = fixtureJourneyStore();
    const actor = {
      authenticated: true,
      principal: "founder-core@example.test",
      email: "founder-core@example.test",
    };
    const wrote = await store.createIdea(actor, {
      companySlug: "corehaul",
      ideaSlug: "booth-bet",
      founderYes: true,
      why: "plants pay for a weekly booth report",
    });
    assert.equal(wrote.ok, true);
    assert.match(wrote.note, /\bengagements\b/);
    assert.ok(wrote.owners.some((row) => row.principal === "founder-core@example.test"));
    assert.match(wrote.spokenLead, /^\*\*The #1 bottleneck is .+\.\*\*$/);
    assert.match(wrote.spoken, /^Founder: founder-core$/m);
    assert.doesNotMatch(wrote.spoken, /@/);
    assert.ok(wrote.owners.some((row) => row.principal === "founder-core@example.test"));

    const seen = await store.getJourney(actor, { companySlug: "corehaul", ideaSlug: "booth-bet" });
    assert.equal(seen.ok, true);
    assert.match(seen.note, /\bconversations\b/);
    assert.ok(seen.owners.some((row) => row.principal === "founder-core@example.test"));
    assert.ok(seen.acl.some((row) => row.principal === "founder-core@example.test"));
  });

  it("drops nothing while reading the fixture boards and the write flows", async () => {
    resetDroppedRedactKeys();
    const store = fixtureJourneyStore();
    const founder = {
      authenticated: true,
      principal: "founder-core@example.test",
      email: "founder-core@example.test",
    };
    const advisor = {
      authenticated: true,
      principal: "advisor-cos@example.test",
      email: "advisor-cos@example.test",
    };
    const created = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "flow-bet",
      founderYes: true,
      why: "plants pay for a weekly booth report",
    });
    assert.equal(created.ok, true);
    const wrote = await store.putJourney(founder, {
      companySlug: "corehaul",
      ideaSlug: "flow-bet",
      constraintThisWeek: "talk to one plant",
      why: "plants pay for the booth report",
      founderYes: true,
      gateEnrichment: {
        whatChanged: "named the booth",
        whatWereNotDoing: "not a side page",
      },
    });
    assert.equal(wrote.ok, true);
    const comment = await store.postComment(advisor, {
      companySlug: "corehaul",
      ideaSlug: "flow-bet",
      body: "a note from the advisor",
    });
    assert.equal(comment.ok, true);
    const granted = await store.subscribeBoard(founder, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
      webhookUrl: "https://hooks.example.test/core",
    });
    assert.equal(granted.ok, true);
    const removed = await store.unsubscribeBoard(founder, {
      companySlug: "corehaul",
      principal: "advisor-cos@example.test",
      principalKind: "email",
    });
    assert.equal(removed.ok, true);
    const acl = await store.changeAcl(founder, {
      companySlug: "corehaul",
      principal: "helper@example.test",
      principalKind: "email",
      role: "advisor",
      op: "grant",
    });
    assert.equal(acl.ok, true);
    const second = await store.createIdea(founder, {
      companySlug: "corehaul",
      ideaSlug: "flow-other",
      founderYes: true,
      why: "plants pay for a second booth report",
    });
    assert.equal(second.ok, true);
    const scored = await store.putPortfolioScore(founder, {
      companySlug: "corehaul",
      ideaSlug: "flow-bet",
      impact: 3,
      evidence: 2,
      leverage: 4,
      why: "the booth is the one they already pay for",
      founderYes: true,
    });
    assert.equal(scored.ok, true);
    for (const file of ["dyeconverter-initiatives.json", "micdots-initiatives.json"]) {
      const fixture = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", file), "utf8"));
      board({
        company: { slug: fixture.companySlug, label: fixture.companySlug },
        ideas: [
          {
            slug: fixture.ideaSlug,
            name: fixture.ideaSlug,
            scoreboard: fixture.scoreboard,
          },
        ],
      });
    }
    for (const [companySlug, email] of [
      ["dyeconverter", "founder-dye@example.test"],
      ["corehaul", "founder-core@example.test"],
      ["micdots", "founder-mic@example.test"],
    ]) {
      const seen = await store.getJourney(
        { authenticated: true, principal: email, email },
        { companySlug, expandMeetingDoc: true },
      );
      assert.equal(seen.ok, true, companySlug);
    }
    assert.deepEqual(droppedRedactKeys(), []);
  });
});

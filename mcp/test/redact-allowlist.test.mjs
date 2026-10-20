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

function jsonbKeys(body) {
  const keys = new Set();
  const re = /jsonb_build_object\s*\(/g;
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

function functionBodies(sql, name) {
  const bodies = [];
  const re = new RegExp(`FUNCTION (?:bootstrap_os\\.|public\\.)?${name}\\b`, "g");
  let match;
  while ((match = re.exec(sql))) {
    const as = sql.indexOf("$$", match.index);
    const end = sql.indexOf("$$", as + 2);
    if (as < 0 || end < 0) break;
    bodies.push(sql.slice(as, end));
  }
  return bodies;
}

function sqlEmittedKeys() {
  const keys = new Set();
  for (const file of fs.readdirSync(SQL_DIR).filter((name) => name.includes("bootstrap_os") && name.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), "utf8");
    const call = /emit_audit\s*\(/g;
    let match;
    while ((match = call.exec(sql))) {
      for (const key of jsonbKeys(takeParen(sql, match.index + match[0].length - 1))) keys.add(key);
    }
    for (const name of ["idea_board_snapshot", "enqueue_board_notify", "bootstrap_os_get_journey"]) {
      for (const body of functionBodies(sql, name)) {
        for (const key of jsonbKeys(body)) keys.add(key);
      }
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
    for (const key of body.matchAll(/(?:^|[,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) keys.add(key[1]);
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

describe("spoken payload allowlist", () => {
  it("keeps every audit, snapshot, notify, and get_journey key the SQL and the memory store emit", () => {
    const emitted = new Set([...sqlEmittedKeys(), ...memoryEmittedKeys()]);
    assert.ok(emitted.has("journey_phase"));
    assert.ok(emitted.has("comment_id"));
    assert.ok(emitted.has("commentId"));
    assert.ok(emitted.has("principal_kind"));
    assert.ok(emitted.has("event"));
    assert.ok(emitted.has("summary"));
    assert.ok(emitted.has("source"));
    const missing = [...emitted].filter((key) => !REDACT_ALLOW_KEYS.has(key)).sort();
    assert.deepEqual(missing, []);
    assert.equal(REDACT_ALLOW_KEYS.has("webhookUrl"), false);
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

  it("masks addresses and secret tokens in who, principal, and why", () => {
    const seen = board({
      owners: [{ principal: "SAFE holder sam@example.test", role: "founder", email: "sam@example.test" }],
      audit: [{ who: "sam@example.test", why: "close the SAFE with sk_live_abc and sk_test_def" }],
    });
    assert.equal(seen.owners[0].principal, "investment holder [redacted]");
    assert.equal(seen.owners[0].email, "sam@example.test");
    assert.equal(seen.audit[0].who, "[redacted]");
    assert.match(seen.audit[0].why, /investment/);
    assert.doesNotMatch(seen.audit[0].why, /@|sk_live_|sk_test_/);
    assert.match(seen.audit[0].why, /\[redacted\]/);
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
    assert.equal(wrote.spokenLead, "**CoreHaul**");

    const seen = await store.getJourney(actor, { companySlug: "corehaul", ideaSlug: "booth-bet" });
    assert.equal(seen.ok, true);
    assert.match(seen.note, /\bconversations\b/);
    assert.equal(
      seen.owners.some((row) => row.principal === "founder-core@example.test"),
      false,
    );
    assert.ok(seen.owners.some((row) => row.principal === "[redacted]"));
  });

  it("drops nothing while reading the fixture boards", async () => {
    resetDroppedRedactKeys();
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
    const store = fixtureJourneyStore();
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

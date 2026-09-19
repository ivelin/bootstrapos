/**
 * Hosted access layer: one login, many companies. Founder English.
 * PGlite/memory only. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import {
  HOSTED_GATED_IDENTITY_TOOL_NAMES,
  HOSTED_GATED_JOURNEY_TOOL_NAMES,
} from "../dist/constants.js";
import {
  HOSTED_BILL_GROK_LINE,
  hostedInstructionsForClient,
  TOOL_ENABLE_BOARD_WATCH,
  TOOL_GET_JOURNEY,
} from "../dist/hosted-copy.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { clearHostedCompanyContextForTests } from "../dist/hosted-company-context.js";
import {
  ivelinMemoryFixture,
  IVELIN_SEED_EMAIL,
  IVELIN_SEED_LABELS,
  setIdentityStoreForTests,
} from "../dist/identity.js";
import { MemoryInviteStore, setInviteStoreForTests } from "../dist/invite.js";
import { fixtureJourneyStore, setJourneyStoreForTests } from "../dist/journey.js";

const IVELIN_TOKEN = "bos_ivelin_fixture_token_xx";
const FORBIDDEN_IN_TOOL_TEXT = /Cursor|Path 3|WWW-Authenticate|Bearer|mentee/i;

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setInviteStoreForTests(undefined);
  setJourneyStoreForTests(undefined);
  clearHostedCompanyContextForTests();
});

async function rpc(method, params, id = 1, token = IVELIN_TOKEN, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const text = await res.text();
  assert.ok(res.ok, `RPC ${method} failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

function parseTool(result) {
  const text = result.result.content.map((c) => c.text ?? "").join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe("hosted access layer (one login, many companies)", () => {
  it("initialize instructions tell Grok to list companies and ignore Cursor copies", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "access-layer", version: "0.0.0" },
    });
    const instructions = init.result.instructions ?? "";
    assert.match(instructions, /bootstrap_whoami|bootstrap_list_companies/);
    assert.match(instructions, /companies/);
    assert.match(instructions, /ideas/);
    assert.match(instructions, /get_journey|bootstrap_where_are_we/);
    assert.match(instructions, /where are we/i);
    assert.match(instructions, /company board/i);
    assert.match(instructions, /idea board/i);
    assert.match(instructions, /visualFlow|mermaid/i);
    assert.match(instructions, /render/i);
    assert.match(instructions, /lastTransitions|decision log/i);
    assert.match(instructions, /owners/);
    assert.match(instructions, /constraintThisWeek|bottleneck/i);
    assert.match(instructions, /user-bootstrap-os-mcp/);
    assert.match(instructions, /bootstrap@pirin\.ai/);
    assert.match(instructions, /bootstrap_support/);
    assert.match(instructions, /human-routed|human reads it/i);
    assert.doesNotMatch(instructions, /swim/i);
    assert.doesNotMatch(instructions, /Path 3|WWW-Authenticate|Bearer|mentee/i);
    assert.doesNotMatch(instructions, /webhook|resend/i);
    assert.doesNotMatch(instructions, /x\.ai\/bot/);
    assert.ok(!instructions.includes(HOSTED_BILL_GROK_LINE));
    assert.equal(instructions, hostedInstructionsForClient({ clientName: "access-layer" }));
  });

  it("hosted tool descriptions stay in founder English", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const listed = await rpc("tools/list", {}, 2);
    const tools = listed.result.tools;
    const names = tools.map((t) => t.name);
    for (const n of HOSTED_GATED_IDENTITY_TOOL_NAMES) {
      assert.ok(names.includes(n), `missing ${n}`);
    }
    for (const n of HOSTED_GATED_JOURNEY_TOOL_NAMES) {
      assert.ok(!names.includes(n), `must hide ${n} without a store`);
    }
    for (const tool of tools) {
      if (
        !HOSTED_GATED_IDENTITY_TOOL_NAMES.includes(tool.name) &&
        tool.name !== "bootstrap_os_info" &&
        tool.name !== "bootstrap_support"
      ) {
        continue;
      }
      assert.doesNotMatch(String(tool.description ?? ""), FORBIDDEN_IN_TOOL_TEXT, tool.name);
      if (tool.name === "bootstrap_os_info" || tool.name === "bootstrap_support") {
        assert.match(String(tool.description ?? ""), /bootstrap@pirin\.ai/);
      }
    }
  });

  it("get_journey description advertises company vs idea, mermaid, log, bottleneck, owners", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    setJourneyStoreForTests(
      new HostedMembershipJourneyStore((actor) =>
        actor.email === IVELIN_SEED_EMAIL ? [...IVELIN_SEED_LABELS] : [],
      ),
    );
    const listed = await rpc("tools/list", {}, 11);
    const journey = listed.result.tools.find((t) => t.name === "get_journey");
    assert.ok(journey);
    assert.equal(journey.description, TOOL_GET_JOURNEY);
    assert.match(journey.description, /where are we/i);
    assert.match(journey.description, /company board/i);
    assert.match(journey.description, /idea board/i);
    assert.match(journey.description, /company/i);
    assert.match(journey.description, /idea/i);
    assert.match(journey.description, /visualFlow|mermaid/i);
    assert.match(journey.description, /lastTransitions|decision log/i);
    assert.match(journey.description, /owners/);
    assert.match(journey.description, /constraintThisWeek|bottleneck/i);
    assert.doesNotMatch(journey.description, /swim/i);
    assert.doesNotMatch(journey.description, /state machine/i);
    const ideaParam = journey.inputSchema?.properties?.idea;
    const companyParam = journey.inputSchema?.properties?.company;
    assert.match(String(companyParam?.description ?? ""), /team/i);
    assert.match(String(ideaParam?.description ?? ""), /idea/i);
    assert.doesNotMatch(JSON.stringify(journey.inputSchema), /CoreHaul/);
    const watch = listed.result.tools.find((t) => t.name === "enable_board_watch");
    assert.ok(watch);
    assert.equal(watch.description, TOOL_ENABLE_BOARD_WATCH);
    assert.match(watch.description, /Turn on board updates for Bill/);
    assert.doesNotMatch(watch.description, /webhook|subscribe_board|https URL/i);
  });

  it("whoami and list_companies return companies for the seed user", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const who = parseTool(await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 3));
    assert.deepEqual(who.companies, [...IVELIN_SEED_LABELS]);
    assert.deepEqual(who.labels, [...IVELIN_SEED_LABELS]);
    const listed = parseTool(
      await rpc("tools/call", { name: "bootstrap_list_companies", arguments: {} }, 4),
    );
    assert.deepEqual(listed.companies, [...IVELIN_SEED_LABELS]);
  });

  it("use_company rejects a company the user does not hold and sets one they do", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    const session = { "MCP-Session-Id": "access-layer-session-1" };
    const denied = await rpc(
      "tools/call",
      { name: "bootstrap_use_company", arguments: { company: "not-a-team" } },
      5,
      IVELIN_TOKEN,
      session,
    );
    assert.equal(denied.result.isError, true);
    assert.match(denied.result.content[0].text, /don't have access/i);

    const ok = parseTool(
      await rpc(
        "tools/call",
        { name: "bootstrap_use_company", arguments: { company: "alpha" } },
        6,
        IVELIN_TOKEN,
        session,
      ),
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.activeCompany, "alpha");

    const who = parseTool(
      await rpc("tools/call", { name: "bootstrap_whoami", arguments: {} }, 7, IVELIN_TOKEN, session),
    );
    assert.equal(who.activeCompany, "alpha");
  });

  it("invite_member uses the active company when company is omitted", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    setInviteStoreForTests(
      new MemoryInviteStore([
        {
          id: "ivelin",
          email: IVELIN_SEED_EMAIL,
          authUserId: "ivelin-auth",
          labels: ["charlie", "bravo", "alpha"],
        },
      ]),
    );
    const session = { "MCP-Session-Id": "access-layer-session-2" };
    await rpc(
      "tools/call",
      { name: "bootstrap_use_company", arguments: { company: "alpha" } },
      8,
      IVELIN_TOKEN,
      session,
    );
    const invited = parseTool(
      await rpc(
        "tools/call",
        { name: "invite_member", arguments: { email: "bill@example.test" } },
        9,
        IVELIN_TOKEN,
        session,
      ),
    );
    assert.equal(invited.ok, true);
    assert.equal(invited.company, "alpha");
    assert.equal(invited.invited, "bill@example.test");
    assert.match(invited.signInUrl, /^https:\/\/pirin\.ai\/bootstrap-os\/login\?invite=/);
    assert.match(invited.note, /email at that address/);
    const blob = JSON.stringify(invited);
    assert.doesNotMatch(blob, /webhook|cron|mail mode|queuedMail|never talks to Resend/i);
  });

  it("lists journey tools only when a store is attached", async () => {
    setIdentityStoreForTests(ivelinMemoryFixture(IVELIN_TOKEN));
    setJourneyStoreForTests(fixtureJourneyStore());
    const listed = await rpc("tools/list", {}, 10);
    const names = listed.result.tools.map((t) => t.name);
    for (const n of HOSTED_GATED_JOURNEY_TOOL_NAMES) {
      assert.ok(names.includes(n), `missing journey ${n} with store`);
    }
  });
});

/**
 * tools/list snapshot. setupSteps on the server card is the format source.
 * Caller-visible fields only. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleHostedReadFetch } from "../dist/hosted-handler.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { ivelinMemoryFixture, setIdentityStoreForTests } from "../dist/identity.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import {
  EMPTY_COMPANY_GUIDANCE,
  FIRST_BET_STEP,
  SETUP_CATALOG,
  STARTER_BET_BOARD_STEP,
  ZERO_COMPANY_GUIDANCE,
} from "../dist/setup-steps.js";
import { REPO_ROOT } from "./helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.join(__dirname, "fixtures", "tools-list-snapshot.json");
const TOKEN = "bos_ivelin_fixture_token_ok";

afterEach(() => {
  setIdentityStoreForTests(undefined);
  setJourneyStoreForTests(undefined);
});

function toolShape(tools) {
  return tools
    .map((tool) => ({
      name: tool.name,
      readOnlyHint: tool.annotations?.readOnlyHint === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listedTools() {
  setIdentityStoreForTests(ivelinMemoryFixture(TOKEN));
  setJourneyStoreForTests(
    new HostedMembershipJourneyStore(() => ["alpha"]),
  );
  const res = await handleHostedReadFetch(
    new Request("https://preview.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
  );
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  return JSON.parse(raw).result.tools;
}

describe("setup catalog and tools/list snapshot", () => {
  it("README, LISTING, and the skill match the server catalog", () => {
    const docs = [
      fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8"),
      fs.readFileSync(path.join(REPO_ROOT, "LISTING.md"), "utf8"),
      fs.readFileSync(path.join(REPO_ROOT, "plugin/skills/hosted-connector-setup/SKILL.md"), "utf8"),
    ];
    for (const doc of docs) {
      assert.ok(doc.includes(ZERO_COMPANY_GUIDANCE), "missing zero-company guidance");
      assert.ok(doc.includes(EMPTY_COMPANY_GUIDANCE), "missing empty-company guidance");
      assert.ok(doc.includes(STARTER_BET_BOARD_STEP.title));
      assert.ok(doc.includes(FIRST_BET_STEP.title));
      assert.ok(doc.includes(STARTER_BET_BOARD_STEP.nextTool));
      assert.ok(doc.includes(FIRST_BET_STEP.nextTool));
    }
    assert.equal(SETUP_CATALOG.setupFormatVersion, 1);
    assert.deepEqual(Object.keys(SETUP_CATALOG.zeroCompany.setupSteps[0]).sort(), ["id", "nextTool", "title"]);
  });

  it("tools/list readOnlyHint and setup meta match the snapshot", async () => {
    const tools = await listedTools();
    const starter = tools.find((tool) => tool.name === "create_starter_board");
    assert.ok(starter);
    assert.equal(starter.annotations.readOnlyHint, false);
    assert.deepEqual(starter._meta.setup, SETUP_CATALOG);
    const names = new Set(tools.map((tool) => tool.name));
    for (const step of [...SETUP_CATALOG.zeroCompany.setupSteps, ...SETUP_CATALOG.emptyCompany.setupSteps]) {
      assert.ok(names.has(step.nextTool), step.nextTool);
    }
    const whoami = tools.find((tool) => tool.name === "bootstrap_whoami");
    assert.equal(whoami.annotations.readOnlyHint, true);
    const snapshot = { tools: toolShape(tools), setup: SETUP_CATALOG };
    if (process.env.UPDATE_TOOLS_SNAPSHOT === "1") {
      fs.writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
    }
    const saved = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
    assert.deepEqual(toolShape(tools), saved.tools);
    assert.deepEqual(SETUP_CATALOG, saved.setup);
  });
});

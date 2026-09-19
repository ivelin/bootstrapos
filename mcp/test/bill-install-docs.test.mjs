/**
 * Public Bill install page. Invite-only MCP — not free Path 1.
 * Do not advertise vercel.app or mcp.pirin.ai.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const BILL = path.join(REPO_ROOT, "docs", "install-bill.md");
const README = path.join(REPO_ROOT, "README.md");
const BILL_URL = "https://x.ai/bot/NfURVcmf2bx9QyoljkJ7Y";
const MCP_PIN = "https://mcp.bootstrap.pirin.ai/mcp";
const LOGIN = "https://pirin.ai/bootstrap-os/login";
const PATH1_REPO = "https://github.com/ivelin/bootstrapos";
const PATH1_INSTALL = "https://pirin.ai/bootstrap-os";

describe("Bootstrap Bill install docs", () => {
  it("ships the live Bill URL and invite-only MCP + login, not Path 1", () => {
    const body = fs.readFileSync(BILL, "utf8");
    const readme = fs.readFileSync(README, "utf8");
    assert.ok(fs.statSync(BILL).size > 50, "docs/install-bill.md missing or empty");
    assert.ok(body.includes(BILL_URL), "exact Bill URL");
    assert.ok(body.includes(MCP_PIN), "invite-only MCP pin");
    assert.ok(body.includes(LOGIN), "pirin.ai login");
    assert.ok(body.includes(PATH1_REPO), "free Path 1 GitHub");
    assert.ok(body.includes(PATH1_INSTALL), "free Path 1 install page");
    assert.match(body, /bootstrap@pirin\.ai/);
    assert.match(body, /Bill checks your board weekly/);
    assert.match(body, /Bill watches the board when Cos turns it on/);
    assert.match(body, /board updates/);
    assert.match(body, /not.*Path 1/i);
    assert.doesNotMatch(body, /webhook/i);
    assert.doesNotMatch(body, /subscribe_board/);
    assert.doesNotMatch(body, /grokbot/i);
    assert.doesNotMatch(body, /https URL paste|paste an? https/i);
    assert.doesNotMatch(body, /vercel\.app/);
    assert.doesNotMatch(body, /mcp\.pirin\.ai/);
    assert.match(readme, /docs\/install-bill\.md/);
    assert.match(readme, /That is not Path 1/);
    assert.doesNotMatch(readme, /Grok Bot template|Bootstrap OS Bot Client/i);
  });
});

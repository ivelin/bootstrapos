/**
 * M1 automated gate: spawn MCP over stdio via official SDK client.
 * Exercises multi-company tools, phase gate, refuse external ask.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MCP_ROOT, "..");
const SERVER_JS = path.join(MCP_ROOT, "dist", "index.js");

function parseToolText(result) {
  assert.ok(result?.content?.length, "tool result missing content");
  const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
  if (result.isError) {
    const err = new Error(text);
    err.isToolError = true;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  return parseToolText(result);
}

async function main() {
  assert.ok(fs.existsSync(SERVER_JS), `build missing: ${SERVER_JS}`);

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-stdio-mcp-"));

  const env = { ...process.env };
  env.BOOTSTRAP_OS_ROOT = REPO_ROOT;
  env.BOOTSTRAP_DATA_ROOT = dataRoot;
  delete env.BOOTSTRAP_INSTANCE_ROOT;
  delete env.BOOTSTRAP_STATE_PATH;
  delete env.BOOTSTRAP_TRACES_DIR;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_JS],
    cwd: MCP_ROOT,
    stderr: "pipe",
    env,
  });

  const client = new Client({ name: "bootstrap-os-stdio-smoke", version: "0.0.0" });
  let stderrBuf = "";
  transport.stderr?.on("data", (chunk) => {
    stderrBuf += chunk.toString();
  });

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const required = [
      "bootstrap_os_info",
      "bootstrap_list_companies",
      "bootstrap_init_company",
      "bootstrap_use_company",
      "bootstrap_where_are_we",
      "bootstrap_get_state",
      "bootstrap_update_state",
      "bootstrap_refuse_external_ask_if_not_green",
      "bootstrap_get_ai_instructions",
      "bootstrap_house_rule_pins",
      "bootstrap_support",
    ];
    for (const n of required) {
      assert.ok(names.includes(n), `missing tool ${n}`);
    }
    assert.ok(names.length >= 15, `expected full tool surface, got ${names.length}`);
    assert.ok(!names.includes("get_journey"), "stdio must not lift hosted journey tools");
    assert.ok(!names.includes("create_idea"));
    assert.ok(!names.includes("put_journey"));
    assert.ok(!names.includes("post_comment"));
    assert.ok(!names.includes("subscribe_board"));
    assert.ok(!names.includes("unsubscribe_board"));
    assert.ok(!names.includes("list_subscribers"));
    assert.ok(!names.includes("enable_board_watch"));
    assert.ok(!names.includes("list_provenance"));
    assert.ok(!names.includes("put_portfolio_score"));

    const info = await call(client, "bootstrap_os_info");
    assert.equal(info.mcpVersion, "0.3.5");
    assert.equal(info.support?.email, "bootstrap@pirin.ai");
    const support = await call(client, "bootstrap_support");
    assert.equal(support.email, "bootstrap@pirin.ai");
    assert.match(String(support.routed), /human-routed/i);
    assert.equal(info.osVersion, "2.8.14");
    assert.equal(path.resolve(info.paths.dataRoot), path.resolve(dataRoot));
    assert.match(JSON.stringify(info.adoptionOrder), /not mentee-ready boards/);
    assert.match(JSON.stringify(info.adoptionOrder), /Not pirin\.ai/);
    assert.match(JSON.stringify(info.adoptionOrder), /Path 1 stays the front door/);
    assert.equal(info.marketplace, false);
    assert.match(JSON.stringify(info.houseRules), /observed wins/i);
    assert.match(JSON.stringify(info.houseRules), /spoken yes cannot promote/i);
    assert.match(JSON.stringify(info.houseRules), /marketing volume cannot promote/i);
    assert.match(JSON.stringify(info.houseRules), /security program cannot promote/i);
    assert.match(JSON.stringify(info.houseRules), /no optimal price until people have paid and stayed/i);
    assert.match(JSON.stringify(info.houseRules), /do not automate a step that should not exist/i);

    for (const id of ["alpha", "bravo", "charlie"]) {
      const r = await call(client, "bootstrap_init_company", {
        companyId: id,
        displayName: id,
        hypothesis: `${id} hypothesis under stdio smoke`,
      });
      assert.equal(r.companyId, id);
      assert.equal(r.created, true);
      assert.equal(r.ok, true);
    }

    const listed = await call(client, "bootstrap_list_companies");
    assert.ok(listed.companies.length >= 3);

    await call(client, "bootstrap_use_company", { companyId: "charlie" });
    const where = await call(client, "bootstrap_where_are_we", {});
    const whereBlob = JSON.stringify(where);
    assert.match(whereBlob, /charlie/i);

    const denied = await call(client, "bootstrap_update_state", {
      journeyPhase: 5,
      founderApprovedPhaseChange: false,
    });
    assert.equal(denied.state.journeyPhase, 1);
    assert.ok(
      (denied.warnings || []).some((w) => /founder/i.test(w)),
      `expected founder warning, got ${JSON.stringify(denied.warnings)}`,
    );

    const allowed = await call(client, "bootstrap_update_state", {
      journeyPhase: 5,
      founderApprovedPhaseChange: true,
    });
    assert.equal(allowed.state.journeyPhase, 5);

    await call(client, "bootstrap_use_company", { companyId: "alpha" });
    const alpha = await call(client, "bootstrap_get_state", {});
    assert.equal(alpha.state.journeyPhase, 1);
    assert.equal(alpha.state.companyId, "alpha");

    const refuse = await call(client, "bootstrap_refuse_external_ask_if_not_green", {
      intent: "email mentor a try-link",
    });
    assert.equal(refuse.allow, false);

    const ai = await call(client, "bootstrap_get_ai_instructions", {});
    assert.ok(String(typeof ai === "string" ? ai : JSON.stringify(ai)).length > 200);

    const diskCharlie = JSON.parse(
      fs.readFileSync(
        path.join(dataRoot, "instances", "charlie", "company", "state", "company-state.json"),
        "utf8",
      ),
    );
    assert.equal(diskCharlie.journeyPhase, 5);

    console.log(
      JSON.stringify(
        {
          ok: true,
          gate: "M1-stdio-protocol",
          tools: names.length,
          dataRoot,
          companies: ["alpha", "bravo", "charlie"],
          charliePhase: diskCharlie.journeyPhase,
          refuseAllow: refuse.allow,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.error("stdio MCP client smoke FAILED");
    console.error(e);
    if (stderrBuf) console.error("--- server stderr ---\n", stderrBuf);
    process.exitCode = 1;
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

main();

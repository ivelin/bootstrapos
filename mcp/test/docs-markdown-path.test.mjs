import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, makeTempEnv, rmrf } from "./helpers.mjs";
import { clearSession } from "../dist/companies.js";
import { listOsDocs, readOsDoc } from "../dist/docs.js";
import { HOSTED_MCP_RESOURCE, HOSTED_MCP_RESOURCE_ALIAS } from "../dist/oauth.js";

describe("markdown install path (zero MCP required)", () => {
  it("portable docs exist on disk without node mcp runtime", () => {
    const required = [
      "company-os/operating-system.md",
      "company-os/live-runtime.md",
      "company-os/ready-for-human-eyes.md",
      "company-os/ai-instructions.md",
      "company-os/first-hour.md",
      "company-os/clock-examples.md",
      "company-os/after-proof-efficiency.md",
      "templates/company/state/company-state.json",
      "templates/company/state/where-are-we.py",
      "templates/applied-here.md",
    ];
    for (const rel of required) {
      const full = path.join(REPO_ROOT, rel);
      assert.ok(fs.existsSync(full), `missing ${rel}`);
      assert.ok(fs.statSync(full).size > 50, `too small: ${rel}`);
    }
  });

  it("company-state template is valid JSON with required fields", () => {
    const raw = fs.readFileSync(
      path.join(REPO_ROOT, "templates/company/state/company-state.json"),
      "utf8",
    );
    const state = JSON.parse(raw);
    for (const key of [
      "companyId",
      "hypothesis",
      "journeyPhase",
      "loopStage",
      "readyForHumanEyes",
      "openQuestions",
      "scores",
    ]) {
      assert.ok(key in state, `missing field ${key}`);
    }
    assert.equal(state.readyForHumanEyes.status, "unknown");
  });

  it("MCP docs reader resolves blueprint from OS root", () => {
    const dataRoot = makeTempEnv();
    clearSession();
    try {
      const docs = listOsDocs();
      assert.equal(docs.length, 7);
      assert.ok(docs.some((d) => d.key === "clock-examples"));
      const body = readOsDoc("ai-instructions");
      assert.match(body, /Hard rules/i);
      assert.match(body, /stated, synthetic, and observed/i);
      assert.match(body, /Likert/);
      assert.match(body, /then map/);
      assert.ok(body.length > 200);
      const clocks = readOsDoc("clock-examples");
      assert.match(clocks, /Teaching, not a live board/);
      assert.match(clocks, /household jobs/);
      assert.match(clocks, /parents who already pay a cleaner/);
      assert.match(clocks, /founder butler/);
      assert.match(clocks, /our house/);
      assert.match(clocks, /Write back saves/);
      assert.match(clocks, /Engineering green is not demand/);
      assert.match(clocks, /Do \*\*not\*\* reset to Write the bet \/ Ask/);
      assert.doesNotMatch(clocks, /IESER|FIRAC/);
      assert.doesNotMatch(clocks, /cell 1|Cell 1|cell #/);
      const firstHour = readOsDoc("first-hour");
      assert.match(firstHour, /clock-examples/);
      assert.doesNotMatch(firstHour, /One-page thesis\. Not a landing page/);
      assert.match(firstHour, /demographic one-liner/i);
      assert.match(firstHour, /demo-only role-play is the weak case/i);
      assert.match(firstHour, /Eyeballs aren't buyers/);
      assert.match(firstHour, /house-rule-marketing-volume-cannot-promote/);
      const os = readOsDoc("operating-system");
      assert.match(os, /2\.8\.9/);
      assert.match(os, /### House rule: marketing volume cannot promote/);
      assert.match(os, /### House rule: a security program cannot promote/);
      assert.match(os, /### House rule: there is no optimal price until people have paid and stayed/);
      assert.match(os, /### House rule: do not automate a step that should not exist/);
      assert.match(os, /house-rule-do-not-automate-a-step-that-should-not-exist/);
      assert.match(os, /Several ideas may attack that same bottleneck/);
      assert.match(os, /Name the one bottleneck this week and work that/);
      assert.doesNotMatch(os, /Do not open a second idea, ritual, or agent team to walk around it/);
      assert.match(os, /## Day 0: lifestyle or swinging for the fences/);
      assert.match(os, /popcorn stand/);
      assert.match(firstHour, /day-0-lifestyle-or-swinging-for-the-fences/);
      assert.match(firstHour, /house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed/);
      assert.match(firstHour, /house-rule-do-not-automate-a-step-that-should-not-exist/);
      assert.match(firstHour, /### Standing rules/);
      assert.ok(firstHour.includes(HOSTED_MCP_RESOURCE));
      assert.ok(!firstHour.includes(HOSTED_MCP_RESOURCE_ALIAS));
      assert.match(firstHour, /Do \*\*not\*\* upload mentee work to Ivelin.s GitHub/);
      assert.ok(firstHour.includes("https://github.com/ivelin/bootstrap"));
      assert.match(firstHour, /\*\*Not\*\* a public catalog submit/);
      assert.match(firstHour, /\*\*Not\*\* mentee boards on our host/);
      assert.match(firstHour, /\*\*Not\*\* a Grok Bot marketplace bot/);
      assert.match(firstHour, /Not another Day 0 checkbox/);
      const doneWhen = firstHour.match(/## Done when[\s\S]*?(?=\n## After this hour)/);
      assert.ok(doneWhen, "Done when section missing");
      assert.match(doneWhen[0], /Thesis written/);
      assert.match(doneWhen[0], /≥3 customer groups/);
      assert.match(doneWhen[0], /Where are we/);
      assert.doesNotMatch(doneWhen[0], /bootstrap-os-mcp\.vercel\.app/);
      assert.doesNotMatch(doneWhen[0], /mcp\.bootstrap\.pirin\.ai/);
      assert.doesNotMatch(doneWhen[0], /upload mentee work/);
      assert.doesNotMatch(doneWhen[0], /automate a step that should not exist/);
      assert.doesNotMatch(doneWhen[0], /automate the playbook/);
      assert.doesNotMatch(doneWhen[0], /agent team/);
      assert.match(firstHour, /Write the thesis \(~20 minutes\)/);
      assert.match(firstHour, /At least three customer groups \(~25 minutes\)/);
      assert.match(firstHour, /First “Where are we\?” \(~15 minutes\)/);
      assert.match(os, /Text eight people/);
      assert.match(os, /### Starter legal templates/);
      assert.match(os, /https:\/\/github.com\/General-Legal\/legal-templates/);
      assert.match(os, /https:\/\/general\.legal\/library/);
      assert.match(os, /### Cap-table modeler/);
      assert.match(os, /https:\/\/startup-finance\.1984\.vc\//);
      assert.match(os, /https:\/\/github.com\/1984vc\/cap-table/);
      assert.match(os, /https:\/\/www\.ycombinator\.com\/safe\/calculator/);
      assert.match(os, /npx skills add 1984vc\/cap-table/);
      assert.match(os, /npx @1984vc\/cap-table/);
      assert.match(os, /CLI\/skill only/);
      assert.match(os, /### After-proof efficiency \(fences\)/);
      assert.match(os, /after-proof-efficiency\.md/);
      const efficiency = readOsDoc("after-proof-efficiency");
      assert.match(efficiency, /Dated/);
      assert.match(efficiency, /CAC payback/);
      assert.match(efficiency, /NRR and GRR/);
      assert.match(efficiency, /Pilots fake NRR/);
      assert.match(efficiency, /Usage, not seats/);
      assert.match(efficiency, /Gross margin/);
      assert.match(efficiency, /Magic number only if margin-adjusted/);
      assert.match(efficiency, /0\.75 stop-spend/);
      assert.match(efficiency, /1\.0 may-spend/);
      assert.match(efficiency, /Benchmarkit 2026/);
      assert.match(efficiency, /LTV:CAC 3x/);
      assert.match(efficiency, /T2D3/);
      assert.match(efficiency, /dead as the aim/);
      assert.doesNotMatch(efficiency, /Wiz-sized exit is a goal/i);
      assert.doesNotMatch(os, /startup-finance\.1984\.vc\/mcp/);
      assert.doesNotMatch(os, /1984 MCP is live/i);
    } finally {
      clearSession();
      rmrf(dataRoot);
    }
  });
});

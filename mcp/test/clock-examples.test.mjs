/**
 * OS 2.8.16 clock-examples — teaching page, not a live board.
 * One fictional household-jobs company. Do not Advance from an example.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DOC_FILES, DOC_KEYS, OS_VERSION } from "../dist/constants.js";
import { listOsDocs, readOsDoc } from "../dist/docs.js";
import { REPO_ROOT } from "./helpers.mjs";

const PAGE = path.join(REPO_ROOT, "company-os", "clock-examples.md");
const FIRST = path.join(REPO_ROOT, "company-os", "first-hour.md");
const OS = path.join(REPO_ROOT, "company-os", "operating-system.md");
const AI = path.join(REPO_ROOT, "company-os", "ai-instructions.md");
const BILL = path.join(REPO_ROOT, "docs", "install-bill.md");
const PLUGIN_README = path.join(REPO_ROOT, "plugin", "README.md");

function liveCompanyNeedles() {
  return ["tot" + "box", "Dye" + "Converter", "mic" + "dots", "Core" + "Haul", "z" + "k0"];
}

describe("OS 2.8.16 clock-examples (teaching 5×3)", () => {
  it("is indexed as a process doc, not a company", () => {
    assert.equal(OS_VERSION, "2.8.17");
    assert.ok(DOC_KEYS.includes("clock-examples"));
    assert.equal(DOC_FILES["clock-examples"], "company-os/clock-examples.md");
    const listed = listOsDocs();
    assert.ok(listed.some((d) => d.key === "clock-examples" && d.bytes > 50));
    assert.equal(readOsDoc("clock-examples"), fs.readFileSync(PAGE, "utf8"));
  });

  it("teaches household jobs only — banner, fifteen cells, locked path", () => {
    const page = fs.readFileSync(PAGE, "utf8");
    assert.match(page, /Teaching, not a live board/);
    assert.match(page, /household jobs/);
    assert.match(page, /parents who already pay a cleaner/);
    assert.match(page, /founder butler/);
    assert.match(page, /our house/);
    assert.match(page, /Write the bet/);
    assert.match(page, /Filter cheaply/);
    assert.match(page, /Ground it/);
    assert.match(page, /Build tiny slice/);
    assert.match(page, /Try with real people/);
    assert.match(page, /\*\*Do\.\*\*/);
    assert.match(page, /\*\*Do not\.\*\*/);
    assert.match(page, /\*\*Write back saves\.\*\*/);
    assert.equal((page.match(/\*\*Write back saves\.\*\*/g) || []).length, 15);
    assert.match(page, /Engineering green is not demand/);
    assert.match(page, /Do \*\*not\*\* reset to Write the bet \/ Ask/);
    assert.match(page, /operating-system\.md#end-to-end-path/);
    assert.match(page, /Write the bet Ask → Do → Write back → Filter Ask/);
    assert.match(page, /Grow pack stays closed unless observed use exists/);
    assert.match(page, /Bill may \*\*not\*\* Advance/);
    assert.doesNotMatch(page, /IESER|FIRAC/);
    assert.doesNotMatch(page, /Ask \/ Make \/ Check \/ Hear/);
    assert.doesNotMatch(page, /cell 1|Cell 1|cell #|fifteen weeks numbered/i);
    const lower = page.toLowerCase();
    for (const needle of liveCompanyNeedles()) {
      assert.ok(!lower.includes(needle.toLowerCase()), `teaching page must not name ${needle}`);
    }
    assert.doesNotMatch(page, /pirin\.ai/i);
  });

  it("DRY links only — first-hour stays one line; OS and AI do not copy the board", () => {
    const first = fs.readFileSync(FIRST, "utf8");
    const os = fs.readFileSync(OS, "utf8");
    const ai = fs.readFileSync(AI, "utf8");
    assert.match(first, /clock-examples/);
    assert.match(first, /Fifteen cells/);
    assert.match(first, /End-to-end path/);
    assert.doesNotMatch(first, /One-page thesis\. Not a landing page/);
    assert.doesNotMatch(first, /IESER|FIRAC/);
    const doneWhen = first.match(/## Done when[\s\S]*?(?=\n## After this hour)/);
    assert.ok(doneWhen);
    assert.doesNotMatch(doneWhen[0], /clock-examples|household jobs/);
    assert.match(os, /clock-examples\.md/);
    assert.match(os, /Do not copy those scenes onto a real company/);
    assert.match(os, /Do not Advance from an example/);
    assert.match(os, /\| 2\.8\.14 \|/);
    assert.match(os, /\| 2\.8\.15 \|/);
    assert.match(os, /\| 2\.8\.16 \|/);
    assert.match(os, /\*\*Version:\*\* 2\.8\.17/);
    assert.match(ai, /clock-examples\.md/);
    assert.match(ai, /Do not copy those scenes onto my board/);
    assert.match(ai, /Do not Advance from an example/);
  });

  it("Bill and plugin may quote, not rewrite a board", () => {
    const bill = fs.readFileSync(BILL, "utf8");
    const plugin = fs.readFileSync(PLUGIN_README, "utf8");
    assert.match(bill, /clock-examples/);
    assert.match(bill, /may not Advance, seed personas, or rewrite a mentee board/);
    assert.match(plugin, /clock-examples\.md/);
    assert.match(plugin, /do not copy onto a board or Advance from the story/);
  });
});

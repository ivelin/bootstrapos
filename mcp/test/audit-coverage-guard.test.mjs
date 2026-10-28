import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTED_GATED_TOOL_NAMES } from "../dist/constants.js";
import { MUTATING_TOOL_AUDIT, READ_ONLY_GATED_TOOLS } from "../dist/audit-catalog.js";

const snapshot = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "tools-list-snapshot.json"),
    "utf8",
  ),
);

describe("tools-list audit snapshot", () => {
  it("every gated tool is either read-only or mapped to one audit action", () => {
    for (const name of HOSTED_GATED_TOOL_NAMES) {
      const read = READ_ONLY_GATED_TOOLS.includes(name);
      const action = MUTATING_TOOL_AUDIT[name];
      assert.equal(read || Boolean(action), true, `${name} needs a read-only mark or an audit action`);
      assert.equal(read && Boolean(action), false, `${name} cannot be both`);
    }
  });

  it("the member tools/list snapshot covers every mutating tool except subscribe_board", () => {
    const names = snapshot.tools.map((tool) => tool.name);
    for (const name of Object.keys(MUTATING_TOOL_AUDIT)) {
      if (name === "subscribe_board") {
        assert.equal(names.includes(name), false);
      } else {
        assert.equal(names.includes(name), true, name);
      }
    }
  });
});

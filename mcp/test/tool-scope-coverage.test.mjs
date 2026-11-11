/**
 * Registry-wide: every registered tool must have a TOOL_SCOPE_TABLE entry.
 * Fictional fixtures only. Never prod.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBootstrapServer, listRegisteredToolNames } from "../dist/server.js";
import { HostedMembershipJourneyStore } from "../dist/hosted-journey-store.js";
import { setJourneyStoreForTests } from "../dist/journey.js";
import {
  MUTATING_TOOL_AUDIT,
  READ_ONLY_GATED_TOOLS,
} from "../dist/audit-catalog.js";
import {
  TOOL_SCOPE_TABLE,
  SCOPE_GATED_TOOL_NAMES,
  mutatingToolsMatchScopeGate,
  publicToolsStayUngated,
  readOnlyGatedStayUngated,
} from "../dist/tool-scopes.js";

afterEach(() => {
  setJourneyStoreForTests(undefined);
});

function allRegisteredToolNames() {
  setJourneyStoreForTests(new HostedMembershipJourneyStore(() => ["alpha"]));
  const hosted = createBootstrapServer("hosted-read", {
    whoami: {
      authenticated: true,
      email: "founder@example.test",
      labels: ["alpha"],
      role: "super_admin",
    },
    accessToken: "bos_scope_coverage_token_xx",
  });
  const full = createBootstrapServer("full");
  return new Set([...listRegisteredToolNames(hosted), ...listRegisteredToolNames(full)]);
}

describe("tool scope table coverage", () => {
  it("every registered tool has a TOOL_SCOPE_TABLE entry", () => {
    const registered = allRegisteredToolNames();
    const missing = [...registered].filter((name) => !TOOL_SCOPE_TABLE[name]);
    assert.deepEqual(missing, [], `missing scope table entries: ${missing.join(", ")}`);
  });

  it("every TOOL_SCOPE_TABLE key is registered on hosted-read or full", () => {
    const registered = allRegisteredToolNames();
    const orphan = Object.keys(TOOL_SCOPE_TABLE).filter((name) => !registered.has(name));
    assert.deepEqual(orphan, [], `orphan scope table keys: ${orphan.join(", ")}`);
  });

  it("scope-gated tools are exactly the mutating audit catalog", () => {
    assert.equal(mutatingToolsMatchScopeGate(), true);
    assert.deepEqual([...SCOPE_GATED_TOOL_NAMES].sort(), Object.keys(MUTATING_TOOL_AUDIT).sort());
  });

  it("public and read-only gated tools stay ungated for OAuth scope", () => {
    assert.equal(publicToolsStayUngated(), true);
    assert.equal(readOnlyGatedStayUngated(), true);
    for (const name of READ_ONLY_GATED_TOOLS) {
      assert.equal(TOOL_SCOPE_TABLE[name].requireBootstrapOsScope, false, name);
    }
  });
});

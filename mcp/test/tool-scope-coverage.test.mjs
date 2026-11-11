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
  HOSTED_GATED_TOOL_NAMES,
  HOSTED_READ_TOOL_NAMES,
} from "../dist/constants.js";
import {
  TOOL_SCOPE_TABLE,
  SCOPE_GATED_TOOL_NAMES,
  PUBLIC_TOOL_NAMES,
  LOCAL_TOOL_NAMES,
  authenticatedToolsMatchHostedGated,
  publicToolsMatchHostedRead,
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
      // Include pirin so conditionally registered check_breakers is present for coverage.
      labels: ["alpha", "pirin"],
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

  it("authenticated tools are exactly HOSTED_GATED_TOOL_NAMES", () => {
    assert.equal(authenticatedToolsMatchHostedGated(), true);
    assert.deepEqual([...SCOPE_GATED_TOOL_NAMES].sort(), [...HOSTED_GATED_TOOL_NAMES].sort());
  });

  it("public tools are exactly HOSTED_READ_TOOL_NAMES with kind public", () => {
    assert.equal(publicToolsMatchHostedRead(), true);
    assert.deepEqual([...PUBLIC_TOOL_NAMES].sort(), [...HOSTED_READ_TOOL_NAMES].sort());
    for (const name of PUBLIC_TOOL_NAMES) {
      assert.equal(TOOL_SCOPE_TABLE[name].kind, "public", name);
    }
  });

  it("local tools are full/stdio-only and never authenticated/public", () => {
    for (const name of LOCAL_TOOL_NAMES) {
      assert.equal(TOOL_SCOPE_TABLE[name].kind, "local", name);
      assert.equal(HOSTED_GATED_TOOL_NAMES.includes(name), false, name);
      assert.equal(HOSTED_READ_TOOL_NAMES.includes(name), false, name);
    }
  });
});

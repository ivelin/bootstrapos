/**
 * Deny-by-default per-tool OAuth scope table for the hosted MCP.
 * Every registered tool must have an entry. Missing entry → refuse at call time.
 * Aud/scope enforcement runs only when ACCEPT_SESSION_JWT=false.
 */
import { MUTATING_TOOL_AUDIT, READ_ONLY_GATED_TOOLS } from "./audit-catalog.js";
import { HOSTED_READ_TOOL_NAMES } from "./constants.js";
import { isJwtAccessToken, HOSTED_MCP_RESOURCE } from "./oauth.js";

/** OAuth scope required for Bootstrap OS write tools (issuer also advertises this). */
export const BOOTSTRAP_OS_SCOPE = "bootstrap-os";

/** Env flag. Default true = plain session JWTs still accepted (prod-safe at merge). */
export const ACCEPT_SESSION_JWT_ENV = "ACCEPT_SESSION_JWT";

export type ToolScopeEntry = {
  /** When true and ACCEPT_SESSION_JWT=false, Bearer must carry aud + bootstrap-os scope. */
  requireBootstrapOsScope: boolean;
};

/**
 * Canonical table. Keys are every tool name registerable on hosted-read or full.
 * Write (mutating) tools require bootstrap-os when the flag is off.
 * Read gated tools and public/full tools are listed but not scope-gated (choice: write-only gate).
 */
export const TOOL_SCOPE_TABLE: Readonly<Record<string, ToolScopeEntry>> = {
  // Public hosted-read OS tools
  bootstrap_os_info: { requireBootstrapOsScope: false },
  bootstrap_list_docs: { requireBootstrapOsScope: false },
  bootstrap_list_sops: { requireBootstrapOsScope: false },
  bootstrap_get_doc: { requireBootstrapOsScope: false },
  bootstrap_get_sop: { requireBootstrapOsScope: false },
  bootstrap_get_ai_instructions: { requireBootstrapOsScope: false },
  bootstrap_reference_clocks: { requireBootstrapOsScope: false },
  bootstrap_house_rule_pins: { requireBootstrapOsScope: false },
  bootstrap_support: { requireBootstrapOsScope: false },

  // Read-only gated (identity / journey) — not OAuth-scope gated
  bootstrap_whoami: { requireBootstrapOsScope: false },
  bootstrap_list_companies: { requireBootstrapOsScope: false },
  bootstrap_list_company_labels: { requireBootstrapOsScope: false },
  bootstrap_use_company: { requireBootstrapOsScope: false },
  get_journey: { requireBootstrapOsScope: false },
  bootstrap_where_are_we: { requireBootstrapOsScope: false },
  list_subscribers: { requireBootstrapOsScope: false },
  list_provenance: { requireBootstrapOsScope: false },
  list_feedback: { requireBootstrapOsScope: false },

  // Mutating / write tools — gated when ACCEPT_SESSION_JWT=false
  invite_member: { requireBootstrapOsScope: true },
  accept_invite: { requireBootstrapOsScope: true },
  create_company: { requireBootstrapOsScope: true },
  create_starter_board: { requireBootstrapOsScope: true },
  submit_feedback: { requireBootstrapOsScope: true },
  create_idea: { requireBootstrapOsScope: true },
  put_journey: { requireBootstrapOsScope: true },
  post_comment: { requireBootstrapOsScope: true },
  subscribe_board: { requireBootstrapOsScope: true },
  unsubscribe_board: { requireBootstrapOsScope: true },
  enable_board_watch: { requireBootstrapOsScope: true },
  put_portfolio_score: { requireBootstrapOsScope: true },

  // Full (stdio / self-host) surface — no hosted OAuth gate
  bootstrap_init_company: { requireBootstrapOsScope: false },
  bootstrap_get_state: { requireBootstrapOsScope: false },
  bootstrap_update_state: { requireBootstrapOsScope: false },
  bootstrap_log_decision: { requireBootstrapOsScope: false },
  bootstrap_next_evidence: { requireBootstrapOsScope: false },
  bootstrap_ready_checklist: { requireBootstrapOsScope: false },
  bootstrap_refuse_external_ask_if_not_green: { requireBootstrapOsScope: false },
  bootstrap_set_ready_for_human_eyes: { requireBootstrapOsScope: false },
  bootstrap_agent_focus: { requireBootstrapOsScope: false },
};

export const SCOPE_GATED_TOOL_NAMES = Object.entries(TOOL_SCOPE_TABLE)
  .filter(([, entry]) => entry.requireBootstrapOsScope)
  .map(([name]) => name)
  .sort() as readonly string[];

export function acceptSessionJwt(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[ACCEPT_SESSION_JWT_ENV];
  if (raw === undefined || raw === "") return true;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return true;
}

export function toolScopeEntry(name: string): ToolScopeEntry | undefined {
  return TOOL_SCOPE_TABLE[name];
}

export function isScopeGatedToolName(name: string | undefined): boolean {
  return Boolean(name && TOOL_SCOPE_TABLE[name]?.requireBootstrapOsScope);
}

function claimStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  }
  return [];
}

export function accessTokenHasBootstrapOsAudience(token: string): boolean {
  if (!isJwtAccessToken(token)) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      aud?: unknown;
    };
    return claimStrings(payload.aud).includes(HOSTED_MCP_RESOURCE);
  } catch {
    return false;
  }
}

export function accessTokenHasBootstrapOsScope(token: string): boolean {
  if (!isJwtAccessToken(token)) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      scope?: unknown;
      scp?: unknown;
    };
    const scopes = [...claimStrings(payload.scope), ...claimStrings(payload.scp)];
    return scopes.includes(BOOTSTRAP_OS_SCOPE);
  } catch {
    return false;
  }
}

export function accessTokenSatisfiesBootstrapOsGate(token: string | undefined): boolean {
  if (!token) return false;
  return accessTokenHasBootstrapOsAudience(token) && accessTokenHasBootstrapOsScope(token);
}

/**
 * OAuth aud/scope check for tools that have a table entry.
 * Unknown names are left to MCP "not found"; registered-without-entry is a
 * separate check against the live registry (see registeredToolMissingScopeEntry).
 */
export function toolScopeCallRefusal(
  toolName: string | undefined,
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): "insufficient_scope" | null {
  if (!toolName) return null;
  const entry = toolScopeEntry(toolName);
  if (!entry) return null;
  if (!entry.requireBootstrapOsScope) return null;
  if (acceptSessionJwt(env)) return null;
  if (accessTokenSatisfiesBootstrapOsGate(token)) return null;
  return "insufficient_scope";
}

/** Deny-by-default: a registered tool with no TOOL_SCOPE_TABLE row is refused. */
export function registeredToolMissingScopeEntry(
  registeredNames: readonly string[],
  toolName: string | undefined,
): boolean {
  return Boolean(toolName && registeredNames.includes(toolName) && !toolScopeEntry(toolName));
}

/** Sanity: mutating audit catalog tools are exactly the scope-gated set. */
export function mutatingToolsMatchScopeGate(): boolean {
  const mutating = Object.keys(MUTATING_TOOL_AUDIT).sort();
  const gated = [...SCOPE_GATED_TOOL_NAMES].sort();
  return mutating.length === gated.length && mutating.every((name, i) => name === gated[i]);
}

/** Public read tool names must stay ungated in the table. */
export function publicToolsStayUngated(): boolean {
  return HOSTED_READ_TOOL_NAMES.every((name) => TOOL_SCOPE_TABLE[name]?.requireBootstrapOsScope === false);
}

/** Read-only gated tools stay ungated for OAuth scope (write-only choice). */
export function readOnlyGatedStayUngated(): boolean {
  return READ_ONLY_GATED_TOOLS.every((name) => TOOL_SCOPE_TABLE[name]?.requireBootstrapOsScope === false);
}

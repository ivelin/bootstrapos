/**
 * Deny-by-default per-tool OAuth scope table for the hosted MCP.
 * Every registered tool must have an entry. Missing entry → refuse at call time.
 * Aud/scope enforcement runs only when ACCEPT_SESSION_JWT=false.
 */
import {
  HOSTED_GATED_TOOL_NAMES,
  HOSTED_READ_TOOL_NAMES,
} from "./constants.js";
import { accessTokenExpired } from "./journey-auth.js";
import { isJwtAccessToken, HOSTED_MCP_RESOURCE } from "./oauth.js";

/** OAuth scope required for authenticated Bootstrap OS tools (issuer also advertises this). */
export const BOOTSTRAP_OS_SCOPE = "bootstrap-os";

/** Env flag. Default true = plain session JWTs still accepted (prod-safe at merge). */
export const ACCEPT_SESSION_JWT_ENV = "ACCEPT_SESSION_JWT";

/**
 * - public: hosted tools that need no auth today (exempt from aud/scope).
 * - authenticated: hosted tools that need auth today (aud + bootstrap-os when flag false).
 * - local: full/stdio-only tools (not on the hosted OAuth surface).
 */
export type ToolScopeKind = "public" | "authenticated" | "local";

export type ToolScopeEntry = {
  kind: ToolScopeKind;
};

/**
 * Canonical table. Keys are every tool name registerable on hosted-read or full.
 * Authenticated tools require bootstrap-os when ACCEPT_SESSION_JWT=false.
 */
export const TOOL_SCOPE_TABLE: Readonly<Record<string, ToolScopeEntry>> = {
  // Public hosted-read OS tools (no auth today)
  bootstrap_os_info: { kind: "public" },
  bootstrap_list_docs: { kind: "public" },
  bootstrap_list_sops: { kind: "public" },
  bootstrap_get_doc: { kind: "public" },
  bootstrap_get_sop: { kind: "public" },
  bootstrap_get_ai_instructions: { kind: "public" },
  bootstrap_reference_clocks: { kind: "public" },
  bootstrap_house_rule_pins: { kind: "public" },
  bootstrap_support: { kind: "public" },

  // Authenticated hosted tools (reads + writes) — gated when ACCEPT_SESSION_JWT=false
  bootstrap_whoami: { kind: "authenticated" },
  bootstrap_list_companies: { kind: "authenticated" },
  bootstrap_list_company_labels: { kind: "authenticated" },
  bootstrap_use_company: { kind: "authenticated" },
  invite_member: { kind: "authenticated" },
  accept_invite: { kind: "authenticated" },
  create_company: { kind: "authenticated" },
  create_starter_board: { kind: "authenticated" },
  submit_feedback: { kind: "authenticated" },
  list_feedback: { kind: "authenticated" },
  get_journey: { kind: "authenticated" },
  bootstrap_where_are_we: { kind: "authenticated" },
  create_idea: { kind: "authenticated" },
  put_journey: { kind: "authenticated" },
  post_comment: { kind: "authenticated" },
  subscribe_board: { kind: "authenticated" },
  unsubscribe_board: { kind: "authenticated" },
  list_subscribers: { kind: "authenticated" },
  enable_board_watch: { kind: "authenticated" },
  list_provenance: { kind: "authenticated" },
  put_portfolio_score: { kind: "authenticated" },

  // Full (stdio / self-host) surface only — outside hosted OAuth
  bootstrap_init_company: { kind: "local" },
  bootstrap_get_state: { kind: "local" },
  bootstrap_update_state: { kind: "local" },
  bootstrap_log_decision: { kind: "local" },
  bootstrap_next_evidence: { kind: "local" },
  bootstrap_ready_checklist: { kind: "local" },
  bootstrap_refuse_external_ask_if_not_green: { kind: "local" },
  bootstrap_set_ready_for_human_eyes: { kind: "local" },
  bootstrap_agent_focus: { kind: "local" },
};

export const PUBLIC_TOOL_NAMES = Object.entries(TOOL_SCOPE_TABLE)
  .filter(([, entry]) => entry.kind === "public")
  .map(([name]) => name)
  .sort() as readonly string[];

export const SCOPE_GATED_TOOL_NAMES = Object.entries(TOOL_SCOPE_TABLE)
  .filter(([, entry]) => entry.kind === "authenticated")
  .map(([name]) => name)
  .sort() as readonly string[];

export const LOCAL_TOOL_NAMES = Object.entries(TOOL_SCOPE_TABLE)
  .filter(([, entry]) => entry.kind === "local")
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
  return Boolean(name && TOOL_SCOPE_TABLE[name]?.kind === "authenticated");
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
 * OAuth aud/scope check for authenticated tools.
 * Missing / non-JWT / expired tokens return null so the caller keeps today's 401
 * path (RFC 6750). Call only after the token has verified.
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
  if (!entry || entry.kind !== "authenticated") return null;
  if (acceptSessionJwt(env)) return null;
  if (!token || !isJwtAccessToken(token) || accessTokenExpired(token)) return null;
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

/** Authenticated table rows are exactly today's hosted gated tools. */
export function authenticatedToolsMatchHostedGated(): boolean {
  const hosted = [...HOSTED_GATED_TOOL_NAMES].sort();
  const gated = [...SCOPE_GATED_TOOL_NAMES].sort();
  return hosted.length === gated.length && hosted.every((name, i) => name === gated[i]);
}

/** Public table rows are exactly today's no-auth hosted OS tools. */
export function publicToolsMatchHostedRead(): boolean {
  const hosted = [...HOSTED_READ_TOOL_NAMES].sort();
  const pub = [...PUBLIC_TOOL_NAMES].sort();
  return hosted.length === pub.length && hosted.every((name, i) => name === pub[i]);
}

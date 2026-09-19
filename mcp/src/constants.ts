/** Portable journey + loop labels (aligned to company-os v2.8.14). */

export const OS_VERSION = "2.8.14";
export const MCP_VERSION = "0.3.5";

/** Published constitution. Hosted read adapter fetches from here; do not embed copies. */
export const PUBLISHED_REPO = "https://github.com/ivelin/bootstrap";
export const PUBLISHED_BLOB_BASE = `${PUBLISHED_REPO}/blob/main`;
export const PUBLISHED_RAW_BASE = "https://raw.githubusercontent.com/ivelin/bootstrap/main";

export const HOSTED_READ_TOOL_NAMES = [
  "bootstrap_os_info",
  "bootstrap_list_docs",
  "bootstrap_get_doc",
  "bootstrap_get_ai_instructions",
  "bootstrap_reference_clocks",
  "bootstrap_house_rule_pins",
  "bootstrap_support",
] as const;

/** Resource-server gated identity. Unauthenticated calls return HTTP 401 + WWW-Authenticate. */
export const HOSTED_GATED_IDENTITY_TOOL_NAMES = [
  "bootstrap_whoami",
  "bootstrap_list_companies",
  "bootstrap_list_company_labels",
  "bootstrap_use_company",
  "invite_member",
  "accept_invite",
] as const;

/**
 * Valid JWT required; allowlist is not. Invitee accepts before they have a mentee row.
 * Other identity tools stay allowlist-gated.
 */
export const HOSTED_PRE_ALLOWLIST_TOOL_NAMES = ["accept_invite"] as const;

/** Shared 0-1 board. Listed only when a journey store is attached. */
export const HOSTED_GATED_JOURNEY_TOOL_NAMES = [
  "get_journey",
  "bootstrap_where_are_we",
  "create_idea",
  "put_journey",
  "post_comment",
  "subscribe_board",
  "unsubscribe_board",
  "list_subscribers",
  "enable_board_watch",
  "list_provenance",
  "put_portfolio_score",
] as const;

/** Resource-server gated tools. Unauthenticated calls return HTTP 401 + WWW-Authenticate. */
export const HOSTED_GATED_TOOL_NAMES = [
  ...HOSTED_GATED_IDENTITY_TOOL_NAMES,
  ...HOSTED_GATED_JOURNEY_TOOL_NAMES,
] as const;

export function isHostedGatedToolName(name: string | undefined): boolean {
  return Boolean(name && (HOSTED_GATED_TOOL_NAMES as readonly string[]).includes(name));
}

export function isHostedGatedJourneyToolName(name: string | undefined): boolean {
  return Boolean(
    name && (HOSTED_GATED_JOURNEY_TOOL_NAMES as readonly string[]).includes(name),
  );
}

export function isHostedPreAllowlistToolName(name: string | undefined): boolean {
  return Boolean(
    name && (HOSTED_PRE_ALLOWLIST_TOOL_NAMES as readonly string[]).includes(name),
  );
}

export const PATH4_HONESTY =
  "Preview only. plugin/ + HTTP read adapter exist. Invite-only collab pin https://mcp.bootstrap.pirin.ai/mcp: handshake + gated whoami/labels 401 + WWW-Authenticate (authorization_servers = pirin.ai login; not a login UI here). Free docs are GitHub + install-os + local — not a hosted MCP connector. bootstrap-os-mcp.vercel.app is the same 401, not a silent 200 alias, not a pin, not mentee-ready boards. No public catalog submit (team Import from Repo only). Not pirin.ai. No founder company-state on a shared server. Path 1 stays the front door.";

export const JOURNEY_PHASES: Record<number, string> = {
  1: "Thesis",
  2: "Success definitions",
  3: "Synthetic research",
  4: "Real-world research",
  5: "Design tiny system",
  6: "Build tiny slice",
  7: "Real / realistic users",
  8: "Learn and improve",
  9: "Grow",
};

export const LOOP_STAGES: Record<number, string> = {
  1: "Synthetic user research",
  2: "Validation / concept testing",
  3: "Product building",
  4: "Testing (synthetic + automated)",
  5: "Evaluation",
  6: "Real user feedback ingestion",
  7: "Memory update and loop back",
};

export const DOC_KEYS = [
  "operating-system",
  "live-runtime",
  "ready-for-human-eyes",
  "ai-instructions",
  "first-hour",
  "after-proof-efficiency",
] as const;

export type DocKey = (typeof DOC_KEYS)[number];

export const DOC_FILES: Record<DocKey, string> = {
  "operating-system": "company-os/operating-system.md",
  "live-runtime": "company-os/live-runtime.md",
  "ready-for-human-eyes": "company-os/ready-for-human-eyes.md",
  "ai-instructions": "company-os/ai-instructions.md",
  "first-hour": "company-os/first-hour.md",
  "after-proof-efficiency": "company-os/after-proof-efficiency.md",
};

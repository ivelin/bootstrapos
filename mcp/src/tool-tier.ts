/**
 * Static tool tiers. One map. No new role, scope, or OAuth change.
 * low = read. medium = write on a company this login already has. high = admin.
 * create_company is high: only a live super_admin can create one today
 * (MemoryCompanyAdminStore and bootstrap_os_create_company). Invite, first-hour,
 * and Bill add a person to a company that already exists.
 */
export type ToolTier = "low" | "medium" | "high";
export const HIGH_TIER_TOOL_NAMES = [
  "create_company",
  "grant_super_admin",
  "revoke_super_admin",
] as const;
const MEDIUM_TIER_TOOL_NAMES = [
  "bootstrap_use_company",
  "invite_member",
  "accept_invite",
  "submit_feedback",
  "create_idea",
  "put_journey",
  "post_comment",
  "subscribe_board",
  "unsubscribe_board",
  "enable_board_watch",
  "put_portfolio_score",
] as const;
const HIGH = new Set<string>(HIGH_TIER_TOOL_NAMES);
const MEDIUM = new Set<string>(MEDIUM_TIER_TOOL_NAMES);
export function toolTier(name: string): ToolTier {
  if (HIGH.has(name)) return "high";
  if (MEDIUM.has(name)) return "medium";
  return "low";
}
/** member, unset, and mentor see the member list. super_admin sees every tool. */
export function hidesHighTierTools(role: string | undefined, authenticated: boolean): boolean {
  if (!authenticated) return false;
  return role !== "super_admin";
}
export function filterToolsForRole<T extends { name: string }>(
  tools: T[],
  role: string | undefined,
  authenticated: boolean,
): T[] {
  if (!hidesHighTierTools(role, authenticated)) return tools;
  return tools.filter((tool) => toolTier(tool.name) !== "high");
}
/** Drop high-tier tools from a tools/list JSON-RPC body. Leave other bodies alone. */
export function filterToolsListJson(
  raw: string,
  role: string | undefined,
  authenticated: boolean,
): string | null {
  if (!hidesHighTierTools(role, authenticated)) return null;
  let body: { result?: { tools?: Array<{ name: string }> } };
  try {
    body = JSON.parse(raw) as { result?: { tools?: Array<{ name: string }> } };
  } catch {
    return null;
  }
  const tools = body.result?.tools;
  if (!Array.isArray(tools)) return null;
  body.result!.tools = filterToolsForRole(tools, role, authenticated);
  return JSON.stringify(body);
}

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
/** Only a signed-in super_admin sees admin tools. Anonymous, member, unset, and mentor do not. */
export function hidesHighTierTools(role: string | undefined, authenticated: boolean): boolean {
  return !(authenticated && role === "super_admin");
}
export function filterToolsForRole<T extends { name: string }>(
  tools: T[],
  role: string | undefined,
  authenticated: boolean,
): T[] {
  if (!hidesHighTierTools(role, authenticated)) return tools;
  return tools.filter((tool) => toolTier(tool.name) !== "high");
}
function rewriteListedTools(row: unknown, role: string | undefined, authenticated: boolean): boolean {
  if (!row || typeof row !== "object") return false;
  const tools = (row as { result?: { tools?: Array<{ name: string }> } }).result?.tools;
  if (!Array.isArray(tools)) return false;
  const kept = filterToolsForRole(tools, role, authenticated);
  if (kept.length === tools.length) return false;
  (row as { result: { tools: Array<{ name: string }> } }).result.tools = kept;
  return true;
}
/** Drop high-tier tools from a tools/list body, including a JSON-RPC batch. Leave other bodies alone. */
export function filterToolsListJson(
  raw: string,
  role: string | undefined,
  authenticated: boolean,
): string | null {
  if (!hidesHighTierTools(role, authenticated)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const changed = rows.some((row) => rewriteListedTools(row, role, authenticated));
  if (!changed) return null;
  return JSON.stringify(Array.isArray(parsed) ? rows : rows[0]);
}

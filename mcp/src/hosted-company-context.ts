/**
 * In-memory active company for one hosted MCP session (AppFolio/QBO switcher).
 * Keyed by MCP-Session-Id, else token hash. Not persisted. Not Path 3 state.
 */
import { createHash } from "node:crypto";

const activeCompanyByKey = new Map<string, string>();

export function hostedSessionKey(req: Request | undefined, accessToken: string | undefined): string {
  const sid =
    req?.headers.get("mcp-session-id") ||
    req?.headers.get("Mcp-Session-Id") ||
    req?.headers.get("MCP-Session-Id");
  if (sid && sid.trim()) return `s:${sid.trim()}`;
  if (accessToken) {
    const hash = createHash("sha256").update(accessToken, "utf8").digest("hex").slice(0, 32);
    return `t:${hash}`;
  }
  return "anon";
}

export function getActiveCompany(sessionKey: string): string | undefined {
  return activeCompanyByKey.get(sessionKey);
}

export function setActiveCompany(sessionKey: string, company: string): void {
  activeCompanyByKey.set(sessionKey, company);
}

export function clearHostedCompanyContextForTests(): void {
  activeCompanyByKey.clear();
}

export function resolveCompanyArg(opts: {
  company?: string;
  companyId?: string;
  companyLabel?: string;
  sessionKey: string;
}): string | undefined {
  const named = opts.company?.trim() || opts.companyId?.trim() || opts.companyLabel?.trim();
  if (named) return named;
  return getActiveCompany(opts.sessionKey);
}

export type CompanyChoice =
  | { kind: "chosen"; company: string }
  | { kind: "list"; companies: string[] }
  | { kind: "none" };

/**
 * Membership comes from the caller (a fresh store read). This map only remembers
 * which company the chat already picked. A company that is no longer in `labels`
 * is not reused.
 */
export function chooseCompany(opts: {
  company?: string;
  companyId?: string;
  companyLabel?: string;
  sessionKey: string;
  labels: readonly string[];
}): CompanyChoice {
  const named = opts.company?.trim() || opts.companyId?.trim() || opts.companyLabel?.trim();
  if (named) return { kind: "chosen", company: named };
  const labels = [...new Set(opts.labels.map((label) => label.trim()).filter(Boolean))].sort();
  const active = getActiveCompany(opts.sessionKey);
  if (active && labels.includes(active)) return { kind: "chosen", company: active };
  if (labels.length === 1) return { kind: "chosen", company: labels[0] };
  if (labels.length > 1) return { kind: "list", companies: labels };
  return { kind: "none" };
}

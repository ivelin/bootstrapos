export const HOSTED_DAILY_CAPS = {
  invite_member: { limit: 20, windowMs: 86_400_000 },
  create_company: { limit: 5, windowMs: 86_400_000 },
  create_idea: { limit: 50, windowMs: 86_400_000 },
} as const;

export const COMMENT_BODY_MAX_BYTES = 4096;
export const PROVENANCE_PAGE_MAX = 100;
export const COMMENT_TOO_LONG_MESSAGE = "Comment is longer than 4 KB.";

const LIMITER_UNAVAILABLE_MESSAGE = "The limiter could not be reached. This action was refused.";
const LIMIT_LATER_MESSAGE = "Limit reached. Try again later.";

const REFUSAL_CODES = new Set(["rate_limited", "rate_limiter_unavailable", "comment_too_long"]);

export function hostedActorKey(actor: {
  sub?: string;
  email?: string;
  principal?: string;
}): string {
  const sub = actor.sub?.trim() ?? "";
  if (sub) return sub.toLowerCase();
  const email = actor.email?.trim() ?? "";
  if (email) return email.toLowerCase();
  const principal = actor.principal?.trim() ?? "";
  return principal.toLowerCase();
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recognizedCode(raw: Record<string, unknown>): string | null {
  if (typeof raw.error === "string" && REFUSAL_CODES.has(raw.error)) return raw.error;
  if (typeof raw.reason === "string" && REFUSAL_CODES.has(raw.reason)) return raw.reason;
  return null;
}

function usableMessage(message: unknown): string | null {
  if (typeof message !== "string") return null;
  if (message.length === 0 || message.length >= 200) return null;
  if (message.includes("journey_rpc_failed")) return null;
  return message;
}

function stockSentence(code: string, raw: Record<string, unknown>): string {
  if (code === "comment_too_long") return COMMENT_TOO_LONG_MESSAGE;
  if (code === "rate_limiter_unavailable") return LIMITER_UNAVAILABLE_MESSAGE;
  const retryAt = typeof raw.retryAt === "string" && raw.retryAt ? raw.retryAt : "";
  if (!retryAt) return LIMIT_LATER_MESSAGE;
  const action = typeof raw.action === "string" ? raw.action : "";
  if (action) return `Limit reached for ${action}. Try again after ${retryAt}.`;
  return `Limit reached. Try again after ${retryAt}.`;
}

export function refusalMessage(raw: unknown): string | null {
  const body = asRecord(raw);
  if (!body || body.ok === true) return null;
  if (body.ok !== false) return LIMITER_UNAVAILABLE_MESSAGE;
  const code = recognizedCode(body);
  if (!code) return null;
  return usableMessage(body.message) ?? stockSentence(code, body);
}

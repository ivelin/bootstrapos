/**
 * Founder-facing words for the board card.
 * One list. The card, the banned-word check, and the tests all read it.
 * Kind enums stay in stored data. This module only rewrites speech.
 */

export const PLAIN_WORD_REWRITES: Array<[RegExp, string]> = [
  [/fi\.co\/fast/gi, "advisor agreement"],
  [/\bP0\b/g, ""],
  [/\bFAST\b/g, "advisor agreement"],
  [/\bSOPA\b/gi, "stock option paperwork"],
  [/\bSAFE\b/g, "investment"],
  [/\bengagements\b/gi, "conversations"],
  [/\bengagement\b/gi, "a conversation"],
  [/\bcustomer bets\b/gi, "tries with buyers"],
  [/\bcustomer bet\b/gi, "a try with buyers"],
  [/\bcustomer checks?\b/gi, "a try with buyers"],
  [/\bBottleneck #1\b/gi, "the main bet"],
  [/\bSKUs\b/gi, "products"],
  [/\bSKU\b/gi, "product"],
  [/\btenancy\b/gi, "the paid plan"],
  [/83\s*\(b\)/gi, "the tax filing"],
  [/\bFI\b/g, "the founder program"],
  [/\bSOSV\b/g, "an investor"],
  [/\bIABC\b/g, "a trade group"],
  [/\bSMSes\b/gi, "text messages"],
  [/\bSMS\b/gi, "a text message"],
  [/\bMVPs\b/gi, "first versions"],
  [/\bMVP\b/gi, "a first version"],
  [/docusign/gi, "the signature page"],
  [/\bgates\b/gi, "decisions"],
  [/\bgate\b/gi, "decision"],
  [/\bphases\b/gi, "stages"],
  [/\bphase\b/gi, "stage"],
  [/\bhosts\b/gi, "services"],
  [/\bhost\b/gi, "service"],
  [/\bholdouts\b/gi, "groups left out"],
  [/\bholdout\b/gi, "a group left out"],
  [/\bCos\b/g, "the helper"],
];

export const BANNED_ON_CARD: RegExp[] = [
  /\bP0\b/,
  /\bFAST\b/,
  /\bSOPA\b/i,
  /\bSAFE\b/,
  /\bengagements?\b/i,
  /\bcustomer bets?\b/i,
  /\bcustomer_check\b/,
  /\bNDAs?\b/i,
  /\bjourney phase \d/i,
  /\bloop stage\b/i,
  /\bwipLimit\b/,
  /\bmermaid\b/i,
  /\bSKUs?\b/i,
  /\btenancy\b/i,
  /83\s*\(b\)/i,
  /\bFI\b/,
  /fi\.co\/fast/i,
  /\bSOSV\b/,
  /\bIABC\b/,
  /\bSMS\b/i,
  /\bMVPs?\b/i,
  /docusign/i,
  /\bgates?\b/i,
  /\bphases?\b/i,
  /\bhosts?\b/i,
  /\bholdouts?\b/i,
  /\bCos\b/,
  /\bBottleneck #1\b/i,
];

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function applyPlainWords(text: string): string {
  const emails: string[] = [];
  let masked = text.replace(EMAIL, (token) => {
    const mark = `\u0000${emails.length}\u0000`;
    emails.push(token);
    return mark;
  });
  for (const [rule, to] of PLAIN_WORD_REWRITES) masked = masked.replace(rule, to);
  masked = masked.replace(/\b(?:the|an?)\s+(?=(?:the|an?)\b)/gi, "");
  emails.forEach((email, index) => {
    masked = masked.replace(`\u0000${index}\u0000`, email);
  });
  return masked;
}

export function bannedCardHit(text: string): string | null {
  for (const rule of BANNED_ON_CARD) {
    const hit = String(text ?? "").match(rule);
    if (hit) return hit[0];
  }
  return null;
}

const TESTER_LOGIN = /^tester\d+(?:@|$)/i;

/** A stored login is not a name. Mixed case or a space is a display name. */
export function isLowercaseLogin(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  if (TESTER_LOGIN.test(text)) return true;
  if (text.includes("@")) return true;
  if (/[A-Z]/.test(text) || /\s/.test(text)) return false;
  return true;
}

export function displayNameFrom(row: unknown): string | null {
  if (!row) return null;
  if (typeof row === "string") return isLowercaseLogin(row) ? null : row.trim();
  if (typeof row !== "object") return null;
  const rec = row as { displayName?: unknown; display_name?: unknown; principal?: unknown };
  const explicit =
    typeof rec.displayName === "string"
      ? rec.displayName
      : typeof rec.display_name === "string"
        ? rec.display_name
        : "";
  if (explicit.trim() && !isLowercaseLogin(explicit)) return explicit.trim();
  const principal = typeof rec.principal === "string" ? rec.principal.trim() : "";
  if (!principal || isLowercaseLogin(principal)) return null;
  return principal;
}

export function isInternalNote(text: string): boolean {
  return /do not invent(?: a bet)?/i.test(text);
}

export function isKillCondition(text: string): boolean {
  const trimmed = text.trim();
  return /^(?:stop|kill) if\b/i.test(trimmed) || /^pay or use$/i.test(trimmed);
}

/** Strings the card may show. Enums, ids, and logins stay raw. */
export const REDACT_KEEP_KEYS = new Set([
  "kind",
  "id",
  "status",
  "outcome",
  "impact",
  "evidence",
  "role",
  "principalKind",
  "principal",
  "email",
  "slug",
  "via",
  "action",
  "schema_version",
  "ok",
  "type",
  "identityStore",
  "grant",
  "bottleneckId",
  "companyId",
  "ideaId",
  "parentId",
  "at",
  "scoredAt",
  "authenticated",
  "error",
  "currentGate",
  "journeyPhase",
  "loopStage",
  "wipLimit",
  "stage",
  "gate",
  "client",
  "sub",
  "resource",
  "who",
]);

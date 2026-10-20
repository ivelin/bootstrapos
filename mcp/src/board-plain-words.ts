/**
 * Founder-facing words for the board card.
 * One list. The card, the banned-word check, and the tests all read it.
 * Kind enums stay in stored data. This module only rewrites speech.
 */

/**
 * OS vocabulary only. One company's words do not belong in this table.
 * host, gate, phase, and FI rewrite only as OS labels.
 * "hosts a dinner" stays. "FI/Mo" stays. "this phase" stays.
 */
export const PLAIN_WORD_REWRITES: Array<[RegExp, string]> = [
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
  [/(?<![\w/])FI(?![\w/])/g, "the founder program"],
  [/\bSMSes\b/gi, "text messages"],
  [/\bSMS\b/gi, "a text message"],
  [/\bMVPs\b/gi, "first versions"],
  [/\bMVP\b/gi, "a first version"],
  [/docusign/gi, "the signature page"],
  [/\b((?:the|this|current|a)\s+)gates\b/gi, "$1decisions"],
  [/\b((?:the|this|current|a)\s+)gate\b/gi, "$1decision"],
  [/\bjourney\s+phases\b/gi, "journey stages"],
  [/\bjourney\s+phase\b/gi, "journey stage"],
  [/\bPhase\b/g, "stage"],
  [/\bHost\b/g, "service"],
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
  /(?<![\w/])FI(?![\w/])/,
  /\bSMS\b/i,
  /\bMVPs?\b/i,
  /docusign/i,
  /\b(?:the|this|current|a)\s+gates?\b/i,
  /\bjourney\s+phases?\b/i,
  /\bPhase\b/,
  /\bHost\b/,
  /\bholdouts?\b/i,
  /\bCos\b/,
  /\bBottleneck #1\b/i,
];

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Replace addresses and live or test secret tokens. Call after plain-word rewrite. */
export function maskSecrets(value: string): string {
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]");
}

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

/** Primitives copied unchanged. Enums and ids. Prose keys are not in this set. */
export const REDACT_RAW_KEYS = new Set([
  "kind",
  "id",
  "status",
  "outcome",
  "impact",
  "evidence",
  "role",
  "principalKind",
  "slug",
  "via",
  "action",
  "op",
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
  "currentGate",
  "journeyPhase",
  "loopStage",
  "wipLimit",
  "client",
  "commentId",
  "comment_id",
  "controlPlaneOrder",
  "current_gate",
  "event",
  "journey_phase",
  "loop_stage",
  "principal_kind",
  "source",
  "sub",
  "resource",
  "formula",
  "ownerSource",
  "prefer",
]);

/** The email field keeps the address. who and principal are masked in the walker. */
export const REDACT_MASK_KEYS = new Set(["email", "principal", "who"]);

/**
 * Keys the spoken payload may contain. Anything else is dropped at every depth.
 * This is the journey shape, not a list of strings to skip.
 */
export const REDACT_ALLOW_KEYS = new Set([
  ...REDACT_RAW_KEYS,
  ...REDACT_MASK_KEYS,
  "account",
  "acl",
  "actionableInsights",
  "after",
  "allowPaperBottleneck",
  "applies",
  "asOf",
  "audit",
  "auditVia",
  "autonomyPosture",
  "before",
  "body",
  "bottleneck",
  "boards",
  "card",
  "challenges",
  "clock",
  "clocks",
  "comments",
  "commentsNeverAdvance",
  "company",
  "constraint_this_week",
  "constraintChallenge",
  "constraintThisWeek",
  "costs",
  "costsUnknown",
  "createdBy",
  "customerChecks",
  "customerConversations",
  "days",
  "digest",
  "displayName",
  "display_name",
  "emailOptIn",
  "emailQueued",
  "engagements",
  "error",
  "evidenceLinks",
  "footer",
  "founderWrittenDecision",
  "gate",
  "gateEnrichment",
  "helpNeeded",
  "hypothesis",
  "idea",
  "ideas",
  "initiatives",
  "inventStage",
  "journeySpoken",
  "killLine",
  "killPostmortem",
  "killed",
  "killedCard",
  "killedDecision",
  "label",
  "last",
  "lastAction",
  "lastObservedFact",
  "lastTransitions",
  "lessonsLearned",
  "leverage",
  "loopSpoken",
  "markdown",
  "measure",
  "meetingDoc",
  "name",
  "next",
  "nextAction",
  "note",
  "notify",
  "openQuestions",
  "owners",
  "pnl",
  "poll",
  "portfolio",
  "portfolioScore",
  "portfolioSkip",
  "premise",
  "primary",
  "progress",
  "ranked",
  "readyForHumanEyes",
  "reason",
  "revenue",
  "scoreboard",
  "scoredBy",
  "skipped",
  "snapshot",
  "spoken",
  "spokenLead",
  "summary",
  "stage",
  "state",
  "supporting",
  "talkedToCustomers",
  "total",
  "unscored",
  "visualFlow",
  "warn",
  "webhook",
  "whatChanged",
  "whatWereNotDoing",
  "why",
]);

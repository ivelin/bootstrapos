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

function linkPattern(): RegExp {
  return /(?:https?:\/\/|www\.)[^\s)]+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\/[^\s)]*/gi;
}

function holdTokens(text: string, pattern: RegExp, mark: string, store: string[]): string {
  pattern.lastIndex = 0;
  return text.replace(pattern, (token) => {
    const tokenMark = `${mark}${store.length}${mark}`;
    store.push(token);
    return tokenMark;
  });
}

function restoreTokens(text: string, mark: string, store: string[]): string {
  let out = text;
  store.forEach((token, index) => {
    out = out.replaceAll(`${mark}${index}${mark}`, token);
  });
  return out;
}

/** Links stay literal. A banned word inside a URL is not card speech. */
function maskLinks(text: string, store: string[]): string {
  return holdTokens(text, linkPattern(), "\u0001", store);
}

type WordSegment = { text: string; frozen: boolean };

function globalRule(rule: RegExp): RegExp {
  return new RegExp(rule.source, rule.flags);
}

function fillTemplate(template: string, match: RegExpMatchArray): string {
  return template.replace(/\$(\d)/g, (_all, n: string) => match[Number(n)] ?? "");
}

/**
 * One pass per rule. Inserted text is frozen, so a gloss is never rewritten again.
 * A term glued on with / . or - is dropped instead of glossed.
 * "paid " + "the paid plan" stays "the paid plan".
 */
function rewriteTerms(input: string): string {
  let segments: WordSegment[] = [{ text: input, frozen: false }];
  for (const [rule, to] of PLAIN_WORD_REWRITES) {
    const next: WordSegment[] = [];
    for (const seg of segments) {
      if (seg.frozen || !seg.text) {
        next.push(seg);
        continue;
      }
      const re = globalRule(rule);
      let last = 0;
      let matched = false;
      for (const hit of seg.text.matchAll(re)) {
        matched = true;
        const index = hit.index ?? 0;
        const before = seg.text.slice(last, index);
        const prev = index > 0 ? seg.text[index - 1] : "";
        if (prev === "/" || prev === "." || prev === "-") {
          const trimmed = before.slice(0, -1);
          if (trimmed) next.push({ text: trimmed, frozen: false });
          last = index + hit[0].length;
          continue;
        }
        let consumed = before;
        const replacement = fillTemplate(to, hit);
        const article = replacement.match(/^the\s+([A-Za-z]+)\b/i);
        if (article && new RegExp(`\\b${article[1]}\\s+$`, "i").test(consumed)) {
          consumed = consumed.replace(new RegExp(`\\b${article[1]}\\s+$`, "i"), "");
        }
        if (consumed) next.push({ text: consumed, frozen: false });
        if (replacement) next.push({ text: replacement, frozen: true });
        last = index + hit[0].length;
      }
      const tail = seg.text.slice(last);
      if (!matched) next.push(seg);
      else if (tail) next.push({ text: tail, frozen: false });
    }
    segments = next.length ? next : [{ text: "", frozen: false }];
  }
  return segments.map((seg) => seg.text).join("");
}

/** Storage slug. Not a word a founder wrote. Links stay untouched. */
function hideStorageSlug(text: string): string {
  return text
    .replace(/\s+\bon\s+default\b/gi, "")
    .replace(/\bon\s+default\b\s*/gi, "")
    .replace(/\s+\bdefault\b/gi, "")
    .replace(/\bdefault\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}

/** Replace addresses and live or test secret tokens. Call after plain-word rewrite. */
export function maskSecrets(value: string): string {
  return value
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]");
}

export function applyPlainWords(text: string): string {
  const emails: string[] = [];
  const links: string[] = [];
  let masked = holdTokens(text, EMAIL, "\u0000", emails);
  masked = maskLinks(masked, links);
  masked = rewriteTerms(masked);
  masked = masked.replace(/\b(?:the|an?)\s+(?=(?:the|an?)\b)/gi, "");
  masked = hideStorageSlug(masked);
  masked = restoreTokens(masked, "\u0001", links);
  return restoreTokens(masked, "\u0000", emails);
}

export function bannedCardHit(text: string): string | null {
  const links: string[] = [];
  const masked = maskLinks(String(text ?? ""), links);
  for (const rule of BANNED_ON_CARD) {
    const hit = masked.match(rule);
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

const EMAIL_ADDRESS = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

/** The part before @. Tester logins are not a name. */
export function emailLocalPart(value: string): string | null {
  const match = String(value ?? "").match(EMAIL_ADDRESS);
  if (!match) return null;
  if (TESTER_LOGIN.test(match[0])) return null;
  const local = match[0].split("@")[0] ?? "";
  return local || null;
}

export function firstNameOf(value: string): string {
  const word = value.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return word.replace(/[,.]+$/g, "");
}

/**
 * Name printed on the card. First name when one is stored.
 * Otherwise the email local part. Never the address itself.
 */
export function cardPersonName(row: unknown): string | null {
  if (!row) return null;
  if (typeof row === "string") {
    if (TESTER_LOGIN.test(row)) return null;
    if (row.includes("@")) return emailLocalPart(row);
    const name = firstNameOf(row);
    return name || null;
  }
  if (typeof row !== "object") return null;
  const rec = row as {
    displayName?: unknown;
    display_name?: unknown;
    principal?: unknown;
    email?: unknown;
  };
  const explicit =
    typeof rec.displayName === "string"
      ? rec.displayName
      : typeof rec.display_name === "string"
        ? rec.display_name
        : "";
  if (explicit.trim() && !TESTER_LOGIN.test(explicit) && !isLowercaseLogin(explicit)) {
    return firstNameOf(explicit);
  }
  const principal =
    typeof rec.principal === "string"
      ? rec.principal
      : typeof rec.email === "string"
        ? rec.email
        : "";
  if (!principal.trim() || TESTER_LOGIN.test(principal)) return null;
  if (principal.includes("@")) return emailLocalPart(principal);
  if (!isLowercaseLogin(principal)) return firstNameOf(principal);
  return null;
}

/** Card speech only. JSON principal and who keep the stored address. */
export function hideCardEmails(value: string): string {
  return String(value ?? "").replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    (token) => emailLocalPart(token) ?? "",
  );
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

/** Addresses stay on email, principal, and who. why, note, and premise are masked in the walker. */
export const REDACT_MASK_KEYS = new Set(["email", "principal", "who"]);

/**
 * Keys the spoken payload may contain. Anything else is dropped at every depth.
 * This is the journey shape, not a list of strings to skip.
 */
export const REDACT_ALLOW_KEYS = new Set([
  ...REDACT_RAW_KEYS,
  ...REDACT_MASK_KEYS,
  "accepted",
  "account",
  "acl",
  "actionableInsights",
  "argumentKeys",
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
  "buyer",
  "boards",
  "card",
  "challenges",
  "channel",
  "clock",
  "clocks",
  "clocksUnchanged",
  "comments",
  "commentsNeverAdvance",
  "company",
  "companyWorkspace",
  "company_id",
  "company_label",
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
  "duplicate",
  "emailOptIn",
  "emailQueued",
  "end",
  "engagements",
  "error",
  "errorCode",
  "events",
  "evidenceLinks",
  "expiresAt",
  "footer",
  "founder",
  "from",
  "founderWrittenDecision",
  "gate",
  "gateEnrichment",
  "gateEvents",
  "helpNeeded",
  "hypothesis",
  "idea",
  "ideaSlug",
  "idea_id",
  "ideas",
  "initiatives",
  "inventStage",
  "journeySpoken",
  "killLine",
  "killPostmortem",
  "labels",
  "killed",
  "killedCard",
  "killedDecision",
  "label",
  "last",
  "lastAction",
  "lastObservedFact",
  "lastTransitions",
  "latencyMs",
  "lessonsLearned",
  "leverage",
  "loopSpoken",
  "line",
  "markdown",
  "mcpUrl",
  "measure",
  "message",
  "meetingDoc",
  "name",
  "next",
  "nextAction",
  "nextBefore",
  "note",
  "notify",
  "openQuestions",
  "owners",
  "payload",
  "pnl",
  "poll",
  "portfolio",
  "portfolioScore",
  "portfolioSkip",
  "premise",
  "primary",
  "progress",
  "queued",
  "ranked",
  "readyForHumanEyes",
  "reason",
  "reasoning",
  "remaining",
  "removed",
  "retryAt",
  "revenue",
  "scoreboard",
  "scoredBy",
  "shape",
  "skipped",
  "snapshot",
  "spoken",
  "spokenLead",
  "summary",
  "stage",
  "start",
  "state",
  "subscriber",
  "subscribers",
  "supporting",
  "talkedToCustomers",
  "to",
  "tool",
  "total",
  "truncated",
  "unscored",
  "visualFlow",
  "warn",
  "webhook",
  "webhookDeliveries",
  "whatChanged",
  "whatWereNotDoing",
  "what_changed",
  "why",
]);

/**
 * OS 2.8.19 — initiative report card (PR0).
 *
 * Locked object. Do not enlarge.
 * Company: stage (spoken 5 rungs), gate, wipLimit=1 on customer_check until
 * paid use, bottleneckId (derived).
 * Initiative: id, kind, premise, measure, killLine, status, last, next,
 * outcome, impact, evidence, clock?, parentId?
 * Kinds v1 ONLY: customer_check | engagement | capital | legal | advisor
 *
 * Rank is computed by rankInitiatives, not stored. No priority integer.
 * At journeyPhase 1 (Write the bet / Ground) the primary is the single
 * active customer_check. Nested engagements inherit parentId and do not
 * title. capital / legal / advisor / hire never title until paid use.
 * After paid use, rank can change — do not invent that rule here.
 *
 * Dual-read of progress[] / supporting[] / engagements[] is dead for the
 * card lead once initiatives[] is present. Empty initiatives[] still
 * dual-reads old supporting / engagements / constraintThisWeek.
 * New writes → initiatives[] and clear those legacy keys. Mapping cannot
 * Advance. NDA ≠ Try. Ask / Do is not a card. progress[] is not card body.
 */

import {
  applyPlainWords,
  bannedCardHit,
  displayNameFrom,
  isInternalNote,
  isKillCondition,
  isLowercaseLogin,
  REDACT_ALLOW_KEYS,
  REDACT_MASK_KEYS,
  REDACT_RAW_KEYS,
} from "./board-plain-words.js";
import { formatSpokenJourney } from "./clock-map.js";
import {
  engagementsOf,
  supportingOf,
  type EngagementRow,
  type SupportingRow,
} from "./control-plane.js";

export const INITIATIVE_KINDS = [
  "customer_check",
  "engagement",
  "capital",
  "legal",
  "advisor",
] as const;

export const INITIATIVE_STATUSES = ["proposed", "active", "waiting", "closed"] as const;
export const INITIATIVE_OUTCOMES = ["none", "learned", "delivered", "killed"] as const;
export const INITIATIVE_IMPACTS = [
  "none",
  "learning",
  "revenue",
  "obligation",
  "clock",
] as const;
export const INITIATIVE_EVIDENCE = ["stated", "synthetic", "observed"] as const;

export type InitiativeKind = (typeof INITIATIVE_KINDS)[number];
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];
export type InitiativeOutcome = (typeof INITIATIVE_OUTCOMES)[number];
export type InitiativeImpact = (typeof INITIATIVE_IMPACTS)[number];
export type InitiativeEvidence = (typeof INITIATIVE_EVIDENCE)[number];

export type Initiative = {
  id: string;
  kind: InitiativeKind;
  premise: string;
  measure: string;
  killLine: string;
  status: InitiativeStatus;
  last: string;
  next: string;
  outcome: InitiativeOutcome;
  impact: InitiativeImpact;
  evidence: InitiativeEvidence;
  clock?: string;
  parentId?: string;
};

export type CustomerCheckRow = Initiative & { engagements: Initiative[] };

export type InitiativeCard = {
  company: {
    slug: string;
    label: string;
    stage?: string;
    gate?: string;
    wipLimit?: 1;
    bottleneckId: string | null;
  };
  bottleneck: Initiative | null;
  customerChecks: CustomerCheckRow[];
  footer: Initiative[];
  warn?: string;
  /** Display mark. Not a clock. Not a schema bump. */
  killed?: boolean;
};

export const INITIATIVE_INVALID =
  "initiatives[] is { id, kind customer_check|engagement|capital|legal|advisor, premise, measure, killLine, status proposed|active|waiting|closed, last, next, outcome none|learned|delivered|killed, impact none|learning|revenue|obligation|clock, evidence stated|synthetic|observed, clock?, parentId? } — no journeyPhase. Ask/Do is not a card.";

export const CUSTOMER_CHECK_WIP =
  "wipLimit is 1 on customer_check until paid use";

export const CONCATENATED_LEAD_REJECTED =
  "concatenated Clock/Operating lead fails — customer_check cannot title paper plus pay/use in one line";

export const NDA_IS_NOT_TRY = "NDA is not Try";

export const CLOCK_IMPACT_WARN =
  "impact=clock may warn, not title — paper cannot be the bottleneck title";

export const INITIATIVE_NO_JOURNEY_PHASE =
  "initiatives[] cannot carry journeyPhase — mapping cannot Advance";

export const RANK_IS_COMPUTED_NOT_STORED =
  "rank is computed by rankInitiatives, not stored — no priority integer. At journeyPhase 1 the primary is the single active customer_check. Nested engagements inherit parentId and do not title. capital / legal / advisor / hire never title until paid use. After paid use, do not invent a new rank rule.";

export const DUAL_READ_DEAD_FOR_CARD_LEAD =
  "when initiatives[] is present, dual-read of progress[] / supporting[] / engagements[] is dead for the card lead";

export const GET_JOURNEY_COMPACT_MAX = 20_000;

export const AUDIT_VIA_PROVENANCE = "list_provenance";

export const LEGACY_CARD_KEYS = ["progress", "supporting", "engagements"] as const;

export function scoreboardHasInitiatives(scoreboard: { initiatives?: unknown } | undefined): boolean {
  return Array.isArray(scoreboard?.initiatives) && scoreboard.initiatives.length > 0;
}

export function stripLegacyCardKeysWhenInitiatives<T extends Record<string, unknown>>(
  scoreboard: T,
): T {
  if (!scoreboardHasInitiatives(scoreboard)) return scoreboard;
  const next = { ...scoreboard };
  delete next.progress;
  delete next.supporting;
  delete next.engagements;
  return next;
}

const KINDS = new Set<string>(INITIATIVE_KINDS);
const STATUSES = new Set<string>(INITIATIVE_STATUSES);
const OUTCOMES = new Set<string>(INITIATIVE_OUTCOMES);
const IMPACTS = new Set<string>(INITIATIVE_IMPACTS);
const EVIDENCE = new Set<string>(INITIATIVE_EVIDENCE);
const TEXT_MAX = 280;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

const CLOCK_MARKERS =
  /\b(?:safe|fast|sopa|83\s*\(?\s*b\s*\)?|carta|cap table|nda|hire|counsel|lawyer|lawyer emails)\b/i;
const OPERATING_MARKERS = /\b(?:pay|paid|paying|use|used|using|customer|operator|account)\b/i;
const CONCAT_JOIN = /\s(?:\+|\/|;|and|plus)\s|\s[|/]\s/;
const DATE_RE = /\b20\d{2}-\d{2}-\d{2}\b|\b20\d{2}\/\d{1,2}\/\d{1,2}\b/;
const NAMED_ACCOUNT =
  /\b(?:[A-Za-z][A-Za-z0-9'/-]{1,24}\s+){0,4}(?:plant|shop|account|operator|founders?|owners?)\b/i;
/** Paper instruments as bottleneck premise. All-caps SAFE/FAST so English “safe/fast” do not trip. */
const PAPER_BOTTLENECK_TOKEN = /(?:^|[^\w])(?:SAFE|SOPA|FAST)(?:[^\w]|$)/;
const ACTIVE_PAY_OR_USE = /\bpay or use\b/i;

export type SpokenCardOpts = {
  allowPaperBottleneck?: boolean;
  killed?: boolean;
};

export function looksLikePaperBottleneck(text: string): boolean {
  const t = normalize(text);
  return PAPER_BOTTLENECK_TOKEN.test(t) || /(?:^|[^\w])sopa(?:[^\w]|$)/i.test(t);
}

export function isActivePayOrUse(row: { status?: string; measure?: string } | null | undefined): boolean {
  if (!row) return false;
  return row.status === "active" && ACTIVE_PAY_OR_USE.test(row.measure ?? "");
}

export const FOUNDER_CARD_HEADERS = ["Work", "State", "When", "Who"] as const;

export const FOUNDER_CARD_HEADER_ROW = "| Work | State | When | Who |";

export const FOUNDER_CARD_LEGEND =
  "*🎯 the one thing that matters most · 🟢 working on it · 🟡 waiting · 🔴 dropped · ⚪ closed*";

export const FOUNDER_CARD_SECTIONS = [
  "**Bet**",
  "**Other paths (not the main bet)**",
  "**Past bets**",
  "**Background**",
] as const;

/** Founder-facing card text. Internal enums are unchanged. */
export function founderCardBannedHit(text: string): string | null {
  return bannedCardHit(text);
}

export function spokenBottleneckLineOf(text: string): string {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const titleAt = lines.findIndex((line) => line.startsWith("**") && !line.startsWith("**Next"));
  if (titleAt >= 0 && !lines[titleAt].includes(":")) {
    const sells = lines.slice(titleAt + 1).find((line) => {
      if (line.startsWith("Founder:")) return false;
      if (line.startsWith("|") || line.startsWith("*🎯")) return false;
      if (line.startsWith("**")) return false;
      return true;
    });
    const sentence = (sells ?? "").replace(/\.$/, "");
    const wrapped = sentence.match(/^.+?\s+sells\s+(.+)$/i);
    return (wrapped?.[1] ?? sentence).trim();
  }
  const old = String(text ?? "").match(
    /\*\*[^*]*biggest problem right now:\s*([^*]+?)\.?\*\*/,
  );
  if (old) return old[1].trim().replace(/\.$/, "");
  const legacy = String(text ?? "").match(/^Bottleneck #1:\s*(.*)$/m);
  return legacy ? legacy[1].trim() : "";
}

function allowPaperOf(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  return (source as { allowPaperBottleneck?: unknown }).allowPaperBottleneck === true;
}

function boardDirectoryLine(idea: Record<string, unknown>): { name: string; text: string; killed: boolean } | null {
  const name = String(idea.name || "").trim();
  if (!name) return null;
  const killed = isKilledSource(idea);
  if (killed) {
    const card =
      typeof idea.killedCard === "string"
        ? idea.killedCard.replace(/^☠\s*/, "").replace(/^Killed\s+[—-]\s*/, "").trim()
        : "";
    const post =
      idea.killPostmortem && typeof idea.killPostmortem === "object"
        ? String((idea.killPostmortem as { lessonsLearned?: unknown }).lessonsLearned || "").trim()
        : "";
    return { name, text: card || post || "Stopped.", killed: true };
  }
  const snap = typeof idea.snapshot === "string" ? idea.snapshot : "";
  const stuck = spokenBottleneckLineOf(snap);
  return { name, text: stuck || "none yet", killed: false };
}

/** Live boards only when any bet is still live. A stopped bet is not listed beside live ones. */
export function formatBoardDirectory(ideas: unknown): string {
  if (!Array.isArray(ideas)) return "";
  const rows: { name: string; text: string; killed: boolean }[] = [];
  for (const idea of ideas) {
    if (!idea || typeof idea !== "object" || Array.isArray(idea)) continue;
    const row = boardDirectoryLine(idea as Record<string, unknown>);
    if (row) rows.push(row);
  }
  const liveRows = rows.filter((row) => !row.killed);
  const shown = liveRows.length ? liveRows : rows;
  const live: string[] = [];
  const stopped: string[] = [];
  for (const row of shown) {
    if (row.killed) stopped.push(`${row.name} — ${row.text}`);
    else live.push(`${row.name}\nWhat's stuck: ${row.text}`);
  }
  const parts = [...live];
  if (stopped.length) parts.push(["Stopped", ...stopped].join("\n"));
  return parts.join("\n\n").trim();
}

function isKilledSource(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const rec = source as { killed?: unknown; clocks?: { currentGate?: unknown }; currentGate?: unknown };
  return rec.killed === true || rec.clocks?.currentGate === "kill" || rec.currentGate === "kill";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shortText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, TEXT_MAX);
}

function asEnum<T extends string>(raw: unknown, allowed: Set<string>): T | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  return allowed.has(v) ? (v as T) : undefined;
}

function asClock(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t || t === "—") return undefined;
  return t.slice(0, 32);
}

function asId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const id = raw.trim().toLowerCase();
  return ID_RE.test(id) ? id : undefined;
}

export function isConcatenatedClockOperatingLead(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return CLOCK_MARKERS.test(t) && OPERATING_MARKERS.test(t) && CONCAT_JOIN.test(t);
}

export function looksLikeNda(text: string): boolean {
  return /\bnda\b/i.test(normalize(text));
}

export function hasPaidUse(rows: Initiative[]): boolean {
  return rows.some(
    (row) =>
      row.evidence === "observed" &&
      (row.kind === "customer_check" || row.kind === "engagement") &&
      (row.outcome === "delivered" || row.impact === "revenue") &&
      !looksLikeNda(`${row.premise} ${row.measure} ${row.killLine}`),
  );
}

export function hasNamedAccountWithDate(row: Initiative): boolean {
  const blob = `${row.premise} ${row.next} ${row.clock ?? ""}`;
  return NAMED_ACCOUNT.test(blob) && (Boolean(asClock(row.clock)) || DATE_RE.test(blob));
}

function activeCustomerChecks(rows: Initiative[]): Initiative[] {
  return rows.filter((row) => row.kind === "customer_check" && row.status === "active");
}

export function normalizeInitiatives(
  raw: unknown,
  opts?: { forDisplay?: boolean },
): { ok: true; value: Initiative[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: INITIATIVE_INVALID };
  const rows: Initiative[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: INITIATIVE_INVALID };
    }
    const rec = item as Record<string, unknown>;
    if ("journeyPhase" in rec && rec.journeyPhase !== undefined) {
      return { ok: false, error: INITIATIVE_NO_JOURNEY_PHASE };
    }
    const id = asId(rec.id);
    const kind = asEnum<InitiativeKind>(rec.kind, KINDS);
    const status = asEnum<InitiativeStatus>(rec.status, STATUSES);
    const outcome = asEnum<InitiativeOutcome>(rec.outcome, OUTCOMES);
    const impact = asEnum<InitiativeImpact>(rec.impact, IMPACTS);
    const evidence = asEnum<InitiativeEvidence>(rec.evidence, EVIDENCE);
    const premise = shortText(rec.premise);
    const measure = shortText(rec.measure);
    const killLine = shortText(rec.killLine);
    const last = shortText(rec.last);
    const next = shortText(rec.next);
    if (
      !id ||
      seen.has(id) ||
      !kind ||
      !status ||
      !outcome ||
      !impact ||
      !evidence ||
      !premise ||
      !measure ||
      !killLine
    ) {
      return { ok: false, error: INITIATIVE_INVALID };
    }
    if (looksLikeNda(`${premise} ${measure} ${killLine}`) && outcome === "delivered") {
      return { ok: false, error: NDA_IS_NOT_TRY };
    }
    seen.add(id);
    const row: Initiative = {
      id,
      kind,
      premise,
      measure,
      killLine,
      status,
      last,
      next,
      outcome,
      impact,
      evidence,
    };
    const clock = asClock(rec.clock);
    if (clock) row.clock = clock;
    const parentId = asId(rec.parentId);
    if (parentId) row.parentId = parentId;
    rows.push(row);
  }
  const paid = hasPaidUse(rows);
  if (!paid && activeCustomerChecks(rows).length > 1) {
    if (!opts?.forDisplay) return { ok: false, error: CUSTOMER_CHECK_WIP };
    // A second in-play bet must not wipe the card. Keep one 🟢 and show the rest as waiting.
    let kept = false;
    for (const row of rows) {
      if (row.kind !== "customer_check" || row.status !== "active") continue;
      if (kept) row.status = "waiting";
      else kept = true;
    }
  }
  // Write-time still sees paper+pay concat so Clock/Operating lead is rejected.
  // Display rank filters paper unless allowPaperBottleneck.
  const leadCandidate = pickBottleneck(rows, { allowPaperBottleneck: true });
  if (leadCandidate && isConcatenatedClockOperatingLead(leadText(leadCandidate))) {
    return { ok: false, error: CONCATENATED_LEAD_REJECTED };
  }
  return { ok: true, value: rows };
}

function leadText(row: Initiative): string {
  return `${row.premise} ${row.measure} ${row.killLine}`;
}

function supportingKind(role: SupportingRow["role"]): InitiativeKind {
  if (role === "investor") return "capital";
  if (role === "counsel") return "legal";
  return "advisor";
}

function supportingStatus(state: SupportingRow["state"]): InitiativeStatus {
  if (state === "promise") return "proposed";
  if (state === "clock") return "waiting";
  return "closed";
}

function supportingOutcome(state: SupportingRow["state"]): InitiativeOutcome {
  if (state === "done") return "delivered";
  if (state === "dead") return "killed";
  return "none";
}

function supportingImpact(state: SupportingRow["state"]): InitiativeImpact {
  return state === "clock" ? "clock" : "none";
}

/** Dual-read old scoreboard fields. Dead for card lead when initiatives[] is present. */
export function initiativesFromLegacy(
  scoreboard: {
    constraint_this_week?: unknown;
    supporting?: unknown;
    engagements?: unknown;
    killPostmortem?: unknown;
  },
  opts: SpokenCardOpts = {},
): Initiative[] {
  const rows: Initiative[] = [];
  const constraint =
    typeof scoreboard.constraint_this_week === "string"
      ? scoreboard.constraint_this_week.trim()
      : "";
  const postmortem =
    scoreboard.killPostmortem && typeof scoreboard.killPostmortem === "object"
      ? (scoreboard.killPostmortem as { why?: unknown })
      : undefined;
  const endedBecause =
    opts.killed && typeof postmortem?.why === "string" ? postmortem.why.trim().slice(0, TEXT_MAX) : "";
  // A killed board keeps the bet as a closed row. It must not stay a live pay-or-use check.
  if (constraint && !opts.killed) {
    rows.push({
      id: "legacy-constraint",
      kind: "customer_check",
      premise: constraint.slice(0, TEXT_MAX),
      measure: "pay or use",
      killLine: constraint.slice(0, TEXT_MAX),
      status: "active",
      last: "",
      next: constraint.slice(0, TEXT_MAX),
      outcome: "none",
      impact: "none",
      evidence: "stated",
    });
  } else if (constraint && opts.killed) {
    rows.push({
      id: "legacy-constraint",
      kind: "customer_check",
      premise: constraint.slice(0, TEXT_MAX),
      measure: "killed",
      killLine: "",
      status: "closed",
      last: endedBecause,
      next: "—",
      outcome: "killed",
      impact: "none",
      evidence: "stated",
    });
  }
  const supporting = supportingOf(scoreboard);
  supporting.forEach((row: SupportingRow, i) => {
    const mapped: Initiative = {
      id: `legacy-supporting-${i + 1}`,
      kind: supportingKind(row.role),
      premise: row.lastObservedFact.slice(0, TEXT_MAX) || row.role,
      measure: row.nextAction.slice(0, TEXT_MAX) || row.role,
      killLine: `${row.role} cannot promote`,
      status: supportingStatus(row.state),
      last: row.lastObservedFact.slice(0, TEXT_MAX),
      next: row.nextAction.slice(0, TEXT_MAX),
      outcome: supportingOutcome(row.state),
      impact: supportingImpact(row.state),
      evidence: "stated",
    };
    if (row.clock && row.clock !== "—") mapped.clock = row.clock.slice(0, 32);
    rows.push(mapped);
  });
  const parentId = rows.find((row) => row.kind === "customer_check" && row.status !== "closed")?.id;
  const engagements = engagementsOf(scoreboard);
  engagements.forEach((row: EngagementRow, i) => {
    const nda = row.kind === "nda";
    const mapped: Initiative = {
      id: `legacy-engagement-${i + 1}`,
      kind: "engagement",
      premise: row.account.slice(0, TEXT_MAX),
      measure: nda ? NDA_IS_NOT_TRY : row.kind,
      killLine: nda ? NDA_IS_NOT_TRY : row.kind,
      status: supportingStatus(row.state),
      last: row.kind,
      next: nda ? "paid or use in their environment" : row.kind,
      outcome: nda ? "none" : supportingOutcome(row.state),
      impact: nda ? "obligation" : supportingImpact(row.state),
      evidence: "stated",
    };
    if (parentId) mapped.parentId = parentId;
    rows.push(mapped);
  });
  return rows;
}

export function initiativesOf(
  scoreboard: {
    initiatives?: unknown;
    constraint_this_week?: unknown;
    supporting?: unknown;
    engagements?: unknown;
  },
  opts: SpokenCardOpts = {},
): Initiative[] {
  const stored = scoreboard.initiatives;
  if (Array.isArray(stored) && stored.length) {
    const hit = normalizeInitiatives(stored, { forDisplay: true });
    return hit.ok ? hit.value : [];
  }
  return initiativesFromLegacy(scoreboard, opts);
}

function pickBottleneck(rows: Initiative[], opts: SpokenCardOpts = {}): Initiative | null {
  // Rank is computed, not stored. Paper kinds never title until paid use.
  // A killed idea has no live pay-or-use bottleneck.
  if (opts.killed) return null;
  const openChecks = rows.filter(
    (row) => row.kind === "customer_check" && row.status !== "closed",
  );
  const usable = opts.allowPaperBottleneck
    ? openChecks
    : openChecks.filter((row) => !looksLikePaperBottleneck(row.premise));
  const dated = usable.filter((row) => row.impact !== "clock" && hasNamedAccountWithDate(row));
  if (dated[0]) return dated[0];
  const operating = usable.filter((row) => row.impact !== "clock");
  if (operating[0]) return operating[0];
  return usable[0] ?? null;
}

/** Computed rank. Do not persist a priority integer. See RANK_IS_COMPUTED_NOT_STORED. */
export function rankInitiatives(rows: Initiative[], opts: SpokenCardOpts = {}): {
  bottleneck: Initiative | null;
  customerChecks: CustomerCheckRow[];
  footer: Initiative[];
  warn?: string;
  bottleneckId: string | null;
} {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const closed = rows.filter((row) => row.status === "closed");
  const open = rows.filter((row) => row.status !== "closed");
  const checks = open.filter((row) => row.kind === "customer_check");
  const engagements = open.filter((row) => row.kind === "engagement");
  const others = open.filter(
    (row) => row.kind !== "customer_check" && row.kind !== "engagement",
  );
  const dated = checks.filter((row) => hasNamedAccountWithDate(row));
  const rest = checks.filter((row) => !hasNamedAccountWithDate(row));
  const orderedChecks = [...dated, ...rest];
  const nestedIds = new Set<string>();
  const customerChecks: CustomerCheckRow[] = orderedChecks.map((check) => {
    const kids = engagements.filter((row) => row.parentId === check.id);
    kids.forEach((row) => nestedIds.add(row.id));
    return { ...check, engagements: kids };
  });
  const orphans = engagements.filter((row) => {
    if (nestedIds.has(row.id)) return false;
    return !row.parentId || !byId.has(row.parentId);
  });
  const bottleneck = pickBottleneck(rows, opts);
  const warn =
    bottleneck?.impact === "clock" ||
    open.some((row) => row.impact === "clock" && row.kind !== "customer_check")
      ? CLOCK_IMPACT_WARN
      : undefined;
  const title =
    bottleneck && bottleneck.impact === "clock" ? null : bottleneck;
  return {
    bottleneck: title,
    customerChecks,
    footer: [...others, ...orphans, ...closed],
    ...(warn ? { warn } : {}),
    bottleneckId: title?.id ?? null,
  };
}

export function buildInitiativeCard(input: {
  slug: string;
  label: string;
  journeyPhase: number;
  gate: string;
  initiatives: Initiative[];
  killed?: boolean;
  allowPaperBottleneck?: boolean;
}): InitiativeCard {
  const killed = Boolean(input.killed);
  const paper = { allowPaperBottleneck: Boolean(input.allowPaperBottleneck) };
  const ranked = rankInitiatives(input.initiatives, { ...paper, killed });
  let bottleneck = ranked.bottleneck;
  if (killed) {
    const prior = rankInitiatives(input.initiatives, { ...paper, killed: false }).bottleneck;
    bottleneck = prior
      ? {
          ...prior,
          status: "closed",
          outcome: "killed",
          measure: isActivePayOrUse(prior) ? "killed" : prior.measure,
        }
      : null;
  }
  const stage = formatSpokenJourney(input.journeyPhase);
  return {
    company: {
      slug: input.slug,
      label: input.label,
      stage,
      gate: input.gate,
      wipLimit: 1,
      bottleneckId: bottleneck?.id ?? ranked.bottleneckId,
    },
    bottleneck,
    customerChecks: killed
      ? ranked.customerChecks.filter((row) => row.id !== "legacy-constraint")
      : ranked.customerChecks,
    footer: ranked.footer,
    ...(ranked.warn ? { warn: ranked.warn } : {}),
    ...(killed ? { killed: true } : {}),
  };
}

/** Founder-facing card. progress[] must not appear here. */
export function formatInitiativeCard(card: InitiativeCard): string[] {
  return formatSpokenCard({
    label: card.company.label || "company",
    card,
    killed: Boolean(card.killed),
  }).split("\n");
}

export function cardFromScoreboard(input: {
  slug: string;
  label: string;
  journeyPhase: number;
  gate: string;
  scoreboard: {
    initiatives?: unknown;
    constraint_this_week?: unknown;
    supporting?: unknown;
    engagements?: unknown;
    progress?: unknown;
    allowPaperBottleneck?: unknown;
  };
  killed?: boolean;
  allowPaperBottleneck?: boolean;
}): InitiativeCard {
  const allowPaper = Boolean(input.allowPaperBottleneck) || allowPaperOf(input.scoreboard);
  const killed = Boolean(input.killed);
  return buildInitiativeCard({
    slug: input.slug,
    label: input.label,
    journeyPhase: input.journeyPhase,
    gate: input.gate,
    initiatives: initiativesOf(input.scoreboard, { killed, allowPaperBottleneck: allowPaper }),
    killed,
    allowPaperBottleneck: allowPaper,
  });
}

export function cardBodyOmitsProgress(cardText: string, progress: string[] | undefined): boolean {
  if (!progress?.length) return true;
  return progress.every((note) => !cardText.includes(note));
}

/** Lead is the founder card through the legend. progress[] must not write it. */
export function snapshotLeadOmitsProgress(snapshot: string, progress: string[] | undefined): boolean {
  if (!progress?.length) return true;
  const headline = snapshot.search(/^\*\*[^*]+\*\*/m);
  const legacy = snapshot.indexOf("WHERE ARE WE —");
  const start = headline >= 0 ? headline : legacy;
  if (start < 0) return progress.every((note) => !snapshot.includes(note));
  const legend = snapshot.indexOf(FOUNDER_CARD_LEGEND, start);
  const legacyEnd = snapshot.indexOf("OTHER INITIATIVES", start);
  const end = legend >= 0 ? legend : legacyEnd;
  const lead = end >= 0 ? snapshot.slice(start, end) : snapshot.slice(start);
  return progress.every((note) => !lead.includes(note));
}

export const JOURNEY_PHASE_DUMP = /journey phase \d/;
export const GATE_HOLD_DUMP = /gate hold/i;

/**
 * Replace NDA without breaking the sentence. "the NDA" stays "the confidentiality
 * promise". A bare NDA becomes "a confidentiality promise". Do not insert a comma.
 */
export function redactConfidentiality(value: string): string {
  let text = value;
  text = text.replace(/\ban\s+ndas?\b/gi, "a confidentiality promise");
  text = text.replace(/\bthe\s+ndas\b/gi, "the confidentiality promises");
  text = text.replace(/\bthe\s+nda\b/gi, "the confidentiality promise");
  text = text.replace(/(\w)\s+ndas\b/gi, "$1 confidentiality promises");
  text = text.replace(/(\w)\s+nda\b/gi, "$1 confidentiality promise");
  text = text.replace(/\bndas\b/gi, "confidentiality promises");
  text = text.replace(/\bnda\b/gi, "a confidentiality promise");
  text = text.replace(/\b(the|an?)\s+,?\s*a confidentiality promise\b/gi, (_full, art: string) =>
    /^the$/i.test(art) ? "the confidentiality promise" : "a confidentiality promise",
  );
  return text;
}

/** Same words on the card and in JSON. Email addresses are held aside so a rewrite cannot cut them. */
function scrubFounderText(value: string): string {
  return applyPlainWords(redactConfidentiality(value));
}

/** Enum tokens and id lists. Strings stay literal. Nested objects still go through the allowlist. */
function copyUnscrubbed(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      item !== null && typeof item === "object" ? redactPayloadText(item, seen) : item,
    );
  }
  return redactPayloadText(value, seen);
}

/**
 * Allowlist at every depth. Unknown keys are dropped.
 * email, principal, and who are scrubbed. kind stays raw, so `nda` stays a kind.
 */
function redactPayloadText(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubFounderText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactPayloadText(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!REDACT_ALLOW_KEYS.has(key)) continue;
    if (REDACT_RAW_KEYS.has(key)) {
      out[key] = copyUnscrubbed(child, seen);
      continue;
    }
    if (REDACT_MASK_KEYS.has(key) && typeof child === "string") {
      out[key] = scrubFounderText(child);
      continue;
    }
    out[key] = redactPayloadText(child, seen);
  }
  return out;
}

function plainCardText(value: unknown): string {
  let text = typeof value === "string" ? value : "";
  text = text.replace(/\s+/g, " ").trim();
  for (const rule of SPOKEN_HIDE) text = text.replace(rule, "");
  text = redactConfidentiality(text);
  text = applyPlainWords(text);
  text = text.replace(/\bpaper cannot promote\b/gi, "");
  text = text.replace(/\bcannot promote\b/gi, "");
  return text.replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").trim();
}

function cardCell(value: string): string {
  const text = value.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  return text || "—";
}

function openQuestionsOf(source: unknown): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  const raw = (source as { openQuestions?: unknown }).openQuestions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is string => typeof row === "string" && row.trim().length > 0);
}

function scoreboardRecordOf(source: unknown): Record<string, unknown> | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const sb = (source as { scoreboard?: unknown }).scoreboard;
  if (sb && typeof sb === "object" && !Array.isArray(sb)) return sb as Record<string, unknown>;
  return source as Record<string, unknown>;
}

function asSupportingList(raw: unknown): SupportingRow[] {
  return supportingOf({ supporting: raw });
}

function asEngagementList(raw: unknown): EngagementRow[] {
  return engagementsOf({ engagements: raw });
}

/** Prefer idea/scoreboard rows; fall back to payload-level dual-read (hosted hole). */
export function collectLegacyControlPlane(
  payload: Record<string, unknown> | undefined,
  idea: unknown,
): { supporting: SupportingRow[]; engagements: EngagementRow[] } {
  const sb = idea && typeof idea === "object" ? scoreboardRecordOf(idea) : undefined;
  const company =
    payload?.company && typeof payload.company === "object"
      ? (payload.company as { supporting?: unknown })
      : undefined;
  const ideaEngagements =
    idea && typeof idea === "object" ? (idea as { engagements?: unknown }).engagements : undefined;
  const supporting = asSupportingList(sb?.supporting).length
    ? asSupportingList(sb?.supporting)
    : asSupportingList(company?.supporting).length
      ? asSupportingList(company?.supporting)
      : asSupportingList(payload?.supporting);
  const engagements = asEngagementList(sb?.engagements).length
    ? asEngagementList(sb?.engagements)
    : asEngagementList(ideaEngagements).length
      ? asEngagementList(ideaEngagements)
      : asEngagementList(payload?.engagements);
  return { supporting, engagements };
}

function spokenBottleneckPremise(
  card: InitiativeCard | null | undefined,
  constraintThisWeek: string | undefined,
  opts: SpokenCardOpts = {},
): string {
  if (opts.killed) return "none yet";
  const premise = card?.bottleneck?.premise?.trim() || "";
  if (premise && (opts.allowPaperBottleneck || !looksLikePaperBottleneck(premise))) {
    return premise;
  }
  const constraint = constraintThisWeek?.trim() || "";
  if (constraint && (opts.allowPaperBottleneck || !looksLikePaperBottleneck(constraint))) {
    if (!premise) return constraint;
  }
  return "none yet";
}

const SPOKEN_HIDE = [
  /NDA is not Try/gi,
  /SAFE is not proof/gi,
  /stored clocks stay/gi,
  /Ask \/ Do is not a card/gi,
  /Write the bet \(\d+\)/g,
];

function sanitizeSpoken(text: string): string {
  let out = text;
  for (const re of SPOKEN_HIDE) {
    out = out.replace(re, "");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function alsoMovingBodyOf(text: string): string | null {
  const lines = String(text ?? "").split("\n");
  const start = lines.findIndex((line) => line.startsWith("| Work |"));
  if (start >= 0) {
    return lines
      .slice(start + 2)
      .filter((line) => line.startsWith("|"))
      .join("\n")
      .trim();
  }
  if (!/Also moving \(not the bottleneck\)/.test(String(text ?? ""))) return null;
  const chunk = String(text).split("Also moving (not the bottleneck)")[1] ?? "";
  return (chunk.split("Open questions")[0] ?? "").trim();
}

type SpokenRow = {
  work: string;
  state: string;
  next: string;
  who: string;
};

function statusDot(row: Initiative, allowGreen: boolean): string {
  if (row.outcome === "killed") return "🔴";
  if (row.status === "closed") return "⚪";
  if (!allowGreen) return "🟡";
  if (row.status === "waiting" || row.status === "proposed") return "🟡";
  if (row.status === "active") return "🟢";
  return "⚪";
}

function workIcon(row: Initiative, bottleneck: boolean): string {
  if (bottleneck) return "🎯 🤝";
  if (row.kind === "capital") return "💵";
  if (row.kind === "advisor") return "📄";
  if (row.kind === "legal") return "⚖️";
  if (row.outcome === "killed" || row.status === "closed") return "🔎";
  if (row.kind === "engagement") return "🏢";
  return "🤝";
}

function isBackground(row: Initiative): boolean {
  return row.kind === "capital" || row.kind === "legal" || row.kind === "advisor";
}

function glossFor(row: Initiative): string {
  if (row.kind === "advisor") return "an advisor";
  if (row.kind === "legal") return "a lawyer";
  if (row.kind === "capital") return "someone who might put money in";
  if (row.kind === "engagement") return "a company we're talking with";
  return "";
}

function looksLikeBareName(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length !== 1) return false;
  if (/\b(the|a|an|for|and|with|from|sent|recorded|file|notes|tip|draft|plant|shop|company)\b/i.test(text)) {
    return false;
  }
  return true;
}

function maybeIntroduce(text: string, gloss: string, seen: Set<string>): string {
  const cleaned = text.trim();
  if (!cleaned || !gloss || !looksLikeBareName(cleaned)) return cleaned;
  const key = cleaned.toLowerCase();
  if (seen.has(key) || cleaned.includes(",")) {
    seen.add(key);
    return cleaned;
  }
  seen.add(key);
  return `${cleaned}, ${gloss}`;
}

/** First mention of any email (an owner on the board) gets the same plain gloss. */
function introducePeople(text: string, seen: Set<string>): string {
  return text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (token, offset: number, whole: string) => {
    const key = token.toLowerCase();
    if (seen.has(key)) return token;
    seen.add(key);
    const continues = /^\s*[A-Za-z]/.test(whole.slice(offset + token.length));
    return continues ? `${token}, the founder,` : `${token}, the founder`;
  });
}

function whereItStands(row: Initiative, allowGreen: boolean): string {
  const last = plainCardText(row.last) || "Not started";
  const dot = statusDot(row, allowGreen);
  return last.startsWith(dot) ? last : `${dot} ${last}`;
}

function workLabel(row: Initiative, opts: { bottleneck: boolean; depth: number; seen: Set<string> }): string {
  const premise = maybeIntroduce(plainCardText(row.premise) || "Untitled", glossFor(row), opts.seen);
  const icon = workIcon(row, opts.bottleneck);
  const body = opts.bottleneck ? `**${premise}**` : premise;
  const indent = opts.depth > 0 ? "· · ".repeat(opts.depth) : "";
  return `${indent}${icon} ${body}`;
}

const CARD_WHO_ROLES = new Set(["founder", "founder_authorized"]);

function roleRank(role: string): number {
  if (role === "founder") return 0;
  if (role === "founder_authorized") return 1;
  return 2;
}

function namedPeople(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const ranked: Array<{ name: string; rank: number }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      const name = displayNameFrom(row);
      if (name) ranked.push({ name, rank: 2 });
      continue;
    }
    const rec = row as { role?: unknown };
    const role = String(rec.role ?? "");
    if (role && !CARD_WHO_ROLES.has(role)) continue;
    const name = displayNameFrom(row);
    if (name) ranked.push({ name, rank: roleRank(role) });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  const names: string[] = [];
  for (const row of ranked) {
    if (!names.includes(row.name)) names.push(row.name);
  }
  return names;
}

export function whoNamesFromOwners(owners: unknown): string[] {
  return namedPeople(owners);
}

/** Display names only. Founder first. Logins and tester accounts stay off the card. */
export function whoNamesForCard(payload: { owners?: unknown; acl?: unknown }): string[] {
  const fromOwners = namedPeople(payload.owners);
  const fromAcl = namedPeople(payload.acl);
  const names: string[] = [];
  for (const name of [...fromOwners, ...fromAcl]) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

function whoCell(names: string[]): string {
  return names.length ? names.join(", ") : "—";
}

function isBlankCardText(text: string): boolean {
  return !text || /^(not started|untitled|none yet|—|-)$/i.test(text);
}

function endedReason(row: Initiative): string {
  const last = plainCardText(row.last);
  const kill = plainCardText(row.killLine);
  if (last && !isBlankCardText(last) && !isInternalNote(last) && !isKillCondition(last)) return last;
  if (kill && !isBlankCardText(kill) && !isInternalNote(kill) && !isKillCondition(kill)) return kill;
  return "";
}

function pastState(row: Initiative): string {
  const dot = statusDot(row, false);
  const why = endedReason(row);
  const clock = plainCardText(row.clock ?? "");
  const range = clock && clock !== "—" ? clock : "";
  const body = [range, why].filter(Boolean).join(": ");
  return body ? `${dot} ${body}` : dot;
}

function pushSpokenRow(
  out: SpokenRow[],
  row: Initiative,
  opts: { bottleneck: boolean; depth: number; seen: Set<string>; who: string; past?: boolean },
): void {
  if (isInternalNote(plainCardText(row.premise))) return;
  const allowGreen = Boolean(opts.bottleneck && opts.depth === 0 && !opts.past);
  const state = opts.past ? pastState(row) : whereItStands(row, allowGreen);
  out.push({
    work: introducePeople(workLabel(row, opts), opts.seen),
    state: introducePeople(state, opts.seen),
    next: introducePeople(plainCardText(row.next) || "—", opts.seen),
    who: opts.who,
  });
}

function spokenSections(
  card: InitiativeCard | null | undefined,
  alsoLive: string[],
  seen: Set<string>,
  who: string,
  killed: boolean,
): { bet: SpokenRow[]; other: SpokenRow[]; past: SpokenRow[]; background: SpokenRow[] } {
  const bet: SpokenRow[] = [];
  const other: SpokenRow[] = [];
  const pastBucket: SpokenRow[] = [];
  const background: SpokenRow[] = [];
  const checks = card?.customerChecks ?? [];
  const footer = card?.footer ?? [];
  const bottleneck = card?.bottleneck ?? null;
  const rendered = new Set<string>();
  const live = checks.filter((row) => row.status !== "closed" && row.outcome !== "killed");

  const emit = (
    bucket: SpokenRow[],
    check: CustomerCheckRow,
    depth: number,
    isBottleneck: boolean,
  ) => {
    if (rendered.has(check.id)) return;
    rendered.add(check.id);
    const shown = isBottleneck && bottleneck ? { ...check, ...bottleneck, engagements: check.engagements } : check;
    const past = bucket === pastBucket;
    pushSpokenRow(bucket, shown, { bottleneck: isBottleneck, depth, seen, who, past });
    for (const child of check.engagements ?? []) {
      rendered.add(child.id);
      pushSpokenRow(bucket, child, { bottleneck: false, depth: depth + 1, seen, who, past });
    }
    for (const follow of live) {
      if (follow.parentId === check.id) emit(bucket, follow, depth + 1, false);
    }
  };

  if (killed && bottleneck && !rendered.has(bottleneck.id)) {
    rendered.add(bottleneck.id);
    pushSpokenRow(
      pastBucket,
      { ...bottleneck, status: "closed", outcome: "killed" },
      { bottleneck: false, depth: 0, seen, who, past: true },
    );
  }

  if (!killed && bottleneck && bottleneck.kind === "customer_check") {
    const match = checks.find((row) => row.id === bottleneck.id);
    emit(bet, match ?? { ...bottleneck, engagements: [] }, 0, true);
  } else if (!killed && bottleneck) {
    rendered.add(bottleneck.id);
    pushSpokenRow(bet, bottleneck, { bottleneck: true, depth: 0, seen, who });
  }

  for (const check of killed ? checks : live) {
    const shown = killed
      ? {
          ...check,
          status: "closed" as const,
          outcome: "killed" as const,
          engagements: (check.engagements ?? []).map((child) => ({
            ...child,
            status: "closed" as const,
            outcome: "killed" as const,
          })),
        }
      : check;
    emit(killed ? pastBucket : other, shown, 0, false);
  }

  const rest = footer.filter((row) => !rendered.has(row.id));
  const liveOrphans = rest.filter(
    (row) => !isBackground(row) && row.status !== "closed" && row.outcome !== "killed",
  );
  for (const row of liveOrphans) {
    rendered.add(row.id);
    pushSpokenRow(other, row, { bottleneck: false, depth: row.parentId ? 1 : 0, seen, who });
  }

  for (const name of alsoLive) {
    const label = plainCardText(name);
    if (!label) continue;
    other.push({
      work: `🤝 **${label}**`,
      state: "🟡 On its own board",
      next: "Open that board",
      who,
    });
  }

  const remaining = footer.filter((row) => !rendered.has(row.id));
  for (const row of remaining.filter((item) => !isBackground(item))) {
    pushSpokenRow(pastBucket, row, { bottleneck: false, depth: row.parentId ? 1 : 0, seen, who, past: true });
  }
  for (const row of remaining.filter((item) => isBackground(item))) {
    pushSpokenRow(background, row, { bottleneck: false, depth: 0, seen, who });
  }

  if (!killed && !bet.length) {
    bet.push({
      work: "🎯 🤝 **Nothing on the board yet**",
      state: "⚪ Not started",
      next: "Name what done looks like",
      who,
    });
  }
  return { bet, other, past: pastBucket, background };
}

function sectionLines(title: string, rows: SpokenRow[], keepEmpty = false): string[] {
  if (!rows.length && !keepEmpty) return [];
  return [
    `| ${title} | | | |`,
    ...rows.map(
      (row) => `| ${cardCell(row.work)} | ${cardCell(row.state)} | ${cardCell(row.next)} | ${cardCell(row.who)} |`,
    ),
  ];
}

function nextSentence(row: Initiative | null, killed: boolean): string {
  if (killed) return "Leave this stopped.";
  const next = row ? plainCardText(row.next) : "";
  if (!next || next === "—") return "No step is written down yet.";
  return next.endsWith(".") ? next : `${next}.`;
}

function sellsSentence(label: string, sells: string): string {
  const text = sells.replace(/\.+$/, "").trim();
  if (!text || text === "none yet") return "nothing is in play yet.";
  if (/^(nothing is|no one|nobody)\b/i.test(text)) return `${text}.`;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escaped}\\s+sells\\b`, "i").test(text)) return `${text}.`;
  return `${label} sells ${text}.`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function asOfLabel(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return value.trim();
  const month = MONTHS[Number(iso[2]) - 1];
  if (!month) return value.trim();
  return `${month} ${Number(iso[3])}`;
}

function dollars(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

type PnlShape = {
  days?: unknown;
  revenue?: unknown;
  costs?: unknown;
  costsUnknown?: unknown;
  asOf?: unknown;
};

function moneySpokenRow(pnl: PnlShape, who: string): SpokenRow | null {
  const days = typeof pnl.days === "number" && pnl.days > 0 ? pnl.days : 30;
  const revenue = typeof pnl.revenue === "number" ? dollars(pnl.revenue) : "";
  const costs = typeof pnl.costs === "number" ? dollars(pnl.costs) : "";
  const unknown = pnl.costsUnknown === true || pnl.costs == null;
  if (!revenue && !costs && !unknown) return null;
  const rev = revenue || "$0";
  const costPart = costs
    ? `about ${costs} measured costs${unknown ? ", some unknown" : ""}`
    : "measured costs unknown";
  const asOf = typeof pnl.asOf === "string" && pnl.asOf.trim() ? asOfLabel(pnl.asOf) : "";
  const when = asOf ? ` (${asOf})` : "";
  return {
    work: `💵 Money (last ${days} days)`,
    state: `🟡 ${rev} revenue; ${costPart}${when}`,
    next: "Updated weekly",
    who,
  };
}

function pnlOf(source: unknown): PnlShape | null {
  const sb = scoreboardRecordOf(source);
  const raw = sb && (sb as { pnl?: unknown }).pnl;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as PnlShape;
}

/** Founder-voice card. No journey integers, gate labels, WIP, OS version, or kind slugs. */
export function formatSpokenCard(input: {
  label: string;
  card?: InitiativeCard | null;
  constraintThisWeek?: string;
  openQuestions?: string[];
  supporting?: SupportingRow[];
  engagements?: EngagementRow[];
  initiativesPresent?: boolean;
  killed?: boolean;
  killedCard?: string;
  allowPaperBottleneck?: boolean;
  alsoLive?: string[];
  /** ACL founder principals, or already-short names. Missing stays —. */
  who?: string[];
  pnl?: PnlShape | null;
  /** Killed sibling boards. Internal notes are dropped. */
  pastBoards?: Array<{ title: string; range?: string; reason?: string }>;
}): string {
  const rawLabel = input.label.trim() || "company";
  const label = rawLabel.toLowerCase() === "default" ? "company" : rawLabel;
  const card = input.card;
  const killed = Boolean(input.killed || card?.killed);
  const opts: SpokenCardOpts = {
    killed,
    allowPaperBottleneck: Boolean(input.allowPaperBottleneck),
  };
  const seen = new Set<string>();
  let sells = plainCardText(spokenBottleneckPremise(card, input.constraintThisWeek, opts));
  if (killed) {
    const fromCard = plainCardText(
      (input.killedCard ?? "").replace(/^☠\s*/, "").replace(/^Killed\s+[—-]\s*/, ""),
    );
    if (fromCard && !isInternalNote(fromCard)) sells = fromCard;
  }
  if (!sells || sells === "none yet") sells = "nothing is in play yet";
  const whoNames = (input.who ?? []).filter((name) => !isLowercaseLogin(name));
  const founder = whoNames[0] ?? "";
  const headline = [`**${label}**`, founder ? `Founder: ${founder}` : "", sellsSentence(label, sells)]
    .filter(Boolean)
    .join("\n");
  const alsoLive = (input.alsoLive ?? []).map((name) => name.trim()).filter(Boolean);
  const who = whoCell(whoNames);
  const sections = spokenSections(card, alsoLive, seen, who, killed);
  for (const board of input.pastBoards ?? []) {
    const title = plainCardText(board.title);
    const reason = plainCardText(board.reason ?? "");
    const range = plainCardText(board.range ?? "");
    if (!title || isInternalNote(title)) continue;
    if (isInternalNote(reason) && !range) continue;
    const shownReason = reason && !isInternalNote(reason) && !isKillCondition(reason) ? reason : "";
    const body = [range, shownReason].filter(Boolean).join(": ");
    sections.past.push({
      work: `🔎 ${title}`,
      state: body ? `🔴 ${body}` : "🔴",
      next: "—",
      who,
    });
  }
  const money = moneySpokenRow(input.pnl ?? {}, who);
  if (input.pnl && money) sections.background.unshift(money);
  const table = [
    ...sectionLines(FOUNDER_CARD_SECTIONS[0], sections.bet),
    ...sectionLines(FOUNDER_CARD_SECTIONS[1], sections.other),
    ...sectionLines(FOUNDER_CARD_SECTIONS[2], sections.past),
    ...sectionLines(FOUNDER_CARD_SECTIONS[3], sections.background, true),
  ];
  const step = nextSentence(killed ? null : card?.bottleneck ?? null, killed);
  const namedStep =
    founder && step && !step.toLowerCase().includes(founder.toLowerCase()) ? `${founder} — ${step}` : step;
  const next = introducePeople(`**Next:** ${namedStep}`, seen);
  const lines = [
    headline,
    "",
    FOUNDER_CARD_HEADER_ROW,
    "|---|---|---|---|",
    ...table,
    "",
    FOUNDER_CARD_LEGEND,
    "",
    next,
  ];
  return sanitizeSpoken(lines.join("\n")).trim();
}

type CompactCompany = {
  slug: string;
  label: string;
  bottleneckId: string | null;
};

function compactCardCompany(
  card: InitiativeCard,
  expand: boolean,
): InitiativeCard & { clocks?: { stage: string; gate: string; wipLimit: 1 } } {
  const company = card.company;
  const lead: CompactCompany = {
    slug: company.slug,
    label: company.label,
    bottleneckId: company.bottleneckId,
  };
  const next: InitiativeCard & { clocks?: { stage: string; gate: string; wipLimit: 1 } } = {
    ...card,
    company: lead,
  };
  if (expand) {
    next.clocks = {
      stage: company.stage ?? "",
      gate: company.gate ?? "",
      wipLimit: company.wipLimit ?? 1,
    };
  }
  return next;
}

function clocksOfIdea(idea: Record<string, unknown>): { journeyPhase: number; currentGate: string } {
  const clocks =
    idea.clocks && typeof idea.clocks === "object"
      ? (idea.clocks as { journeyPhase?: unknown; currentGate?: unknown })
      : {};
  return {
    journeyPhase: Number(clocks.journeyPhase) || 1,
    currentGate: String(clocks.currentGate || idea.currentGate || "hold"),
  };
}

function enrichIdeaCard(
  idea: Record<string, unknown>,
  payload: Record<string, unknown>,
  fallbackLabel: string,
): InitiativeCard {
  const sb = scoreboardRecordOf(idea) ?? {};
  const hasInit = scoreboardHasInitiatives(sb);
  const { supporting, engagements } = collectLegacyControlPlane(payload, idea);
  const scoreboard = hasInit
    ? sb
    : {
        ...sb,
        supporting: sb.supporting ?? supporting,
        engagements: sb.engagements ?? engagements,
      };
  const clocks = clocksOfIdea(idea);
  const company =
    payload.company && typeof payload.company === "object"
      ? (payload.company as { slug?: string; label?: string })
      : undefined;
  return cardFromScoreboard({
    slug: company?.slug || "",
    label: (company?.label || fallbackLabel || "").trim() || "company",
    journeyPhase: clocks.journeyPhase,
    gate: clocks.currentGate,
    scoreboard,
    killed: isKilledSource(idea) || clocks.currentGate === "kill",
    allowPaperBottleneck: allowPaperOf(sb),
  });
}

function payloadIdeas(payload: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(payload.ideas)) {
    return payload.ideas.filter((idea): idea is Record<string, unknown> => Boolean(idea) && typeof idea === "object" && !Array.isArray(idea));
  }
  if (payload.idea && typeof payload.idea === "object" && !Array.isArray(payload.idea)) {
    return [payload.idea as Record<string, unknown>];
  }
  return [];
}

function liveChecks(idea: Record<string, unknown>): Initiative[] {
  if (isKilledSource(idea)) return [];
  const sb = scoreboardRecordOf(idea);
  if (!sb) return [];
  return initiativesOf(sb).filter(
    (row) =>
      row.kind === "customer_check" &&
      row.status !== "closed" &&
      row.outcome !== "killed" &&
      !isInternalNote(row.premise),
  );
}

function ideaScore(idea: Record<string, unknown>): number {
  if (isKilledSource(idea)) return 0;
  const live = liveChecks(idea);
  if (!live.length) return 1;
  if (live.some((row) => hasNamedAccountWithDate(row))) return 4;
  if (live.some((row) => row.status === "active")) return 3;
  return 2;
}

function pickLeadIndex(ideas: Record<string, unknown>[]): number {
  let best = 0;
  let score = -1;
  ideas.forEach((idea, index) => {
    const next = ideaScore(idea);
    if (next > score) {
      score = next;
      best = index;
    }
  });
  return best;
}

function pastBoardOf(idea: Record<string, unknown>): { title: string; range?: string; reason?: string } | null {
  if (!isKilledSource(idea)) return null;
  const title = String(idea.name || idea.slug || "").trim();
  if (!title) return null;
  const post =
    idea.killPostmortem && typeof idea.killPostmortem === "object"
      ? (idea.killPostmortem as { why?: unknown; lessonsLearned?: unknown })
      : undefined;
  const decision =
    idea.killedDecision && typeof idea.killedDecision === "object"
      ? (idea.killedDecision as { at?: unknown; why?: unknown })
      : undefined;
  const why = typeof post?.why === "string" ? post.why : "";
  const lesson = typeof post?.lessonsLearned === "string" ? post.lessonsLearned : "";
  const decisionWhy = typeof decision?.why === "string" ? decision.why : "";
  const card =
    typeof idea.killedCard === "string"
      ? idea.killedCard.replace(/^☠\s*/, "").replace(/^Killed\s+[—-]\s*/, "")
      : "";
  const reason = why || decisionWhy || lesson || card;
  const range = typeof decision?.at === "string" ? decision.at : "";
  return { title, ...(range ? { range } : {}), ...(reason ? { reason } : {}) };
}

function spokenInputFromIdea(
  idea: Record<string, unknown>,
  payload: Record<string, unknown>,
  fallbackLabel: string,
  card: InitiativeCard | undefined,
  alsoLive?: string[],
): Parameters<typeof formatSpokenCard>[0] {
  const sb = scoreboardRecordOf(idea);
  const hasInit = scoreboardHasInitiatives(sb);
  const { supporting, engagements } = collectLegacyControlPlane(payload, idea);
  return {
    label:
      (card?.company?.label || fallbackLabel || "").trim() ||
      String(idea.name ?? "").trim() ||
      "company",
    card,
    constraintThisWeek:
      typeof idea.constraintThisWeek === "string" ? idea.constraintThisWeek : undefined,
    openQuestions: openQuestionsOf(sb),
    supporting: hasInit ? [] : supporting,
    engagements: hasInit ? [] : engagements,
    initiativesPresent: hasInit,
    killed: isKilledSource(idea) || Boolean(card?.killed),
    killedCard: typeof idea.killedCard === "string" ? idea.killedCard : undefined,
    allowPaperBottleneck: allowPaperOf(sb),
    alsoLive,
    who: whoNamesForCard(payload),
    pnl: pnlOf(idea),
  };
}

function applySpokenToIdea(
  idea: unknown,
  payload: Record<string, unknown>,
  fallbackLabel: string,
  expand: boolean,
): Record<string, unknown> | unknown {
  if (!idea || typeof idea !== "object" || Array.isArray(idea)) return idea;
  const next = { ...(idea as Record<string, unknown>) };
  const sb = scoreboardRecordOf(next);
  const rebuilt =
    sb && (scoreboardHasInitiatives(sb) || sb.constraint_this_week || sb.supporting || sb.engagements)
      ? enrichIdeaCard(next, payload, fallbackLabel)
      : next.card && typeof next.card === "object"
        ? (next.card as InitiativeCard)
        : enrichIdeaCard(next, payload, fallbackLabel);
  const compacted = compactCardCompany(rebuilt, expand);
  next.card = rebuilt.killed ? { ...compacted, killed: true } : compacted;
  next.snapshot = formatSpokenCard(spokenInputFromIdea(next, payload, fallbackLabel, rebuilt));
  return next;
}

/** Payload lead is spoken. Snapshot is the same founder sentence, not a clock dump. */
export function applySpokenPayloadLead(
  raw: unknown,
  opts: { expand?: boolean } = {},
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const payload = { ...(raw as Record<string, unknown>) };
  if (payload.ok !== true) return raw;
  const expand = Boolean(opts.expand);
  const company =
    payload.company && typeof payload.company === "object"
      ? (payload.company as { label?: string; slug?: string })
      : undefined;
  const fallbackLabel = (company?.label || company?.slug || "").trim();
  const originals = payloadIdeas(payload);
  const leadIndex = originals.length ? pickLeadIndex(originals) : 0;
  const leadRaw = originals[leadIndex];
  if (leadRaw) {
    const sb = scoreboardRecordOf(leadRaw);
    if (sb || payload.supporting || payload.engagements || !payload.card) {
      payload.card = enrichIdeaCard(leadRaw, payload, fallbackLabel);
    }
  }
  if (Array.isArray(payload.ideas)) {
    payload.ideas = payload.ideas.map((idea) => applySpokenToIdea(idea, payload, fallbackLabel, expand));
  }
  if (payload.idea) {
    payload.idea = applySpokenToIdea(payload.idea, payload, fallbackLabel, expand);
  }
  if (payload.card && typeof payload.card === "object") {
    payload.card = compactCardCompany(payload.card as InitiativeCard, expand);
  }
  const refreshed = payloadIdeas(payload);
  const leadRec = refreshed[leadIndex];
  const spokenCard =
    (payload.card as InitiativeCard | undefined) ||
    (leadRec?.card && typeof leadRec.card === "object" ? (leadRec.card as InitiativeCard) : undefined);
  const leadName = leadRec ? String(leadRec.name || leadRec.slug || "").trim() : "";
  const alsoLive = refreshed
    .filter((idea, index) => index !== leadIndex && liveChecks(idea).length > 0)
    .map((idea) => String(idea.name || idea.slug || "").trim())
    .filter((name) => name && name !== leadName);
  const leadScoreboard = leadRec ? scoreboardRecordOf(leadRec) : undefined;
  const leadHasCheck = leadScoreboard
    ? initiativesOf(leadScoreboard).some((row) => row.kind === "customer_check")
    : false;
  const pastBoards = refreshed
    .map((idea, index) => ({ idea, index }))
    .filter(({ idea, index }) => isKilledSource(idea) && (index !== leadIndex || !leadHasCheck))
    .map(({ idea }) => pastBoardOf(idea))
    .filter((row): row is { title: string; range?: string; reason?: string } => Boolean(row));
  const spokenInput = leadRec
    ? { ...spokenInputFromIdea(leadRec, payload, fallbackLabel, spokenCard, alsoLive), pastBoards }
    : {
        label: fallbackLabel || spokenCard?.company?.label || "company",
        card: spokenCard,
        alsoLive,
        pastBoards,
      };
  const spoken = formatSpokenCard(spokenInput);
  if (Array.isArray(payload.ideas) && payload.ideas[leadIndex] && typeof payload.ideas[leadIndex] === "object") {
    payload.ideas[leadIndex] = { ...(payload.ideas[leadIndex] as Record<string, unknown>), snapshot: spoken };
  }
  if (payload.idea && typeof payload.idea === "object") {
    payload.idea = { ...(payload.idea as Record<string, unknown>), snapshot: spoken };
  }
  const boards = scrubFounderText(formatBoardDirectory(payload.ideas));
  const spokenLead = spoken.split("\n").find((line) => line.trim().startsWith("**"))?.trim() ?? "";
  const { ok: _ok, spoken: _drop, boards: _boards, markdown: _markdown, spokenLead: _lead, ...rest } = payload;
  const safe = redactPayloadText(rest) as Record<string, unknown>;
  return { ok: true, spoken, spokenLead, markdown: spoken, boards, ...safe };
}

export function compactJourneyPayload(
  raw: unknown,
  opts: { expandAudit?: boolean } = {},
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const payload = { ...(raw as Record<string, unknown>) };
  if (payload.ok !== true) return raw;
  if (!opts.expandAudit) {
    payload.audit = [];
    payload.auditVia = AUDIT_VIA_PROVENANCE;
  }
  return applySpokenPayloadLead(payload, { expand: Boolean(opts.expandAudit) });
}

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
    return { ok: false, error: CUSTOMER_CHECK_WIP };
  }
  const leadCandidate = pickBottleneck(rows);
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
export function initiativesFromLegacy(scoreboard: {
  constraint_this_week?: unknown;
  supporting?: unknown;
  engagements?: unknown;
}): Initiative[] {
  const rows: Initiative[] = [];
  const constraint =
    typeof scoreboard.constraint_this_week === "string"
      ? scoreboard.constraint_this_week.trim()
      : "";
  if (constraint) {
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
  const parentId = rows.find((row) => row.kind === "customer_check")?.id;
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

export function initiativesOf(scoreboard: {
  initiatives?: unknown;
  constraint_this_week?: unknown;
  supporting?: unknown;
  engagements?: unknown;
}): Initiative[] {
  const stored = scoreboard.initiatives;
  if (Array.isArray(stored) && stored.length) {
    const hit = normalizeInitiatives(stored);
    return hit.ok ? hit.value : [];
  }
  return initiativesFromLegacy(scoreboard);
}

function pickBottleneck(rows: Initiative[]): Initiative | null {
  // Rank is computed, not stored. Paper kinds never title until paid use.
  const openChecks = rows.filter(
    (row) => row.kind === "customer_check" && row.status !== "closed",
  );
  const dated = openChecks.filter(
    (row) => row.impact !== "clock" && hasNamedAccountWithDate(row),
  );
  if (dated[0]) return dated[0];
  const operating = openChecks.filter((row) => row.impact !== "clock");
  if (operating[0]) return operating[0];
  return openChecks[0] ?? null;
}

/** Computed rank. Do not persist a priority integer. See RANK_IS_COMPUTED_NOT_STORED. */
export function rankInitiatives(rows: Initiative[]): {
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
  const bottleneck = pickBottleneck(rows);
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
}): InitiativeCard {
  const ranked = rankInitiatives(input.initiatives);
  const stage = formatSpokenJourney(input.journeyPhase);
  return {
    company: {
      slug: input.slug,
      label: input.label,
      stage,
      gate: input.gate,
      wipLimit: 1,
      bottleneckId: ranked.bottleneckId,
    },
    bottleneck: ranked.bottleneck,
    customerChecks: ranked.customerChecks,
    footer: ranked.footer,
    ...(ranked.warn ? { warn: ranked.warn } : {}),
  };
}

function lineFor(row: Initiative, indent = "  "): string {
  const clock = row.clock ? ` · clock ${row.clock}` : "";
  const nda = looksLikeNda(`${row.premise} ${row.measure}`) ? ` (${NDA_IS_NOT_TRY})` : "";
  return `${indent}${row.kind} · ${row.premise} · ${row.status} · last ${row.last || "—"} · next ${row.next || "—"}${clock}${nda}`;
}

/** Card body. progress[] must not appear here. */
export function formatInitiativeCard(card: InitiativeCard): string[] {
  const wip = hasPaidUse([
    ...(card.bottleneck ? [card.bottleneck] : []),
    ...card.customerChecks,
    ...card.customerChecks.flatMap((row) => row.engagements),
    ...card.footer,
  ])
    ? "WIP customer_check: paid use observed"
    : "WIP 1 on customer_check until paid use";
  const lines = [
    `WHERE ARE WE — ${card.company.label}`,
    `Stage: ${card.company.stage} · Gate: ${card.company.gate} · ${wip}`,
    card.bottleneck
      ? `#1 BOTTLENECK  ${card.bottleneck.id} · ${card.bottleneck.premise}`
      : "#1 BOTTLENECK  none yet",
    card.warn,
    "CUSTOMER CHECKS",
  ].filter((line): line is string => Boolean(line));
  if (!card.customerChecks.length) {
    lines.push("  (none)");
  }
  for (const check of card.customerChecks) {
    lines.push(lineFor(check));
    if (!check.engagements.length) continue;
    for (const child of check.engagements) {
      lines.push(lineFor(child, "    "));
    }
  }
  lines.push("OTHER INITIATIVES");
  if (!card.footer.length) {
    lines.push("  (none)");
  } else {
    for (const row of card.footer) {
      lines.push(lineFor(row));
    }
  }
  lines.push("Ask / Do / Write back is a quality bar, not a card.");
  return lines;
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
  };
}): InitiativeCard {
  return buildInitiativeCard({
    slug: input.slug,
    label: input.label,
    journeyPhase: input.journeyPhase,
    gate: input.gate,
    initiatives: initiativesOf(input.scoreboard),
  });
}

export function cardBodyOmitsProgress(cardText: string, progress: string[] | undefined): boolean {
  if (!progress?.length) return true;
  return progress.every((note) => !cardText.includes(note));
}

/** Lead is WHERE ARE WE … through OTHER INITIATIVES. progress[] must not write it. */
export function snapshotLeadOmitsProgress(snapshot: string, progress: string[] | undefined): boolean {
  if (!progress?.length) return true;
  const start = snapshot.indexOf("WHERE ARE WE —");
  if (start < 0) {
    return progress.every((note) => !snapshot.includes(note));
  }
  const end = snapshot.indexOf("OTHER INITIATIVES", start);
  const lead = end >= 0 ? snapshot.slice(start, end) : snapshot.slice(start);
  return progress.every((note) => !lead.includes(note));
}

export const JOURNEY_PHASE_DUMP = /journey phase \d/;
export const GATE_HOLD_DUMP = /gate hold/i;

function plainWords(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "none yet";
}

function openQuestionsOf(source: unknown): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  const raw = (source as { openQuestions?: unknown }).openQuestions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is string => typeof row === "string" && row.trim().length > 0);
}

/** Founder-voice card. No journey integers, gate labels, WIP, OS version, or kind slugs. */
export function formatSpokenCard(input: {
  label: string;
  card?: InitiativeCard | null;
  constraintThisWeek?: string;
  openQuestions?: string[];
}): string {
  const label = input.label.trim() || "company";
  const card = input.card;
  const bottleneck =
    card?.bottleneck?.premise?.trim() ||
    input.constraintThisWeek?.trim() ||
    "none yet";
  const lines = [label, "", `Bottleneck #1: ${bottleneck}`, ""];
  const checks = card?.customerChecks ?? [];
  if (checks.length) {
    for (const check of checks) {
      lines.push(check.premise);
      lines.push(`  where it stands: ${plainWords(check.last)}`);
      lines.push(`  next: ${plainWords(check.next)}`);
      for (const child of check.engagements) {
        lines.push(`    ${child.premise}`);
        lines.push(`      where it stands: ${plainWords(child.last)}`);
        lines.push(`      next: ${plainWords(child.next)}`);
      }
    }
    lines.push("");
  }
  lines.push("Also moving (not the bottleneck)");
  const footer = card?.footer ?? [];
  if (!footer.length) {
    lines.push("  none yet");
  } else {
    for (const row of footer) {
      lines.push(`  ${row.premise}`);
    }
  }
  lines.push("");
  lines.push("Open questions");
  const questions = input.openQuestions ?? [];
  if (!questions.length) {
    lines.push("  none yet");
  } else {
    for (const question of questions) {
      lines.push(`  ${question}`);
    }
  }
  return lines.join("\n");
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

function spokenFromIdea(idea: Record<string, unknown>, fallbackLabel: string): string {
  const card = idea.card && typeof idea.card === "object" ? (idea.card as InitiativeCard) : undefined;
  const scoreboard =
    idea.scoreboard && typeof idea.scoreboard === "object"
      ? (idea.scoreboard as { openQuestions?: unknown })
      : undefined;
  return formatSpokenCard({
    label:
      (card?.company?.label || fallbackLabel || "").trim() ||
      String(idea.name ?? "").trim() ||
      "company",
    card,
    constraintThisWeek:
      typeof idea.constraintThisWeek === "string" ? idea.constraintThisWeek : undefined,
    openQuestions: openQuestionsOf(scoreboard),
  });
}

function applySpokenToIdea(
  idea: unknown,
  fallbackLabel: string,
  expand: boolean,
): Record<string, unknown> | unknown {
  if (!idea || typeof idea !== "object" || Array.isArray(idea)) return idea;
  const next = { ...(idea as Record<string, unknown>) };
  if (next.card && typeof next.card === "object") {
    next.card = compactCardCompany(next.card as InitiativeCard, expand);
  }
  next.snapshot = spokenFromIdea(
    { ...next, card: (idea as { card?: InitiativeCard }).card },
    fallbackLabel,
  );
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
  if (Array.isArray(payload.ideas)) {
    payload.ideas = payload.ideas.map((idea) => applySpokenToIdea(idea, fallbackLabel, expand));
  }
  if (payload.idea) {
    payload.idea = applySpokenToIdea(payload.idea, fallbackLabel, expand);
  }
  if (payload.card && typeof payload.card === "object") {
    payload.card = compactCardCompany(payload.card as InitiativeCard, expand);
  }
  const leadIdea =
    (Array.isArray(payload.ideas) ? payload.ideas[0] : undefined) ||
    (payload.idea && typeof payload.idea === "object" ? payload.idea : undefined);
  const spoken = formatSpokenCard({
    label:
      fallbackLabel ||
      ((payload.card as InitiativeCard | undefined)?.company?.label ?? ""),
    card:
      (payload.card as InitiativeCard | undefined) ||
      (leadIdea && typeof leadIdea === "object"
        ? ((leadIdea as { card?: InitiativeCard }).card)
        : undefined),
    constraintThisWeek:
      leadIdea && typeof leadIdea === "object"
        ? String((leadIdea as { constraintThisWeek?: string }).constraintThisWeek ?? "")
        : undefined,
    openQuestions:
      leadIdea && typeof leadIdea === "object"
        ? openQuestionsOf((leadIdea as { scoreboard?: unknown }).scoreboard)
        : undefined,
  });
  const { ok: _ok, spoken: _drop, ...rest } = payload;
  return { ok: true, spoken, ...rest };
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

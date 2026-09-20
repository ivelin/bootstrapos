/**
 * OS 2.8.18 — one founder control plane.
 *
 * PRIMARY = customer bet only (rungs + gate + constraint + missing artifacts + kill line).
 * SUPPORTING = advisor/FAST, investor/SAFE, counsel, contractor, partner — same
 * company snapshot, no rungs, cannot promote. Exile to a spreadsheet is rejected.
 * ENGAGEMENTS = named accounts under primary (NDA, quote, pilot SOW, plant run).
 * Not extra journeys. NDA ≠ Try. Paid/use in their environment = Try.
 *
 * Admission is what is being proven (named-group kill line, pay or use) — not
 * brittle keywords. create_idea / phase reject when the primary object is a
 * person or instrument. Recon may patch supporting + constraint + progress.
 * Recon may not Advance primary. No third clock. No stored 1–9 / 1–7 bump.
 */

export const CONTROL_PLANE_ORDER = ["primary", "supporting", "engagements"] as const;

export type ControlPlaneLayer = (typeof CONTROL_PLANE_ORDER)[number];

export type SupportingState = "promise" | "clock" | "done" | "dead";

export type SupportingRole =
  | "advisor"
  | "investor"
  | "counsel"
  | "contractor"
  | "partner";

export type SupportingRow = {
  role: SupportingRole;
  state: SupportingState;
  /** Clock date, or "—" when none. */
  clock: string;
  nextAction: string;
  lastObservedFact: string;
};

export type EngagementKind = "nda" | "quote" | "pilot-sow" | "plant-run";

export type EngagementRow = {
  account: string;
  kind: EngagementKind;
  state: SupportingState;
};

export const RELATIONSHIP_AS_PRIMARY_REJECTED =
  "relationship or instrument is supporting, not a primary 0-1 idea — write supporting[] on this company snapshot (no rungs, cannot promote). Exile to a spreadsheet is rejected.";

export const PRIMARY_PHASE_NEEDS_PRODUCT_WHY =
  "primary phase needs founder yes and a product bet-class why (named-group kill line, pay or use)";

export const SUPPORTING_INVALID =
  "supporting[] is { role, state promise|clock|done|dead, clock date or —, nextAction, lastObservedFact } — no journeyPhase";

export const ENGAGEMENT_INVALID =
  "engagements[] is { account, kind nda|quote|pilot-sow|plant-run, state } — no journeyPhase. NDA is not Try.";

const SUPPORTING_ROLES = new Set<string>([
  "advisor",
  "investor",
  "counsel",
  "contractor",
  "partner",
]);

const SUPPORTING_STATES = new Set<string>(["promise", "clock", "done", "dead"]);

const ENGAGEMENT_KINDS = new Set<string>(["nda", "quote", "pilot-sow", "plant-run"]);

const TEXT_MAX = 280;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shortText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, TEXT_MAX);
}

/** Named customer set + kill on pay or use. The product-class admit line. */
export function hasNamedGroupKillLine(text: string): boolean {
  const t = normalize(text);
  if (t.length < 20) return false;
  const namedGroup =
    /\b(?:[A-Za-z][A-Za-z0-9'/-]{1,24}\s+){0,6}[A-Za-z][A-Za-z0-9'/-]{1,24}\s+(?:who|that|which)\b/.test(
      t,
    ) || /\balready (?:pay|paid|use|used|buy|bought|run)\b/i.test(t);
  const payOrUse = /\b(?:pay|paid|paying|use|used|using|buy|bought)\b/i.test(t);
  const kill =
    /\bkill\b/i.test(t) ||
    /\b(?:will not|do not|don't|stop) (?:pay|use|buy)\b/i.test(t);
  return namedGroup && payOrUse && kill;
}

/** The bet's primary object is legal paper / FAST / SAFE / SOPA / 83(b). */
export function instrumentIsPrimaryObject(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return (
    /\b(?:close|file|sign|finish|complete|draft|execute)\b[^.]{0,56}\b(?:safe|fast|sopa|83\s*\(?\s*b\s*\)?|cap table)\b/i.test(
      t,
    ) ||
    /\b(?:safe|fast|sopa|83\s*\(?\s*b\s*\)?|cap table)\b[^.]{0,56}\b(?:is the (?:bet|idea|board|product)|this week|as the (?:bet|idea|board))\b/i.test(
      t,
    )
  );
}

/**
 * The bet's primary object is a person / hire / investor / contractor /
 * employee / consultant / channel-partner-as-the-bet.
 */
export function relationshipIsPrimaryObject(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return (
    /^(?:hire|hiring|recruit|recruiting)\b/i.test(t) ||
    /\bthe (?:bet|idea|board|product) is\b[^.]{0,56}\b(?:hire|hiring|investor|contractor|employee|consultant|advisor|channel[ -]?partner)\b/i.test(
      t,
    ) ||
    /\b(?:investor|contractor|employee|consultant|advisor|channel[ -]?partner)\b[^.]{0,48}\b(?:is the (?:bet|idea|board|product)|as the (?:bet|idea|board|product))\b/i.test(
      t,
    ) ||
    /\bchannel[ -]?partner (?:will sell|as the (?:bet|idea|product))\b/i.test(t)
  );
}

/** Person or instrument as the thing being proven — not mere keywords. */
export function primaryObjectIsPersonOrInstrument(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (hasNamedGroupKillLine(t)) return false;
  return instrumentIsPrimaryObject(t) || relationshipIsPrimaryObject(t);
}

export function admitPrimaryWhy(
  why: string | undefined,
): { ok: true } | { ok: false; error: string } {
  const t = normalize(why ?? "");
  if (primaryObjectIsPersonOrInstrument(t)) {
    return { ok: false, error: RELATIONSHIP_AS_PRIMARY_REJECTED };
  }
  return { ok: true };
}

export function admitPrimaryPhaseWhy(
  why: string | undefined,
  founderYes: boolean,
): { ok: true } | { ok: false; error: string } {
  if (!founderYes) {
    return { ok: false, error: PRIMARY_PHASE_NEEDS_PRODUCT_WHY };
  }
  const t = normalize(why ?? "");
  if (primaryObjectIsPersonOrInstrument(t)) {
    return { ok: false, error: RELATIONSHIP_AS_PRIMARY_REJECTED };
  }
  if (!hasNamedGroupKillLine(t)) {
    return { ok: false, error: PRIMARY_PHASE_NEEDS_PRODUCT_WHY };
  }
  return { ok: true };
}

function asSupportingRole(raw: unknown): SupportingRole | undefined {
  if (typeof raw !== "string") return undefined;
  const role = raw.trim().toLowerCase().split("/")[0];
  if (SUPPORTING_ROLES.has(role)) return role as SupportingRole;
  return undefined;
}

function asState(raw: unknown): SupportingState | undefined {
  if (typeof raw !== "string") return undefined;
  const state = raw.trim().toLowerCase();
  if (SUPPORTING_STATES.has(state)) return state as SupportingState;
  return undefined;
}

function asClock(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  if (typeof raw !== "string") return "—";
  const t = raw.trim();
  return t.length ? t.slice(0, 32) : "—";
}

function asEngagementKind(raw: unknown): EngagementKind | undefined {
  if (typeof raw !== "string") return undefined;
  const kind = raw.trim().toLowerCase();
  if (ENGAGEMENT_KINDS.has(kind)) return kind as EngagementKind;
  return undefined;
}

export function normalizeSupporting(
  raw: unknown,
): { ok: true; value: SupportingRow[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: SUPPORTING_INVALID };
  const rows: SupportingRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: SUPPORTING_INVALID };
    }
    const rec = item as Record<string, unknown>;
    if ("journeyPhase" in rec && rec.journeyPhase !== undefined) {
      return { ok: false, error: SUPPORTING_INVALID };
    }
    const role = asSupportingRole(rec.role);
    const state = asState(rec.state);
    const nextAction = shortText(rec.nextAction);
    const lastObservedFact = shortText(rec.lastObservedFact);
    if (!role || !state || !nextAction || !lastObservedFact) {
      return { ok: false, error: SUPPORTING_INVALID };
    }
    rows.push({
      role,
      state,
      clock: asClock(rec.clock),
      nextAction,
      lastObservedFact,
    });
  }
  return { ok: true, value: rows };
}

export function normalizeEngagements(
  raw: unknown,
): { ok: true; value: EngagementRow[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: ENGAGEMENT_INVALID };
  const rows: EngagementRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: ENGAGEMENT_INVALID };
    }
    const rec = item as Record<string, unknown>;
    if ("journeyPhase" in rec && rec.journeyPhase !== undefined) {
      return { ok: false, error: ENGAGEMENT_INVALID };
    }
    const account = shortText(rec.account);
    const kind = asEngagementKind(rec.kind);
    const state = asState(rec.state);
    if (!account || !kind || !state) {
      return { ok: false, error: ENGAGEMENT_INVALID };
    }
    rows.push({ account, kind, state });
  }
  return { ok: true, value: rows };
}

export function supportingOf(scoreboard: { supporting?: unknown } | undefined): SupportingRow[] {
  const hit = normalizeSupporting(scoreboard?.supporting);
  return hit.ok ? hit.value : [];
}

export function engagementsOf(scoreboard: { engagements?: unknown } | undefined): EngagementRow[] {
  const hit = normalizeEngagements(scoreboard?.engagements);
  return hit.ok ? hit.value : [];
}

export function companySupportingOf(
  company: { supporting?: SupportingRow[] },
  ideas: Array<{ scoreboard?: { supporting?: unknown } }>,
): SupportingRow[] {
  if (company.supporting?.length) return company.supporting;
  for (const idea of ideas) {
    const rows = supportingOf(idea.scoreboard);
    if (rows.length) return rows;
  }
  return [];
}

export function formatSupportingLine(row: SupportingRow): string {
  return `${row.role} · ${row.state} · clock ${row.clock} · next ${row.nextAction} · last ${row.lastObservedFact}`;
}

export function formatEngagementLine(row: EngagementRow): string {
  const ndaNote = row.kind === "nda" ? " (NDA is not Try)" : "";
  return `${row.account} · ${row.kind} · ${row.state}${ndaNote}`;
}

export function controlPlaneSnapshotLines(input: {
  supporting: SupportingRow[];
  engagements: EngagementRow[];
}): string[] {
  const supporting =
    input.supporting.length > 0
      ? input.supporting.map((row) => `  ${formatSupportingLine(row)}`)
      : ["  (none)"];
  const engagements =
    input.engagements.length > 0
      ? input.engagements.map((row) => `  ${formatEngagementLine(row)}`)
      : ["  (none)"];
  return [
    "PRIMARY (customer bet — rungs, gate, constraint, missing artifacts, kill line)",
    "SUPPORTING (same snapshot; no rungs; cannot promote)",
    ...supporting,
    "ENGAGEMENTS (named accounts under primary; NDA is not Try)",
    ...engagements,
  ];
}

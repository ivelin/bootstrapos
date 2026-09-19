/**
 * FAST 0-1 journey control plane: company and idea are separate.
 * Clocks are enums. Scoreboard is versioned jsonb. Views are generated, not stored.
 * Research/traces stay local — do not lift ~/.bootstrap-os.
 */
import {
  JOURNEY_PHASES,
  JOURNEY_SPOKEN,
  LOOP_SPOKEN,
  LOOP_STAGES,
  formatSpokenJourney,
  formatSpokenLoop,
  spokenJourneyOf,
  spokenLoopOf,
} from "./constants.js";
import type { JourneyAclRole, JourneyActor } from "./journey-auth.js";
import {
  enqueueBoardNotify,
  isHttpsWebhookUrl,
  normalizeSubscribePrincipal,
  sameSubscriberScope,
  subscriberHasAclAccess,
  summarizeBoardNotify,
  type BoardSubscriberRow,
  type NotifyOutboxRow,
  type WebhookDelivery,
} from "./journey-notify.js";

export const SCOREBOARD_SCHEMA_VERSION = 1;
/** Short fluid text on the idea. Not a clock. Not tickets. */
export const CONSTRAINT_THIS_WEEK_MAX = 280;

export type GateDecision = "advance" | "iterate" | "hold" | "kill";

export const GATE_DECISIONS: readonly GateDecision[] = [
  "advance",
  "iterate",
  "hold",
  "kill",
] as const;

export type Scoreboard = {
  schema_version: number;
  hypothesis?: string;
  readyForHumanEyes?: { status: "unknown" | "blocked" | "green" };
  autonomyPosture?: "strict" | "auto" | "dangerous";
  openQuestions?: string[];
  lastAction?: string;
  progress?: string[];
  challenges?: string[];
  helpNeeded?: string[];
  /** Fluid. Honest biggest bottleneck. Not a clock. Not tickets. */
  constraint_this_week?: string;
  /** Observed talks, not preference. Used to judge a landing-page side quest. */
  customerConversations?: number;
  talkedToCustomers?: boolean;
  /** All-gate short enrichment. Not a novel. */
  gateEnrichment?: GateEnrichment;
  /** Kill postmortem. Required on kill. Never invent on read. */
  killPostmortem?: KillPostmortem;
  /** Founder/advisor weekly labels. Never invent on read. Never auto-promote. */
  portfolioScore?: PortfolioScore;
};

/** Weekly Impact / Evidence / Leverage labels. Integers 1–5. OS never auto-promotes. */
export type PortfolioScore = {
  impact: number;
  evidence: number;
  leverage: number;
  /** Required on write (≤280). Never invent on read. */
  why?: string;
  scoredAt?: string;
  scoredBy?: string;
};

/** Short all-gate enrichment. why lives on the gate event. */
export type GateEnrichment = {
  whatChanged: string;
  whatWereNotDoing: string;
  evidenceLinks?: string[];
};

/** Kill REQUIRES this. Silent kill is rejected. */
export type KillPostmortem = {
  why: string;
  lessonsLearned: string;
  actionableInsights: string;
  evidenceLinks?: string[];
};

export const GATE_ENRICHMENT_TEXT_MAX = 280;
export const EVIDENCE_LINKS_MAX = 8;
export const PORTFOLIO_SCORE_MIN = 1;
export const PORTFOLIO_SCORE_MAX = 5;
export const PORTFOLIO_RANK_FORMULA = "impact + evidence + leverage";
export const PORTFOLIO_SCORE_OUT_OF_RANGE =
  "impact, evidence, and leverage must be integers 1–5";
export const PORTFOLIO_SKIP_NEED_TWO_LIVE =
  "portfolio scoring applies when two or more live (non-kill) ideas are on the board";
export const PORTFOLIO_KILLED_OUT =
  "killed ideas are out of the live portfolio";
export const PORTFOLIO_WHY_MAX = 280;
export const PORTFOLIO_WHY_REQUIRED = "why required";
export const PORTFOLIO_WHY_TOO_LONG = `why is short text (${PORTFOLIO_WHY_MAX})`;

/** Scores are labels. They cannot Advance, Iterate, Hold, or Kill. */
export function portfolioScoreMayPromote(): false {
  return false;
}

export function isPortfolioAxis(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= PORTFOLIO_SCORE_MIN && n <= PORTFOLIO_SCORE_MAX;
}

export function normalizePortfolioWhy(
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: PORTFOLIO_WHY_REQUIRED };
  }
  const trimmed = raw.trim();
  if (trimmed.length > PORTFOLIO_WHY_MAX) {
    return { ok: false, error: PORTFOLIO_WHY_TOO_LONG };
  }
  return { ok: true, value: trimmed };
}

export function normalizePortfolioScore(
  raw: unknown,
  meta?: { scoredAt?: string; scoredBy?: string; why?: string; requireWhy?: boolean },
): { ok: true; value: PortfolioScore } | { ok: false; error: string } {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ((raw as { portfolioScore?: unknown }).portfolioScore &&
        typeof (raw as { portfolioScore?: unknown }).portfolioScore === "object"
          ? ((raw as { portfolioScore: Record<string, unknown> }).portfolioScore)
          : (raw as Record<string, unknown>))
      : {};
  if (!isPortfolioAxis(src.impact) || !isPortfolioAxis(src.evidence) || !isPortfolioAxis(src.leverage)) {
    return { ok: false, error: PORTFOLIO_SCORE_OUT_OF_RANGE };
  }
  const requireWhy = meta?.requireWhy !== false;
  const whyRaw = meta?.why ?? src.why;
  let why = "";
  if (requireWhy) {
    const whyNorm = normalizePortfolioWhy(whyRaw);
    if (!whyNorm.ok) return whyNorm;
    why = whyNorm.value;
  } else if (typeof whyRaw === "string" && whyRaw.trim()) {
    why = whyRaw.trim().slice(0, PORTFOLIO_WHY_MAX);
  }
  const scoredAtRaw = meta?.scoredAt ?? src.scoredAt;
  const scoredByRaw = meta?.scoredBy ?? src.scoredBy;
  const scoredAt =
    typeof scoredAtRaw === "string" && scoredAtRaw.trim() ? scoredAtRaw.trim() : undefined;
  const scoredBy =
    typeof scoredByRaw === "string" && scoredByRaw.trim() ? scoredByRaw.trim() : undefined;
  return {
    ok: true,
    value: {
      impact: src.impact,
      evidence: src.evidence,
      leverage: src.leverage,
      ...(why ? { why } : {}),
      ...(scoredAt ? { scoredAt } : {}),
      ...(scoredBy ? { scoredBy } : {}),
    },
  };
}

/** Never invent a score on read. Missing or invalid axes → undefined. Do not invent why. */
export function portfolioScoreOf(idea: IdeaRow): PortfolioScore | undefined {
  if (idea.scoreboard.portfolioScore == null) return undefined;
  const hit = normalizePortfolioScore(idea.scoreboard.portfolioScore, { requireWhy: false });
  return hit.ok ? hit.value : undefined;
}

export function portfolioTotal(score: PortfolioScore): number {
  return score.impact + score.evidence + score.leverage;
}

export function isLiveIdea(idea: Pick<IdeaRow, "currentGate">): boolean {
  return idea.currentGate !== "kill";
}

export type PortfolioRankRow = {
  slug: string;
  name: string;
  impact: number;
  evidence: number;
  leverage: number;
  total: number;
  why?: string;
  scoredAt?: string;
  scoredBy?: string;
};

export type PortfolioView = {
  applies: boolean;
  reason?: string;
  formula: typeof PORTFOLIO_RANK_FORMULA;
  ranked: PortfolioRankRow[];
  unscored: Array<{ slug: string; name: string }>;
};

/** Live ideas only. Rank = impact + evidence + leverage. Never invent missing scores. */
export function portfolioViewOf(ideas: IdeaRow[]): PortfolioView {
  const live = ideas.filter(isLiveIdea);
  if (live.length < 2) {
    return {
      applies: false,
      reason: PORTFOLIO_SKIP_NEED_TWO_LIVE,
      formula: PORTFOLIO_RANK_FORMULA,
      ranked: [],
      unscored: [],
    };
  }
  const ranked: PortfolioRankRow[] = [];
  const unscored: Array<{ slug: string; name: string }> = [];
  for (const idea of live) {
    const score = portfolioScoreOf(idea);
    if (!score) {
      unscored.push({ slug: idea.slug, name: idea.name });
      continue;
    }
    ranked.push({
      slug: idea.slug,
      name: idea.name,
      impact: score.impact,
      evidence: score.evidence,
      leverage: score.leverage,
      total: portfolioTotal(score),
      ...(score.why ? { why: score.why } : {}),
      ...(score.scoredAt ? { scoredAt: score.scoredAt } : {}),
      ...(score.scoredBy ? { scoredBy: score.scoredBy } : {}),
    });
  }
  ranked.sort((a, b) => b.total - a.total || a.slug.localeCompare(b.slug));
  unscored.sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    applies: true,
    formula: PORTFOLIO_RANK_FORMULA,
    ranked,
    unscored,
  };
}

export type BoardClocksSnapshot = {
  journeyPhase: number;
  loopStage: number;
  currentGate: GateDecision;
  journeySpoken: string;
  loopSpoken: string;
};

export type BoardSnapshot = {
  clocks: BoardClocksSnapshot;
  scoreboard: Scoreboard;
};

/** Stored integers plus spoken 2.8.15 labels. Comments reuse this so clocksUnchanged matches idea.clocks. */
export function clocksOf(
  idea: Pick<IdeaRow, "journeyPhase" | "loopStage" | "currentGate">,
): BoardClocksSnapshot {
  return {
    journeyPhase: idea.journeyPhase,
    loopStage: idea.loopStage,
    currentGate: idea.currentGate,
    journeySpoken: JOURNEY_PHASES[idea.journeyPhase] ?? spokenJourneyOf(idea.journeyPhase).label,
    loopSpoken: LOOP_STAGES[idea.loopStage] ?? spokenLoopOf(idea.loopStage).label,
  };
}

export function ideaBoardSnapshot(idea: IdeaRow): BoardSnapshot {
  return {
    clocks: clocksOf(idea),
    scoreboard: { ...idea.scoreboard },
  };
}

function normalizeEvidenceLinks(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const links = raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 2048))
    .slice(0, EVIDENCE_LINKS_MAX);
  return links.length ? links : undefined;
}

function shortRequired(value: unknown, field: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${field} required` };
  }
  return { ok: true, value: value.trim().slice(0, GATE_ENRICHMENT_TEXT_MAX) };
}

export function normalizeGateEnrichment(
  raw: unknown,
): { ok: true; value: GateEnrichment } | { ok: false; error: string } {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ((raw as { gateEnrichment?: unknown }).gateEnrichment &&
        typeof (raw as { gateEnrichment?: unknown }).gateEnrichment === "object"
          ? ((raw as { gateEnrichment: Record<string, unknown> }).gateEnrichment)
          : (raw as Record<string, unknown>))
      : {};
  const changed = shortRequired(src.whatChanged, "whatChanged");
  if (!changed.ok) return { ok: false, error: "gate requires whatChanged and whatWereNotDoing" };
  const notDoing = shortRequired(src.whatWereNotDoing, "whatWereNotDoing");
  if (!notDoing.ok) return { ok: false, error: "gate requires whatChanged and whatWereNotDoing" };
  const evidenceLinks = normalizeEvidenceLinks(src.evidenceLinks);
  return {
    ok: true,
    value: {
      whatChanged: changed.value,
      whatWereNotDoing: notDoing.value,
      ...(evidenceLinks ? { evidenceLinks } : {}),
    },
  };
}

export function normalizeKillPostmortem(
  raw: unknown,
  why: string,
): { ok: true; value: KillPostmortem } | { ok: false; error: string } {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ((raw as { killPostmortem?: unknown }).killPostmortem &&
        typeof (raw as { killPostmortem?: unknown }).killPostmortem === "object"
          ? ((raw as { killPostmortem: Record<string, unknown> }).killPostmortem)
          : (raw as Record<string, unknown>))
      : {};
  const whyNorm = shortRequired(src.why ?? why, "why");
  const learned = shortRequired(src.lessonsLearned, "lessonsLearned");
  const insights = shortRequired(src.actionableInsights, "actionableInsights");
  if (!whyNorm.ok || !learned.ok || !insights.ok) {
    return { ok: false, error: "kill requires lessonsLearned and actionableInsights" };
  }
  const evidenceLinks = normalizeEvidenceLinks(
    src.evidenceLinks ??
      (raw && typeof raw === "object"
        ? (raw as { gateEnrichment?: { evidenceLinks?: unknown } }).gateEnrichment?.evidenceLinks
        : undefined),
  );
  return {
    ok: true,
    value: {
      why: whyNorm.value,
      lessonsLearned: learned.value,
      actionableInsights: insights.value,
      ...(evidenceLinks ? { evidenceLinks } : {}),
    },
  };
}

export function killPostmortemOf(idea: IdeaRow): KillPostmortem | undefined {
  const hit = normalizeKillPostmortem(idea.scoreboard.killPostmortem ?? idea.scoreboard, "");
  return hit.ok ? hit.value : undefined;
}

export function killedCardOf(idea: IdeaRow): string | undefined {
  if (idea.currentGate !== "kill") return undefined;
  const postmortem = killPostmortemOf(idea);
  return postmortem ? `☠ Killed — ${postmortem.lessonsLearned}` : "☠ Killed";
}

export type CompanyRow = {
  id: string;
  slug: string;
  label: string;
};

export type AclRow = {
  companyId: string;
  principal: string;
  principalKind: "email" | "sub";
  role: JourneyAclRole;
};

export type IdeaRow = {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  journeyPhase: number;
  loopStage: number;
  currentGate: GateDecision;
  scoreboard: Scoreboard;
};

export type GateEventRow = {
  id: string;
  ideaId: string;
  action: GateDecision;
  at: string;
  why: string;
  who: string;
};

export type CommentRow = {
  id: string;
  ideaId: string;
  body: string;
  at: string;
  who: string;
};

export type AuditEventRow = {
  id: string;
  companyId: string;
  ideaId: string | null;
  who: string;
  at: string;
  client: string;
  whatChanged: Record<string, unknown>;
};

export function isGateDecision(value: string): value is GateDecision {
  return (GATE_DECISIONS as readonly string[]).includes(value);
}

export function isJourneyPhase(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 9;
}

export function isLoopStage(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

export function defaultScoreboard(): Scoreboard {
  return {
    schema_version: SCOREBOARD_SCHEMA_VERSION,
    readyForHumanEyes: { status: "unknown" },
    autonomyPosture: "strict",
    openQuestions: [],
    constraint_this_week: "",
  };
}

export function constraintThisWeekOf(idea: IdeaRow): string {
  const raw = idea.scoreboard.constraint_this_week;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Teaching picture only. Not extra law. No celebrity names. */
export const CONSTRAINT_TEACHING_PICTURE =
  "Teaching picture, not extra law: the company only moves as fast as its weakest link. The platoon only moves as fast as the slowest soldier. Work that is not on that link is not progress.";

export const LANDING_PAGE_CONSTRAINT_REFUSE =
  "Refuse: “new landing page” is a fun side quest, not the honest biggest bottleneck, when no one has talked to customers. Founder may override with a written decision. Do not rubber-stamp.";

export function looksLikeNewLandingPageConstraint(text: string): boolean {
  return /\bnew\s+landing\s+page\b/i.test(text.trim());
}

export function ideaHasTalkedToCustomers(idea: IdeaRow): boolean {
  const n = idea.scoreboard.customerConversations;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return true;
  return idea.scoreboard.talkedToCustomers === true;
}

/** Preference / “this is interesting” cannot name the weekly constraint. */
export function preferenceMayNameConstraint(): false {
  return false;
}

/** Agent challenges; founder decides with a written override. */
export function agentMayRubberStampConstraint(): false {
  return false;
}

export function mayWriteConstraintThisWeek(input: {
  constraint: string;
  talkedToCustomers: boolean;
  founderWrittenDecision?: string;
}): { ok: true } | { ok: false; error: string } {
  const constraint = input.constraint.trim();
  if (!constraint) return { ok: true };
  const override = input.founderWrittenDecision?.trim() ?? "";
  if (looksLikeNewLandingPageConstraint(constraint) && !input.talkedToCustomers && !override) {
    return { ok: false, error: LANDING_PAGE_CONSTRAINT_REFUSE };
  }
  return { ok: true };
}

export function constraintChallengeOf(idea: IdeaRow): string | undefined {
  const constraint = constraintThisWeekOf(idea);
  if (looksLikeNewLandingPageConstraint(constraint) && !ideaHasTalkedToCustomers(idea)) {
    return "Challenge: this reads as a fun side quest, not the honest biggest bottleneck. No one has talked to customers. Preference cannot name it. Founder decides with a written override — do not rubber-stamp.";
  }
  return undefined;
}

export function normalizeConstraintThisWeek(
  value: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (value == null) {
    return { ok: true, value: "" };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "constraint_this_week is short text, not a clock" };
  }
  const trimmed = value.trim();
  if (trimmed.length > CONSTRAINT_THIS_WEEK_MAX) {
    return { ok: false, error: `constraint_this_week is short text (${CONSTRAINT_THIS_WEEK_MAX})` };
  }
  return { ok: true, value: trimmed };
}

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/** Same shape as company labels. New 0-1 boards use create_idea; put_journey does not invent a slug. */
export const IDEA_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const IDEA_NOT_FOUND_WRITE = "idea not found; call create_idea first";
export const IDEA_NOT_FOUND_COMMENT = "idea not found; call create_idea first";
export const IDEA_ALREADY_EXISTS = "idea already exists";

export function isIdeaSlug(raw: string): boolean {
  return IDEA_SLUG_RE.test(normalizeSlug(raw));
}

/** "CoreHaul" or "CoreHaul / last-mile" — company vs idea, not a composite key. */
export function parseJourneyQuery(input: {
  q?: string;
  company?: string;
  idea?: string;
}): { companySlug?: string; ideaSlug?: string } {
  let companySlug = input.company ? normalizeSlug(input.company) : undefined;
  let ideaSlug = input.idea ? normalizeSlug(input.idea) : undefined;
  const q = input.q?.trim();
  if (q) {
    const parts = q.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts[0] && !companySlug) companySlug = normalizeSlug(parts[0]);
    if (parts[1] && !ideaSlug) ideaSlug = normalizeSlug(parts[1]);
  }
  return { companySlug, ideaSlug };
}

export function actorMatchesAcl(actor: JourneyActor, row: AclRow): boolean {
  if (!actor.authenticated) return false;
  if (row.principalKind === "email") {
    return Boolean(actor.email && actor.email === row.principal);
  }
  return Boolean(actor.sub && actor.sub === row.principal);
}

export function rlsVisibleAcl(rows: AclRow[], actor: JourneyActor): AclRow[] {
  if (!actor.authenticated) return [];
  return rows.filter((row) => actorMatchesAcl(actor, row));
}

export function rlsVisibleCompanyIds(acl: AclRow[], actor: JourneyActor): Set<string> {
  return new Set(rlsVisibleAcl(acl, actor).map((row) => row.companyId));
}

export function roleOnCompany(
  acl: AclRow[],
  actor: JourneyActor,
  companyId: string,
): JourneyAclRole | undefined {
  const hits = rlsVisibleAcl(acl, actor).filter((row) => row.companyId === companyId);
  const order: JourneyAclRole[] = ["founder", "founder_authorized", "advisor"];
  for (const role of order) {
    if (hits.some((row) => row.role === role)) return role;
  }
  return undefined;
}

export function canReadCompany(acl: AclRow[], actor: JourneyActor, companyId: string): boolean {
  return roleOnCompany(acl, actor, companyId) !== undefined;
}

export function canWriteJourney(acl: AclRow[], actor: JourneyActor, companyId: string): boolean {
  const role = roleOnCompany(acl, actor, companyId);
  return role === "founder" || role === "founder_authorized";
}

/** Advisors post comments. Side table only. Comments never mutate phase/gate. */
export function canPostComment(acl: AclRow[], actor: JourneyActor, companyId: string): boolean {
  return roleOnCompany(acl, actor, companyId) === "advisor";
}

export function commentsMayMutateGate(): boolean {
  return false;
}

/** Cos digest / board “owner” is ACL founders — not a free-text field Cos invents. */
export function scoreboardMayCarryOwner(): false {
  return false;
}

/** Digests may not invent journey stage. Empty context stays unknown / none yet. */
export function digestMayInventStage(): false {
  return false;
}

/** Digests may not Advance. Advance / Iterate / Hold / Kill stay founder labels. */
export function digestMayAdvanceGate(): false {
  return false;
}

/** Prefer board_subscribers / notify_outbox over polling get_journey for Cos digests. */
export function preferWebhookOverPoll(): true {
  return true;
}

export const INVENTED_OWNER_KEYS = ["owner", "owners", "ownerName", "ownerEmail"] as const;

export type JourneyOwner = {
  principal: string;
  principalKind: AclRow["principalKind"];
  role: "founder";
};

export function ownersFromAcl(acl: AclRow[], companyId: string): JourneyOwner[] {
  return acl
    .filter((row) => row.companyId === companyId && row.role === "founder")
    .map((row) => ({
      principal: row.principal,
      principalKind: row.principalKind,
      role: "founder" as const,
    }));
}

export function companyAclView(
  acl: AclRow[],
  companyId: string,
): Array<{ principal: string; principalKind: AclRow["principalKind"]; role: JourneyAclRole }> {
  return acl
    .filter((row) => row.companyId === companyId)
    .map((row) => ({
      principal: row.principal,
      principalKind: row.principalKind,
      role: row.role,
    }));
}

export function stripInventedOwnerFields(scoreboard: Scoreboard): Scoreboard {
  const next: Record<string, unknown> = { ...scoreboard };
  for (const key of INVENTED_OWNER_KEYS) {
    delete next[key];
  }
  return next as Scoreboard;
}

export const JOURNEY_DIGEST_CONTRACT = {
  ownerSource: "acl",
  prefer: "webhook",
  poll: false,
  commentsNeverAdvance: true,
  inventStage: false,
} as const;

/** Advisors cannot write audit except via put_journey / post_comment / ACL tools. */
export function canWriteAuditDirectly(): boolean {
  return false;
}

export function auditEventsMayBeUpdated(): boolean {
  return false;
}

export function visualFlowMermaid(idea: IdeaRow, events: GateEventRow[]): string {
  const journey = spokenJourneyOf(idea.journeyPhase);
  const loop = spokenLoopOf(idea.loopStage);
  const phaseNodes = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    const mark = n === journey.rung ? ":::current" : "";
    return `    p${n}["${JOURNEY_SPOKEN[n]}"]${mark}`;
  }).join("\n");
  const phaseEdges = Array.from({ length: 4 }, (_, i) => `    p${i + 1} --> p${i + 2}`).join("\n");
  const loopNodes = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    const mark = n === loop.week ? ":::current" : "";
    return `    l${n}["${LOOP_SPOKEN[n]}"]${mark}`;
  }).join("\n");
  const loopEdges = Array.from({ length: 4 }, (_, i) => `    l${i + 1} --> l${i + 2}`).join("\n");
  const last = events
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-3)
    .map((e) => `    t${e.id.replace(/[^a-zA-Z0-9]/g, "")}["${e.action} · ${e.who}: ${escapeMermaid(e.why)}"]`)
    .join("\n");
  return [
    "```mermaid",
    "flowchart TB",
    "  classDef current fill:#111,color:#fff,stroke:#111;",
    "  subgraph journey [Journey]",
    phaseNodes,
    phaseEdges,
    "  end",
    "  subgraph loop [Loop]",
    loopNodes,
    loopEdges,
    "  end",
    `  gate["Gate: ${idea.currentGate}"]:::current`,
    `  help["Constraint this week: ${escapeMermaid(constraintThisWeekOf(idea) || "none yet")}"]`,
    "  p" + journey.rung + " --> gate",
    "  l" + loop.week + " --> gate",
    "  gate --> help",
    last ? "  subgraph last [Last transitions]\n" + last + "\n  end" : "",
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeMermaid(text: string): string {
  return text.replace(/["[\]]/g, " ").slice(0, 80);
}

export function twoMinuteSnapshot(
  company: CompanyRow,
  idea: IdeaRow,
  events: GateEventRow[],
  owners: JourneyOwner[] = [],
): string {
  const last = events.slice().sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const questions = idea.scoreboard.openQuestions ?? [];
  const eyes = idea.scoreboard.readyForHumanEyes?.status ?? "unknown";
  const constraint = constraintThisWeekOf(idea);
  const challenge = constraintChallengeOf(idea);
  const ownerLine = owners.length
    ? owners.map((row) => row.principal).join(", ")
    : "none on ACL — do not invent";
  return [
    `${company.label} / ${idea.name} — two-minute read`,
    `Owner (from ACL): ${ownerLine}`,
    `Constraint this week (honest biggest bottleneck; where help is required): ${constraint || "none yet"}`,
    CONSTRAINT_TEACHING_PICTURE,
    "Not a fun side quest. Preference / “this is interesting” cannot name it.",
    challenge,
    `Journey: ${formatSpokenJourney(idea.journeyPhase)}`,
    `Loop: ${formatSpokenLoop(idea.loopStage)}`,
    `Gate: ${idea.currentGate}`,
    idea.currentGate === "kill" ? killedCardOf(idea) : undefined,
    last
      ? `Last transition: ${last.action} by ${last.who} at ${last.at} — ${last.why}`
      : "Last transition: none yet",
    `Ready for human eyes: ${eyes} (not demand, not PMF)`,
    questions.length ? `Open questions: ${questions.join("; ")}` : "Open questions: none yet",
    "Company and idea are separate. This is a view, not a second app.",
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n");
}

export function meetingDocView(
  company: CompanyRow,
  idea: IdeaRow,
  events: GateEventRow[],
  comments: CommentRow[],
  owners: JourneyOwner[] = [],
): string {
  const progress =
    idea.scoreboard.progress?.length
      ? idea.scoreboard.progress.map((x) => `- ${x}`).join("\n")
      : `- Clocks at ${formatSpokenJourney(idea.journeyPhase)} / ${formatSpokenLoop(idea.loopStage)}, gate ${idea.currentGate}.`;
  const challenges =
    idea.scoreboard.challenges?.length
      ? idea.scoreboard.challenges.map((x) => `- ${x}`).join("\n")
      : (idea.scoreboard.openQuestions ?? []).map((x) => `- ${x}`).join("\n") ||
        "- None written. Do not invent.";
  const constraint = constraintThisWeekOf(idea);
  const extras =
    idea.scoreboard.helpNeeded?.length
      ? idea.scoreboard.helpNeeded.map((x) => `- ${x}`).join("\n")
      : "";
  const help = [
    `- Constraint this week (honest biggest bottleneck; where help is required): ${constraint || "none yet"}`,
    extras,
  ]
    .filter(Boolean)
    .join("\n");
  const advisorNotes = comments.length
    ? comments
        .slice()
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((c) => `- ${c.who} (${c.at}): ${c.body}`)
        .join("\n")
    : "- None.";
  const lastGates = events
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-5)
    .map((e) => `- ${e.at} ${e.action} (${e.who}): ${e.why}`)
    .join("\n");
  return [
    `# Where we are — ${company.label} / ${idea.name}`,
    "",
    twoMinuteSnapshot(company, idea, events, owners),
    "",
    "## Progress",
    progress,
    "",
    "## Challenges",
    challenges,
    "",
    "## Where help is needed",
    help,
    "",
    "## Last gates",
    lastGates || "- None yet.",
    "",
    "## Advisor comments (side table; never a gate)",
    advisorNotes,
    "",
    "_Generated as a view. Do not store a novel._",
  ].join("\n");
}

export type JourneyIdeaPayload = {
  slug: string;
  name: string;
  clocks: BoardClocksSnapshot;
  /** Fluid. Honest biggest bottleneck. Not a clock. Not tickets. */
  constraintThisWeek: string;
  constraintChallenge?: string;
  scoreboard: Scoreboard;
  /** Stored weekly labels only. Never invented on read. */
  portfolioScore?: PortfolioScore;
  gateEnrichment?: GateEnrichment;
  killed?: boolean;
  killPostmortem?: KillPostmortem;
  killedCard?: string;
  killedDecision?: { who: string; at: string; why: string };
  lastTransitions: GateEventRow[];
  visualFlow: string;
  snapshot: string;
  meetingDoc?: string;
  comments?: CommentRow[];
};

export function ideaPayload(
  company: CompanyRow,
  idea: IdeaRow,
  events: GateEventRow[],
  comments: CommentRow[],
  expandMeetingDoc: boolean,
  owners: JourneyOwner[] = [],
): JourneyIdeaPayload {
  const lastTransitions = events
    .filter((e) => e.ideaId === idea.id)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  const ideaComments = comments
    .filter((c) => c.ideaId === idea.id)
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at));
  const payload: JourneyIdeaPayload = {
    slug: idea.slug,
    name: idea.name,
    clocks: clocksOf(idea),
    constraintThisWeek: constraintThisWeekOf(idea),
    constraintChallenge: constraintChallengeOf(idea),
    scoreboard: idea.scoreboard,
    lastTransitions,
    visualFlow: visualFlowMermaid(idea, lastTransitions),
    snapshot: twoMinuteSnapshot(company, idea, lastTransitions, owners),
  };
  const storedScore = portfolioScoreOf(idea);
  if (storedScore) {
    payload.portfolioScore = storedScore;
  }
  if (idea.scoreboard.gateEnrichment) {
    payload.gateEnrichment = idea.scoreboard.gateEnrichment;
  }
  if (idea.currentGate === "kill") {
    payload.killed = true;
    const postmortem = killPostmortemOf(idea);
    if (postmortem) payload.killPostmortem = postmortem;
    payload.killedCard = killedCardOf(idea);
    const lastKill = lastTransitions.filter((e) => e.action === "kill").at(-1);
    if (lastKill) {
      payload.killedDecision = { who: lastKill.who, at: lastKill.at, why: lastKill.why };
    }
  }
  if (expandMeetingDoc) {
    payload.meetingDoc = meetingDocView(company, idea, lastTransitions, ideaComments, owners);
    payload.comments = ideaComments;
  }
  return payload;
}

export type JourneyStore = {
  readonly kind: "memory" | "pglite" | "supabase";
  actorOnAllowlist(actor: JourneyActor): boolean;
  getJourney(
    actor: JourneyActor,
    query: { companySlug?: string; ideaSlug?: string; expandMeetingDoc?: boolean },
  ): Promise<unknown>;
  createIdea(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug: string;
      name?: string;
      founderYes: boolean;
      why?: string;
      client?: string;
    },
  ): Promise<unknown>;
  putJourney(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      journeyPhase?: number;
      loopStage?: number;
      currentGate?: GateDecision;
      scoreboard?: Scoreboard;
      constraintThisWeek?: string;
      why: string;
      founderYes: boolean;
      founderWrittenDecision?: string;
      client?: string;
      gateEnrichment?: GateEnrichment;
      killPostmortem?: Omit<KillPostmortem, "why"> & { why?: string };
      portfolioScore?: PortfolioScore;
    },
  ): Promise<unknown>;
  putPortfolioScore(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      impact: number;
      evidence: number;
      leverage: number;
      why: string;
      founderYes: boolean;
      client?: string;
    },
  ): Promise<unknown>;
  listProvenance(
    actor: JourneyActor,
    query: { companySlug: string; ideaSlug?: string; from?: string; to?: string },
  ): Promise<unknown>;
  listKilledIdeas(
    actor: JourneyActor,
    query: { companySlug: string },
  ): Promise<unknown>;
  postComment(
    actor: JourneyActor,
    input: { companySlug: string; ideaSlug?: string; body: string; client?: string },
  ): Promise<unknown>;
  changeAcl(
    actor: JourneyActor,
    input: {
      companySlug: string;
      principal: string;
      principalKind: "email" | "sub";
      role: JourneyAclRole;
      op: "grant" | "revoke";
      client?: string;
    },
  ): Promise<unknown>;
  subscribeBoard(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      principal: string;
      principalKind: "email" | "sub";
      webhookUrl: string;
      emailOptIn?: boolean;
    },
  ): Promise<unknown>;
  unsubscribeBoard(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      principal: string;
      principalKind: "email" | "sub";
    },
  ): Promise<unknown>;
  listSubscribers(
    actor: JourneyActor,
    input: { companySlug: string },
  ): Promise<unknown>;
};

function notFound(message: string) {
  return { ok: false, error: message };
}

function forbidden(message: string) {
  return { ok: false, error: message };
}

export class MemoryJourneyStore implements JourneyStore {
  readonly kind = "memory" as const;
  private seq = 0;
  allowMemberComments = false;

  constructor(
    private companies: CompanyRow[],
    private acl: AclRow[],
    private ideas: IdeaRow[],
    private events: GateEventRow[],
    private comments: CommentRow[],
    private audit: AuditEventRow[] = [],
    private subscribers: BoardSubscriberRow[] = [],
    private notifyOutbox: NotifyOutboxRow[] = [],
    readonly webhookDeliveries: WebhookDelivery[] = [],
  ) {}

  actorOnAllowlist(actor: JourneyActor): boolean {
    return rlsVisibleAcl(this.acl, actor).length > 0;
  }

  ensureCompanyForMember(slug: string, actor: JourneyActor): CompanyRow {
    const want = normalizeSlug(slug);
    let company = this.companyBySlug(want);
    if (!company) {
      company = { id: this.nextId("co"), slug: want, label: want };
      this.companies.push(company);
      this.ideas.push({
        id: this.nextId("id"),
        companyId: company.id,
        slug: "default",
        name: want,
        journeyPhase: 1,
        loopStage: 1,
        currentGate: "hold",
        scoreboard: defaultScoreboard(),
      });
    }
    if (actor.email) {
      const exists = this.acl.some(
        (row) =>
          row.companyId === company.id &&
          row.principalKind === "email" &&
          row.principal === actor.email,
      );
      if (!exists) {
        this.acl.push({
          companyId: company.id,
          principal: actor.email,
          principalKind: "email",
          role: "founder_authorized",
        });
      }
    }
    return company;
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private companyBySlug(slug: string): CompanyRow | undefined {
    const want = normalizeSlug(slug);
    return this.companies.find((c) => c.slug === want);
  }

  private ideasFor(companyId: string, ideaSlug?: string): IdeaRow[] {
    const rows = this.ideas.filter((i) => i.companyId === companyId);
    if (!ideaSlug) return rows;
    const want = normalizeSlug(ideaSlug);
    return rows.filter((i) => i.slug === want);
  }

  private emitAudit(row: Omit<AuditEventRow, "id" | "at">): AuditEventRow {
    const event: AuditEventRow = {
      id: this.nextId("ae"),
      at: new Date().toISOString(),
      ...row,
    };
    this.audit.push(event);
    return event;
  }

  private auditFor(companyId: string, ideaId?: string): AuditEventRow[] {
    return this.audit
      .filter((row) => {
        if (row.companyId !== companyId) return false;
        if (!ideaId) return true;
        return row.ideaId === ideaId || row.ideaId === null;
      })
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async getJourney(
    actor: JourneyActor,
    query: { companySlug?: string; ideaSlug?: string; expandMeetingDoc?: boolean },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    if (!query.companySlug) {
      return notFound("company required");
    }
    const company = this.companyBySlug(query.companySlug);
    if (!company || !canReadCompany(this.acl, actor, company.id)) {
      return notFound("company not visible");
    }
    const ideas = this.ideasFor(company.id, query.ideaSlug);
    if (query.ideaSlug && ideas.length === 0) {
      return notFound("idea not visible");
    }
    const owners = ownersFromAcl(this.acl, company.id);
    const allIdeas = this.ideasFor(company.id);
    return {
      ok: true,
      company: { slug: company.slug, label: company.label },
      owners,
      acl: companyAclView(this.acl, company.id),
      digest: JOURNEY_DIGEST_CONTRACT,
      portfolio: portfolioViewOf(allIdeas),
      ideas: ideas.map((idea) =>
        ideaPayload(
          company,
          idea,
          this.events,
          this.comments,
          Boolean(query.expandMeetingDoc),
          owners,
        ),
      ),
      audit: this.auditFor(company.id, query.ideaSlug ? ideas[0]?.id : undefined),
      note: `Same payload for team / advisor / board / investor prep. Views are generated. Owner comes from ACL — do not invent. Prefer webhook notify over polling. Comments never mutate gates or Advance. constraint_this_week is the honest biggest bottleneck, not a fun side quest. ${CONSTRAINT_TEACHING_PICTURE} Audit is append-only. Portfolio scores are founder/advisor labels — they cannot Advance or Kill. Not ~/.bootstrap-os.`,
    };
  }

  async createIdea(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug: string;
      name?: string;
      founderYes: boolean;
      why?: string;
      client?: string;
    },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    if (!input.founderYes) {
      return forbidden("founder yes required in the agent chat — not a form, not mail");
    }
    if (!isIdeaSlug(input.ideaSlug)) {
      return forbidden("invalid idea slug");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || !canWriteJourney(this.acl, actor, company.id)) {
      return forbidden("founder or founder-authorized only");
    }
    const slug = normalizeSlug(input.ideaSlug);
    if (this.ideasFor(company.id, slug).length > 0) {
      return forbidden(IDEA_ALREADY_EXISTS);
    }
    const idea: IdeaRow = {
      id: this.nextId("id"),
      companyId: company.id,
      slug,
      name: input.name?.trim() || slug,
      journeyPhase: 1,
      loopStage: 1,
      currentGate: "hold",
      scoreboard: defaultScoreboard(),
    };
    this.ideas.push(idea);
    this.emitAudit({
      companyId: company.id,
      ideaId: idea.id,
      who: actor.principal,
      client: input.client?.trim() || "create_idea",
      whatChanged: {
        op: "create_idea",
        via: "create_idea",
        idea: slug,
        why: input.why?.trim() || "new 0-1 board",
        before: null,
        after: ideaBoardSnapshot(idea),
      },
    });
    return this.getJourney(actor, { companySlug: company.slug, ideaSlug: slug });
  }

  async putJourney(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      journeyPhase?: number;
      loopStage?: number;
      currentGate?: GateDecision;
      scoreboard?: Scoreboard;
      constraintThisWeek?: string;
      why: string;
      founderYes: boolean;
      founderWrittenDecision?: string;
      client?: string;
      gateEnrichment?: GateEnrichment;
      killPostmortem?: Omit<KillPostmortem, "why"> & { why?: string };
      portfolioScore?: PortfolioScore;
    },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    if (!input.founderYes) {
      return forbidden("founder yes required in the agent chat — not a form, not mail");
    }
    if (!input.why.trim()) {
      return forbidden("why required");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || !canWriteJourney(this.acl, actor, company.id)) {
      return forbidden("founder or founder-authorized only");
    }
    const ideas = this.ideasFor(company.id, input.ideaSlug);
    if (ideas.length !== 1) {
      return notFound(IDEA_NOT_FOUND_WRITE);
    }
    const idea = ideas[0];
    const before = ideaBoardSnapshot(idea);
    let nextScoreboard: Scoreboard = { ...idea.scoreboard };
    if (input.scoreboard) {
      const fromBoard = normalizeConstraintThisWeek(input.scoreboard.constraint_this_week);
      if (!fromBoard.ok) {
        return forbidden(fromBoard.error);
      }
      const incoming = stripInventedOwnerFields(input.scoreboard);
      nextScoreboard = {
        ...incoming,
        schema_version: input.scoreboard.schema_version ?? SCOREBOARD_SCHEMA_VERSION,
        constraint_this_week: fromBoard.value,
      };
      if (!("portfolioScore" in incoming) && idea.scoreboard.portfolioScore) {
        nextScoreboard.portfolioScore = idea.scoreboard.portfolioScore;
      }
    }
    if (input.constraintThisWeek !== undefined) {
      const normalized = normalizeConstraintThisWeek(input.constraintThisWeek);
      if (!normalized.ok) {
        return forbidden(normalized.error);
      }
      nextScoreboard = {
        ...nextScoreboard,
        schema_version: nextScoreboard.schema_version ?? SCOREBOARD_SCHEMA_VERSION,
        constraint_this_week: normalized.value,
      };
    }
    const proposed = {
      ...idea,
      scoreboard: nextScoreboard,
    };
    const constraintGate = mayWriteConstraintThisWeek({
      constraint: constraintThisWeekOf(proposed),
      talkedToCustomers: ideaHasTalkedToCustomers(proposed),
      founderWrittenDecision: input.founderWrittenDecision,
    });
    if (!constraintGate.ok) {
      return forbidden(constraintGate.error);
    }
    const clocksChanged =
      input.journeyPhase !== undefined ||
      input.loopStage !== undefined ||
      input.currentGate !== undefined;
    if (clocksChanged) {
      const gateRaw = input.gateEnrichment ?? nextScoreboard.gateEnrichment ?? nextScoreboard;
      const gateEnr = normalizeGateEnrichment(gateRaw);
      if (!gateEnr.ok) return forbidden(gateEnr.error);
      nextScoreboard = { ...nextScoreboard, gateEnrichment: gateEnr.value };
    }
    if (input.currentGate === "kill") {
      const killRaw = {
        ...(nextScoreboard.killPostmortem ?? {}),
        ...(input.killPostmortem ?? {}),
        gateEnrichment: nextScoreboard.gateEnrichment,
      };
      const killPm = normalizeKillPostmortem(killRaw, input.why);
      if (!killPm.ok) return forbidden(killPm.error);
      nextScoreboard = { ...nextScoreboard, killPostmortem: killPm.value };
    }
    const incomingScore = input.portfolioScore ?? input.scoreboard?.portfolioScore;
    let portfolioSkip: string | undefined;
    if (incomingScore !== undefined) {
      const scored = normalizePortfolioScore(incomingScore);
      if (!scored.ok) {
        return forbidden(scored.error);
      }
      const proposedGate = input.currentGate ?? idea.currentGate;
      const liveCount = this.ideasFor(company.id).filter((row) => {
        if (row.id === idea.id) return proposedGate !== "kill";
        return isLiveIdea(row);
      }).length;
      if (proposedGate === "kill") {
        if (idea.scoreboard.portfolioScore) {
          nextScoreboard.portfolioScore = idea.scoreboard.portfolioScore;
        } else {
          delete nextScoreboard.portfolioScore;
        }
        portfolioSkip = PORTFOLIO_KILLED_OUT;
      } else if (liveCount < 2) {
        if (idea.scoreboard.portfolioScore) {
          nextScoreboard.portfolioScore = idea.scoreboard.portfolioScore;
        } else {
          delete nextScoreboard.portfolioScore;
        }
        portfolioSkip = PORTFOLIO_SKIP_NEED_TWO_LIVE;
      } else {
        nextScoreboard.portfolioScore = {
          ...scored.value,
          scoredAt: new Date().toISOString(),
          scoredBy: actor.principal,
        };
      }
    }
    if (input.journeyPhase !== undefined) {
      if (!isJourneyPhase(input.journeyPhase)) {
        return forbidden("journey_phase is a strict enum 1-9");
      }
      idea.journeyPhase = input.journeyPhase;
    }
    if (input.loopStage !== undefined) {
      if (!isLoopStage(input.loopStage)) {
        return forbidden("loop_stage is a strict enum 1-7");
      }
      idea.loopStage = input.loopStage;
    }
    if (input.currentGate !== undefined) {
      if (!isGateDecision(input.currentGate)) {
        return forbidden("current_gate is a strict enum");
      }
      idea.currentGate = input.currentGate;
    }
    if (
      input.scoreboard ||
      input.constraintThisWeek !== undefined ||
      input.gateEnrichment ||
      input.killPostmortem ||
      incomingScore !== undefined ||
      clocksChanged
    ) {
      idea.scoreboard = nextScoreboard;
    }
    if (clocksChanged) {
      this.events.push({
        id: this.nextId("ge"),
        ideaId: idea.id,
        action: idea.currentGate,
        at: new Date().toISOString(),
        why: input.why,
        who: actor.principal,
      });
    }
    const audit = this.emitAudit({
      companyId: company.id,
      ideaId: idea.id,
      who: actor.principal,
      client: input.client?.trim() || "put_journey",
      whatChanged: {
        op: "put_journey",
        via: "put_journey",
        journeyPhase: idea.journeyPhase,
        loopStage: idea.loopStage,
        currentGate: idea.currentGate,
        constraint_this_week: constraintThisWeekOf(idea),
        why: input.why,
        gate: idea.currentGate,
        whatChanged: idea.scoreboard.gateEnrichment?.whatChanged,
        whatWereNotDoing: idea.scoreboard.gateEnrichment?.whatWereNotDoing,
        evidenceLinks: idea.scoreboard.gateEnrichment?.evidenceLinks,
        lessonsLearned: idea.scoreboard.killPostmortem?.lessonsLearned,
        actionableInsights: idea.scoreboard.killPostmortem?.actionableInsights,
        founderWrittenDecision: input.founderWrittenDecision?.trim() || undefined,
        before,
        after: ideaBoardSnapshot(idea),
      },
    });
    const notify = this.fireBoardNotify({
      company,
      idea,
      event: "put_journey",
      who: actor.principal,
      summary: summarizeBoardNotify({ event: "put_journey", why: input.why }),
    });
    return {
      ok: true,
      company: { slug: company.slug, label: company.label },
      owners: ownersFromAcl(this.acl, company.id),
      idea: ideaPayload(
        company,
        idea,
        this.events,
        this.comments,
        false,
        ownersFromAcl(this.acl, company.id),
      ),
      portfolio: portfolioViewOf(this.ideasFor(company.id)),
      ...(portfolioSkip ? { portfolioSkip } : {}),
      audit,
      notify,
    };
  }

  async putPortfolioScore(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      impact: number;
      evidence: number;
      leverage: number;
      why: string;
      founderYes: boolean;
      client?: string;
    },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    if (!input.founderYes) {
      return forbidden("founder yes required in the agent chat — not a form, not mail");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || !canWriteJourney(this.acl, actor, company.id)) {
      return forbidden("founder or founder-authorized only");
    }
    const ideas = this.ideasFor(company.id, input.ideaSlug);
    if (ideas.length !== 1) {
      return notFound(IDEA_NOT_FOUND_WRITE);
    }
    const idea = ideas[0];
    const scored = normalizePortfolioScore(
      {
        impact: input.impact,
        evidence: input.evidence,
        leverage: input.leverage,
        why: input.why,
      },
      { why: input.why, requireWhy: true },
    );
    if (!scored.ok) {
      return forbidden(scored.error);
    }
    if (!isLiveIdea(idea)) {
      return forbidden(PORTFOLIO_KILLED_OUT);
    }
    const liveCount = this.ideasFor(company.id).filter(isLiveIdea).length;
    if (liveCount < 2) {
      return {
        ok: true,
        skipped: true,
        reason: PORTFOLIO_SKIP_NEED_TWO_LIVE,
        company: { slug: company.slug, label: company.label },
        portfolio: portfolioViewOf(this.ideasFor(company.id)),
      };
    }
    const before = ideaBoardSnapshot(idea);
    const gate = idea.currentGate;
    idea.scoreboard = {
      ...idea.scoreboard,
      portfolioScore: {
        ...scored.value,
        scoredAt: new Date().toISOString(),
        scoredBy: actor.principal,
      },
    };
    if (idea.currentGate !== gate) {
      return forbidden("portfolio scores cannot change the gate");
    }
    const audit = this.emitAudit({
      companyId: company.id,
      ideaId: idea.id,
      who: actor.principal,
      client: input.client?.trim() || "put_portfolio_score",
      whatChanged: {
        op: "put_portfolio_score",
        via: "put_portfolio_score",
        why: scored.value.why,
        before,
        after: ideaBoardSnapshot(idea),
      },
    });
    return {
      ok: true,
      skipped: false,
      company: { slug: company.slug, label: company.label },
      owners: ownersFromAcl(this.acl, company.id),
      idea: ideaPayload(
        company,
        idea,
        this.events,
        this.comments,
        false,
        ownersFromAcl(this.acl, company.id),
      ),
      portfolio: portfolioViewOf(this.ideasFor(company.id)),
      audit,
    };
  }

  async postComment(
    actor: JourneyActor,
    input: { companySlug: string; ideaSlug?: string; body: string; client?: string },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    const company = this.companyBySlug(input.companySlug);
    const mayComment = this.allowMemberComments
      ? Boolean(company && canReadCompany(this.acl, actor, company.id))
      : Boolean(company && canPostComment(this.acl, actor, company.id));
    if (!company || !mayComment) {
      return forbidden("advisors post comments");
    }
    const ideas = this.ideasFor(company.id, input.ideaSlug);
    if (ideas.length !== 1) {
      return notFound(IDEA_NOT_FOUND_COMMENT);
    }
    const idea = ideas[0];
    const snap = ideaBoardSnapshot(idea);
    const before = snap.clocks;
    this.comments.push({
      id: this.nextId("c"),
      ideaId: idea.id,
      body: input.body,
      at: new Date().toISOString(),
      who: actor.principal,
    });
    const comment = this.comments.at(-1)!;
    const audit = this.emitAudit({
      companyId: company.id,
      ideaId: idea.id,
      who: actor.principal,
      client: input.client?.trim() || "post_comment",
      whatChanged: {
        op: "post_comment",
        via: "post_comment",
        commentId: comment.id,
        before: snap,
        after: snap,
      },
    });
    const notify = this.fireBoardNotify({
      company,
      idea,
      event: "post_comment",
      who: actor.principal,
      summary: summarizeBoardNotify({ event: "post_comment", commentBody: input.body }),
    });
    return {
      ok: true,
      clocksUnchanged: before,
      comment,
      audit,
      notify,
      note: "Comments hang off the idea. They never mutate phase or gate.",
    };
  }

  async changeAcl(
    actor: JourneyActor,
    input: {
      companySlug: string;
      principal: string;
      principalKind: "email" | "sub";
      role: JourneyAclRole;
      op: "grant" | "revoke";
      client?: string;
    },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || roleOnCompany(this.acl, actor, company.id) !== "founder") {
      return forbidden("founder only");
    }
    const principal =
      input.principalKind === "email" ? input.principal.trim().toLowerCase() : input.principal.trim();
    const existing = this.acl.find(
      (row) =>
        row.companyId === company.id &&
        row.principal === principal &&
        row.principalKind === input.principalKind,
    );
    const beforeAcl = existing
      ? { principal: existing.principal, principalKind: existing.principalKind, role: existing.role }
      : null;
    if (input.op === "grant") {
      const exists = this.acl.some(
        (row) =>
          row.companyId === company.id &&
          row.principal === principal &&
          row.principalKind === input.principalKind,
      );
      if (!exists) {
        this.acl.push({
          companyId: company.id,
          principal,
          principalKind: input.principalKind,
          role: input.role,
        });
      }
    } else {
      this.acl = this.acl.filter(
        (row) =>
          !(
            row.companyId === company.id &&
            row.principal === principal &&
            row.principalKind === input.principalKind
          ),
      );
    }
    const audit = this.emitAudit({
      companyId: company.id,
      ideaId: null,
      who: actor.principal,
      client: input.client?.trim() || "acl",
      whatChanged: {
        via: "acl",
        op: input.op,
        principalKind: input.principalKind,
        role: input.role,
        before: beforeAcl,
        after:
          input.op === "revoke"
            ? null
            : { principal, principalKind: input.principalKind, role: input.role },
      },
    });
    return { ok: true, audit };
  }

  private fireBoardNotify(input: {
    company: CompanyRow;
    idea?: IdeaRow | null;
    event: "put_journey" | "post_comment" | "gate_event";
    who: string;
    summary: string;
  }) {
    const fired = enqueueBoardNotify({
      subscribers: this.subscribers,
      acl: this.acl,
      company: input.company,
      idea: input.idea,
      event: input.event,
      who: input.who,
      summary: input.summary,
      nextId: (prefix) => this.nextId(prefix),
    });
    this.notifyOutbox.push(...fired.outbox);
    this.webhookDeliveries.push(...fired.deliveries);
    return {
      webhook: fired.deliveries.length,
      emailQueued: fired.outbox.filter((row) => row.channel === "email").length,
    };
  }

  async subscribeBoard(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      principal: string;
      principalKind: "email" | "sub";
      webhookUrl: string;
      emailOptIn?: boolean;
    },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || !canWriteJourney(this.acl, actor, company.id)) {
      return forbidden("founder or founder-authorized grant only");
    }
    const principal = normalizeSubscribePrincipal(input.principal, input.principalKind);
    if (!subscriberHasAclAccess(this.acl, company.id, principal, input.principalKind)) {
      return forbidden("subscriber must already have ACL access");
    }
    if (!isHttpsWebhookUrl(input.webhookUrl)) {
      return forbidden("webhook URL must be https");
    }
    let ideaId: string | null = null;
    if (input.ideaSlug) {
      const ideas = this.ideasFor(company.id, input.ideaSlug);
      if (ideas.length !== 1) return notFound("idea not visible");
      ideaId = ideas[0].id;
    }
    const exists = this.subscribers.some((row) =>
      sameSubscriberScope(row, {
        companyId: company.id,
        ideaId,
        principal,
        principalKind: input.principalKind,
      }),
    );
    if (!exists) {
      this.subscribers.push({
        id: this.nextId("sub"),
        companyId: company.id,
        ideaId,
        principal,
        principalKind: input.principalKind,
        webhookUrl: input.webhookUrl.trim(),
        emailOptIn: Boolean(input.emailOptIn),
        createdBy: actor.principal,
      });
      this.emitAudit({
        companyId: company.id,
        ideaId,
        who: actor.principal,
        client: "subscribe_board",
        whatChanged: {
          op: "INSERT",
          via: "subscribe_board",
          // webhookUrl stays on list_subscribers. Do not archive it in provenance.
          before: null,
          after: {
            principal,
            principalKind: input.principalKind,
            emailOptIn: Boolean(input.emailOptIn),
            ideaId,
          },
        },
      });
    }
    return {
      ok: true,
      subscriber: this.subscribers.find((row) =>
        sameSubscriberScope(row, {
          companyId: company.id,
          ideaId,
          principal,
          principalKind: input.principalKind,
        }),
      ),
    };
  }

  async unsubscribeBoard(
    actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      principal: string;
      principalKind: "email" | "sub";
    },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || !canWriteJourney(this.acl, actor, company.id)) {
      return forbidden("founder or founder-authorized grant only");
    }
    const principal = normalizeSubscribePrincipal(input.principal, input.principalKind);
    let ideaId: string | null = null;
    if (input.ideaSlug) {
      const ideas = this.ideasFor(company.id, input.ideaSlug);
      if (ideas.length !== 1) return notFound("idea not visible");
      ideaId = ideas[0].id;
    }
    const existing = this.subscribers.find((row) =>
      sameSubscriberScope(row, {
        companyId: company.id,
        ideaId,
        principal,
        principalKind: input.principalKind,
      }),
    );
    const beforeCount = this.subscribers.length;
    this.subscribers = this.subscribers.filter(
      (row) =>
        !sameSubscriberScope(row, {
          companyId: company.id,
          ideaId,
          principal,
          principalKind: input.principalKind,
        }),
    );
    const removed = beforeCount - this.subscribers.length;
    if (existing && removed > 0) {
      this.emitAudit({
        companyId: company.id,
        ideaId,
        who: actor.principal,
        client: "unsubscribe_board",
        whatChanged: {
          op: "DELETE",
          via: "unsubscribe_board",
          before: {
            principal: existing.principal,
            principalKind: existing.principalKind,
            emailOptIn: existing.emailOptIn,
            ideaId: existing.ideaId,
          },
          after: null,
        },
      });
    }
    return { ok: true, removed };
  }

  async listProvenance(
    actor: JourneyActor,
    query: { companySlug: string; ideaSlug?: string; from?: string; to?: string },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    const company = this.companyBySlug(query.companySlug);
    if (!company || !canReadCompany(this.acl, actor, company.id)) {
      return notFound("company not visible");
    }
    const ideas = this.ideasFor(company.id, query.ideaSlug);
    if (query.ideaSlug && ideas.length === 0) {
      return notFound("idea not visible");
    }
    const ideaId = query.ideaSlug ? ideas[0]?.id : undefined;
    const fromMs = query.from ? Date.parse(query.from) : Number.NaN;
    const toMs = query.to ? Date.parse(query.to) : Number.NaN;
    const inRange = (iso: string) => {
      const t = Date.parse(iso);
      if (Number.isFinite(fromMs) && t < fromMs) return false;
      if (Number.isFinite(toMs) && t > toMs) return false;
      return true;
    };
    const slugOf = (id: string | null) =>
      id ? (this.ideas.find((row) => row.id === id)?.slug ?? null) : null;
    const audit = this.audit
      .filter((row) => {
        if (row.companyId !== company.id) return false;
        if (ideaId && row.ideaId !== ideaId) return false;
        return inRange(row.at);
      })
      .map((row) => ({
        at: row.at,
        who: row.who,
        client: row.client,
        ideaSlug: slugOf(row.ideaId),
        whatChanged: row.whatChanged,
      }));
    const gateEvents = this.events
      .filter((row) => {
        const idea = this.ideas.find((i) => i.id === row.ideaId);
        if (!idea || idea.companyId !== company.id) return false;
        if (ideaId && row.ideaId !== ideaId) return false;
        return inRange(row.at);
      })
      .map((row) => ({
        at: row.at,
        who: row.who,
        action: row.action,
        why: row.why,
        ideaSlug: slugOf(row.ideaId),
      }));
    const events = [
      ...audit.map((row) => ({ kind: "audit" as const, ...row })),
      ...gateEvents.map((row) => ({ kind: "gate" as const, ...row })),
    ].sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind));
    return {
      ok: true,
      company: { slug: company.slug, label: company.label },
      idea: query.ideaSlug ? normalizeSlug(query.ideaSlug) : null,
      events,
      audit,
      gateEvents,
    };
  }

  async listKilledIdeas(
    actor: JourneyActor,
    query: { companySlug: string },
  ): Promise<unknown> {
    const board = (await this.getJourney(actor, { companySlug: query.companySlug })) as {
      ok?: boolean;
      error?: string;
      company?: { slug: string; label: string };
      ideas?: JourneyIdeaPayload[];
    };
    if (!board.ok) return board;
    return {
      ok: true,
      company: board.company,
      ideas: (board.ideas ?? [])
        .filter((idea) => idea.clocks.currentGate === "kill")
        .map((idea) => ({
          slug: idea.slug,
          name: idea.name,
          clocks: idea.clocks,
          gateEnrichment: idea.gateEnrichment,
          killPostmortem: idea.killPostmortem,
          killedCard: idea.killedCard,
          killedDecision: idea.killedDecision,
        })),
    };
  }

  async listSubscribers(
    actor: JourneyActor,
    input: { companySlug: string },
  ): Promise<unknown> {
    if (!actor.authenticated || !actor.principal) {
      return forbidden("unauthenticated");
    }
    const company = this.companyBySlug(input.companySlug);
    if (!company || !canReadCompany(this.acl, actor, company.id)) {
      return notFound("company not visible");
    }
    return {
      ok: true,
      company: { slug: company.slug, label: company.label },
      subscribers: this.subscribers
        .filter((row) => row.companyId === company.id)
        .map((row) => ({
          principal: row.principal,
          principalKind: row.principalKind,
          emailOptIn: row.emailOptIn,
          ideaId: row.ideaId,
          webhookUrl: row.webhookUrl,
        })),
    };
  }
}

/** PGlite fixture principals. Synthetic. Real FAST emails are not in git. */
export const JOURNEY_FIXTURE = {
  companies: [
    { id: "co-dye", slug: "dyeconverter", label: "DyeConverter" },
    { id: "co-core", slug: "corehaul", label: "CoreHaul" },
  ] satisfies CompanyRow[],
  acl: [
    {
      companyId: "co-dye",
      principal: "founder-dye@example.test",
      principalKind: "email" as const,
      role: "founder" as const,
    },
    {
      companyId: "co-core",
      principal: "founder-core@example.test",
      principalKind: "email" as const,
      role: "founder" as const,
    },
    {
      companyId: "co-core",
      principal: "sub-only-corehaul",
      principalKind: "sub" as const,
      role: "founder" as const,
    },
    {
      companyId: "co-dye",
      principal: "advisor-cos@example.test",
      principalKind: "email" as const,
      role: "advisor" as const,
    },
    {
      companyId: "co-core",
      principal: "advisor-cos@example.test",
      principalKind: "email" as const,
      role: "advisor" as const,
    },
    {
      companyId: "co-dye",
      principal: "authorized-dye@example.test",
      principalKind: "email" as const,
      role: "founder_authorized" as const,
    },
  ] satisfies AclRow[],
  ideas: [
    {
      id: "idea-dye",
      companyId: "co-dye",
      slug: "dyeconverter",
      name: "DyeConverter",
      journeyPhase: 1,
      loopStage: 1,
      currentGate: "hold" as const,
      scoreboard: defaultScoreboard(),
    },
    {
      id: "idea-core",
      companyId: "co-core",
      slug: "corehaul",
      name: "CoreHaul",
      journeyPhase: 1,
      loopStage: 1,
      currentGate: "hold" as const,
      scoreboard: defaultScoreboard(),
    },
  ] satisfies IdeaRow[],
};

export function fixtureJourneyStore(): MemoryJourneyStore {
  return new MemoryJourneyStore(
    JOURNEY_FIXTURE.companies.map((c) => ({ ...c })),
    JOURNEY_FIXTURE.acl.map((a) => ({ ...a })),
    JOURNEY_FIXTURE.ideas.map((i) => ({
      ...i,
      scoreboard: {
        ...i.scoreboard,
        openQuestions: [...(i.scoreboard.openQuestions ?? [])],
        constraint_this_week: i.scoreboard.constraint_this_week ?? "",
      },
    })),
    [],
    [],
  );
}

let testStore: JourneyStore | null | undefined;

export function setJourneyStoreForTests(store: JourneyStore | null | undefined): void {
  testStore = store;
}

let liveStoreFactory: ((accessToken?: string) => JourneyStore | null) | undefined;

export function setLiveJourneyStoreFactory(
  factory: ((accessToken?: string) => JourneyStore | null) | undefined,
): void {
  liveStoreFactory = factory;
}

export function resolveJourneyStore(accessToken?: string): JourneyStore | null {
  if (testStore !== undefined) return testStore;
  return liveStoreFactory?.(accessToken) ?? null;
}

/**
 * Shape Up test. Scoreboard JSON only. No schema change.
 * Spend is owner-entered scoreboard.pnl.costs. There is no other spend ledger.
 */

export const SHAPE_UP_KEYS = ["appetite", "breaker", "shape_up_test", "breaker_state"] as const;

/** The one real fleet company. Not an env var. Not a client field. */
export const SHAPE_UP_FLEET_SLUG = "pirin";

/** Fictional company slug for tests. Not a live company. Not an allowlist entry. */
export const SHAPE_UP_FIXTURE_SLUG = "shapeup-fixture";

/** Real allowlist. The fixture slug is added only by allowShapeUpSlugForTests. */
export const SHAPE_UP_COMPANY_SLUGS: readonly string[] = [SHAPE_UP_FLEET_SLUG];

const testSlugs = new Set<string>();

/** Tests only. Does not add a second real company. */
export function allowShapeUpSlugForTests(slug: string): void {
  const trimmed = slug.trim().toLowerCase();
  if (trimmed) testSlugs.add(trimmed);
}

export const TOOL_CHECK_BREAKERS =
  "Internal allowlist tool. Compare kill_on and owner-entered pnl.costs with the appetite. Set breaker_state to tripped and post one nudge per breach. Do not change the gate.";

export type ShapeUpBreach = "kill_on" | "spend";

export type ShapeUpNudge = { card_id: string; breach: ShapeUpBreach };

export type ShapeUpCard = {
  id: string;
  slug: string;
  gate: string;
  scoreboard: Record<string, unknown>;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BOT_CLIENT = /(^|[^a-z0-9])bot([^a-z0-9]|$)/i;

export function shapeUpEnabled(companySlug: string | undefined): boolean {
  const slug = (companySlug ?? "").trim().toLowerCase();
  return SHAPE_UP_COMPANY_SLUGS.includes(slug) || testSlugs.has(slug);
}

export function shapeUpToolVisible(labels: readonly string[]): boolean {
  return labels.some((label) => shapeUpEnabled(label));
}

export function isBotClient(client: string | undefined): boolean {
  return BOT_CLIENT.test(client ?? "");
}

/** Owner is the ACL founder. A bot client cannot confirm, even as founder. */
export function confirmKillDenial(input: {
  client?: string;
  role?: string;
}): "bot" | "non_owner" | null {
  if (isBotClient(input.client)) return "bot";
  if (input.role !== "founder") return "non_owner";
  return null;
}

export function validateShapeUpPut(companySlug: string, scoreboard: unknown): string | null {
  if (!scoreboard || typeof scoreboard !== "object" || Array.isArray(scoreboard)) return null;
  const record = scoreboard as Record<string, unknown>;
  if ("breaker_state" in record) return "breaker_state is server-written";
  const present = SHAPE_UP_KEYS.filter((key) => key in record);
  if (present.length === 0) return null;
  if (!shapeUpEnabled(companySlug)) return "shape up is not enabled for this company";
  if ("shape_up_test" in record && record.shape_up_test !== true) {
    return "shape_up_test must be true";
  }
  if ("appetite" in record) {
    const appetiteError = validateAppetite(record.appetite);
    if (appetiteError) return appetiteError;
  }
  if ("breaker" in record) {
    const breakerError = validateBreaker(record.breaker);
    if (breakerError) return breakerError;
  }
  return null;
}

function validateAppetite(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "appetite must be an object";
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "weeks" && key !== "usd_cap")) return "appetite has an unknown key";
  if (!Number.isInteger(record.weeks) || (record.weeks as number) <= 0) return "appetite.weeks must be an integer > 0";
  if (typeof record.usd_cap !== "number" || !Number.isFinite(record.usd_cap) || record.usd_cap < 0) {
    return "appetite.usd_cap must be a number >= 0";
  }
  return null;
}

function validateBreaker(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "breaker must be an object";
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "kill_on" && key !== "rule")) return "breaker has an unknown key";
  if (typeof record.kill_on !== "string" || !isIsoDay(record.kill_on)) return "breaker.kill_on must be an ISO date";
  if (typeof record.rule !== "string" || record.rule.length > 280) return "breaker.rule must be a string of at most 280 characters";
  return null;
}

function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function chicagoDay(now: Date): { weekday: string; iso: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: pick("weekday"), iso: `${pick("year")}-${pick("month")}-${pick("day")}` };
}

export function isChicagoSunday(now: Date): boolean {
  return chicagoDay(now).weekday === "Sun";
}

function numericCosts(scoreboard: Record<string, unknown>): number | undefined {
  const pnl = scoreboard.pnl;
  if (!pnl || typeof pnl !== "object" || Array.isArray(pnl)) return undefined;
  const record = pnl as { costs?: unknown; costsUnknown?: unknown };
  if (record.costsUnknown === true) return undefined;
  if (typeof record.costs !== "number" || !Number.isFinite(record.costs)) return undefined;
  return record.costs;
}

function usdCap(scoreboard: Record<string, unknown>): number | undefined {
  const appetite = scoreboard.appetite;
  if (!appetite || typeof appetite !== "object" || Array.isArray(appetite)) return undefined;
  const cap = (appetite as { usd_cap?: unknown }).usd_cap;
  if (typeof cap !== "number" || !Number.isFinite(cap)) return undefined;
  return cap;
}

export function nudgeMarker(cardId: string, breach: ShapeUpBreach): string {
  return JSON.stringify({ card_id: cardId, breach });
}

export function parseNudgeMarker(body: string): ShapeUpNudge | null {
  try {
    const parsed = JSON.parse(body) as { card_id?: unknown; breach?: unknown };
    if (typeof parsed.card_id !== "string") return null;
    if (parsed.breach !== "kill_on" && parsed.breach !== "spend") return null;
    return { card_id: parsed.card_id, breach: parsed.breach };
  } catch {
    return null;
  }
}

export function storedNudges(scoreboard: Record<string, unknown>, comments: readonly string[]): ShapeUpNudge[] {
  const fromBoard = Array.isArray(scoreboard.shape_up_nudges)
    ? scoreboard.shape_up_nudges.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const cardId = (row as { card_id?: unknown }).card_id;
        const breach = (row as { breach?: unknown }).breach;
        if (typeof cardId !== "string") return [];
        if (breach !== "kill_on" && breach !== "spend") return [];
        return [{ card_id: cardId, breach: breach as ShapeUpBreach }];
      })
    : [];
  const fromComments = comments.flatMap((body) => {
    const hit = parseNudgeMarker(body);
    return hit ? [hit] : [];
  });
  return [...fromBoard, ...fromComments];
}

export function breachesForCard(card: ShapeUpCard, now: Date): ShapeUpBreach[] {
  if (card.gate === "kill") return [];
  if (card.scoreboard.shape_up_test !== true) return [];
  const cap = usdCap(card.scoreboard);
  const costs = numericCosts(card.scoreboard);
  const overDouble = cap !== undefined && costs !== undefined && costs > cap * 2;
  if (isChicagoSunday(now) && !overDouble) return [];
  const hits: ShapeUpBreach[] = [];
  const breaker = card.scoreboard.breaker;
  const killOn =
    breaker && typeof breaker === "object" && !Array.isArray(breaker)
      ? (breaker as { kill_on?: unknown }).kill_on
      : undefined;
  if (typeof killOn === "string" && isIsoDay(killOn) && chicagoDay(now).iso > killOn) hits.push("kill_on");
  if (cap !== undefined && costs !== undefined && costs >= cap) hits.push("spend");
  return hits;
}

export type ShapeUpAction = { card: ShapeUpCard; breach: ShapeUpBreach };

export function pendingBreakerActions(
  cards: readonly ShapeUpCard[],
  comments: readonly string[],
  now: Date,
): ShapeUpAction[] {
  const actions: ShapeUpAction[] = [];
  for (const card of cards) {
    const already = new Set(
      storedNudges(card.scoreboard, comments)
        .filter((row) => row.card_id === card.id)
        .map((row) => row.breach),
    );
    for (const breach of breachesForCard(card, now)) {
      if (!already.has(breach)) actions.push({ card, breach });
    }
  }
  return actions;
}

export function cardsFromJourneyPayload(payload: unknown): ShapeUpCard[] {
  if (!payload || typeof payload !== "object") return [];
  const ideas = (payload as { ideas?: unknown }).ideas;
  if (!Array.isArray(ideas)) return [];
  return ideas.flatMap((idea) => {
    if (!idea || typeof idea !== "object") return [];
    const row = idea as { id?: unknown; slug?: unknown; clocks?: { currentGate?: unknown }; scoreboard?: unknown };
    const slug = typeof row.slug === "string" ? row.slug : "";
    const id = typeof row.id === "string" ? row.id : slug;
    if (!id) return [];
    const scoreboard =
      row.scoreboard && typeof row.scoreboard === "object" && !Array.isArray(row.scoreboard)
        ? (row.scoreboard as Record<string, unknown>)
        : {};
    const gate = typeof row.clocks?.currentGate === "string" ? row.clocks.currentGate : "hold";
    return [{ id, slug, gate, scoreboard }];
  });
}

export function commentBodiesFromJourney(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const ideas = (payload as { ideas?: unknown }).ideas;
  if (!Array.isArray(ideas)) return [];
  return ideas.flatMap((idea) => {
    if (!idea || typeof idea !== "object") return [];
    const comments = (idea as { comments?: unknown }).comments;
    if (!Array.isArray(comments)) return [];
    return comments.flatMap((comment) => {
      if (!comment || typeof comment !== "object") return [];
      const body = (comment as { body?: unknown }).body;
      return typeof body === "string" ? [body] : [];
    });
  });
}

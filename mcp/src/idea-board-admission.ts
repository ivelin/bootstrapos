/**
 * OS 2.8.18 — idea-board admission by bet class.
 *
 * An idea board is a customer thesis. Admit when the why is a named-group
 * kill line about pay or use. Reject when the primary object of the bet is a
 * person, hire, FAST/SAFE/SOPA/83(b), investor, contractor, employee,
 * consultant, or channel-partner-as-the-bet.
 *
 * Named-group kill line wins. Mere keywords in a real product why do not
 * reject. This is a rewrite of class, not a deny-list of words.
 *
 * No third clock. No schema bump. Relationship rows stay in the founder's
 * instrument tracker / cap table / matching sheet.
 */

export type BetClass = "product" | "relationship" | "instrument";

export const IDEA_BOARD_ADMISSION_REJECTED =
  "idea board is a customer thesis — hold this in the relationship book / instrument tracker (instrument state + Clock date + next action + last observed fact). Not a journey, not an Ask-Do card, not portfolio I-E-L";

export const RELATIONSHIP_SHELF_LINE =
  "Relationship shelf — not a journey. Hold in the founder's instrument tracker / cap table / matching sheet. Measure instrument state + Clock date + next action + last observed fact — not a journey, not an Ask-Do card, not portfolio I-E-L.";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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

export function classifyBetClass(text: string): BetClass {
  const t = normalize(text);
  if (hasNamedGroupKillLine(t)) return "product";
  if (instrumentIsPrimaryObject(t)) return "instrument";
  if (relationshipIsPrimaryObject(t)) return "relationship";
  return "relationship";
}

export function admitIdeaBoardWhy(
  why: string | undefined,
): { ok: true; class: "product" } | { ok: false; error: string; class: BetClass } {
  const t = normalize(why ?? "");
  if (!t) {
    return { ok: false, error: IDEA_BOARD_ADMISSION_REJECTED, class: "relationship" };
  }
  if (hasNamedGroupKillLine(t)) {
    return { ok: true, class: "product" };
  }
  const betClass = classifyBetClass(t);
  return { ok: false, error: IDEA_BOARD_ADMISSION_REJECTED, class: betClass };
}

/**
 * Existing slugs: shelf only on a positive relationship/instrument primary
 * object. Missing kill line on an old product board is not a shelf.
 */
export function detectStoredBetClass(texts: readonly string[]): {
  class: BetClass;
  shelf: boolean;
} {
  const blob = texts.map(normalize).filter(Boolean).join(" \n ");
  if (!blob) return { class: "product", shelf: false };
  if (hasNamedGroupKillLine(blob)) return { class: "product", shelf: false };
  if (instrumentIsPrimaryObject(blob)) return { class: "instrument", shelf: true };
  if (relationshipIsPrimaryObject(blob)) return { class: "relationship", shelf: true };
  return { class: "product", shelf: false };
}

export function isRelationshipShelf(
  idea: { name?: string; scoreboard?: { hypothesis?: string } },
  lastWhy?: string,
): boolean {
  return detectStoredBetClass([
    idea.name ?? "",
    idea.scoreboard?.hypothesis ?? "",
    lastWhy ?? "",
  ]).shelf;
}

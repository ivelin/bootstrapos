/**
 * OS 2.8.15 clock shrink — isolated remap. OS 2.8.17: loop is implicit.
 *
 * Stored integers stay 1–9 (journey) and 1–7 (loop). No schema bump.
 * Spoken / rendered uses five journey rungs. Ask / Do / Write back is a
 * quality bar on the week's artifact, not a stored week verb and not card
 * position. get_journey may still return stored 1–7 for back-compat.
 * Stored 8 or 9 stay at Try — do not invent Advance.
 * Grow is an after-proof pack after Try, not a sixth rung.
 *
 * Name rule: journey = place names (Bet / Filter / Ground / Build / Try).
 * Loop verbs = quality bar + clock-examples teaching only.
 * Never put “synthetic research” or “real users” on both clocks.
 * Do takes the station’s shape. It is not a synonym for Build.
 * Make / Check / Hear are not loop weeks.
 */

export const JOURNEY_SPOKEN: Record<number, string> = {
  1: "Write the bet",
  2: "Filter cheaply",
  3: "Ground it",
  4: "Build tiny slice",
  5: "Try with real people",
};

export const LOOP_SPOKEN: Record<number, string> = {
  1: "Ask",
  2: "Do",
  3: "Write back",
};

export const CLOCK_REMAP_NOTE =
  "Stored integers stay 1–9 (journey) and 1–7 (loop). Journey spoken/rendered uses five rungs. Ask / Do / Write back is a quality bar, not a card. 8 or 9 stay at Try until founder Advance. Grow is an after-proof pack, not a sixth rung. No invented Advance. Make / Check / Hear are not loop weeks.";

export const JOURNEY_STORED_MAP: Record<string, string> = {
  "1 or 2": "Write the bet",
  "3": "Filter cheaply",
  "4": "Ground it",
  "5 or 6": "Build tiny slice",
  "7": "Try with real people",
  "8 or 9": "Try with real people (stay until founder Advance; grow pack only if proof exists)",
};

export const LOOP_STORED_MAP: Record<string, string> = {
  "1 or 2": "Ask",
  "3–6": "Do",
  "7": "Write back",
};

export function spokenJourneyOf(stored: number): { rung: number; label: string } {
  if (!Number.isInteger(stored) || stored < 1) {
    return { rung: 1, label: JOURNEY_SPOKEN[1] };
  }
  if (stored <= 2) return { rung: 1, label: JOURNEY_SPOKEN[1] };
  if (stored === 3) return { rung: 2, label: JOURNEY_SPOKEN[2] };
  if (stored === 4) return { rung: 3, label: JOURNEY_SPOKEN[3] };
  if (stored <= 6) return { rung: 4, label: JOURNEY_SPOKEN[4] };
  return { rung: 5, label: JOURNEY_SPOKEN[5] };
}

export function spokenLoopOf(stored: number): { week: number; label: string } {
  if (!Number.isInteger(stored) || stored < 1) {
    return { week: 1, label: LOOP_SPOKEN[1] };
  }
  if (stored <= 2) return { week: 1, label: LOOP_SPOKEN[1] };
  if (stored <= 6) return { week: 2, label: LOOP_SPOKEN[2] };
  return { week: 3, label: LOOP_SPOKEN[3] };
}

/** Stored 1–9 → spoken label. Same keys as live boards. Do not rewrite stored values. */
export const JOURNEY_PHASES: Record<number, string> = {
  1: JOURNEY_SPOKEN[1],
  2: JOURNEY_SPOKEN[1],
  3: JOURNEY_SPOKEN[2],
  4: JOURNEY_SPOKEN[3],
  5: JOURNEY_SPOKEN[4],
  6: JOURNEY_SPOKEN[4],
  7: JOURNEY_SPOKEN[5],
  8: JOURNEY_SPOKEN[5],
  9: JOURNEY_SPOKEN[5],
};

/** Stored 1–7 → spoken label. Same keys as live boards. */
export const LOOP_STAGES: Record<number, string> = {
  1: LOOP_SPOKEN[1],
  2: LOOP_SPOKEN[1],
  3: LOOP_SPOKEN[2],
  4: LOOP_SPOKEN[2],
  5: LOOP_SPOKEN[2],
  6: LOOP_SPOKEN[2],
  7: LOOP_SPOKEN[3],
};

export function nextSpokenJourney(stored: number): { rung: number; label: string } | null {
  const cur = spokenJourneyOf(stored);
  if (cur.rung >= 5) return null;
  const rung = cur.rung + 1;
  return { rung, label: JOURNEY_SPOKEN[rung] };
}

export function nextSpokenLoop(stored: number): { week: number; label: string } {
  const cur = spokenLoopOf(stored);
  if (cur.week >= 3) return { week: 1, label: LOOP_SPOKEN[1] };
  const week = cur.week + 1;
  return { week, label: LOOP_SPOKEN[week] };
}

export function formatSpokenJourney(stored: number): string {
  const { label } = spokenJourneyOf(stored);
  return `${label} (${stored})`;
}

export function formatSpokenLoop(stored: number): string {
  const { label } = spokenLoopOf(stored);
  return `${label} (${stored})`;
}

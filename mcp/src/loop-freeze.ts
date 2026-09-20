/**
 * OS 2.8.17 — implicit loop.
 * Ask / Do / Write back is a quality bar on the week's artifact, not a stored
 * week verb and not card position. Stored 1–7 stay (no schema bump).
 * Mutations are hard-rejected (omit or identical no-op only). No soft-ignore.
 */

export const LOOP_STAGE_MUTATION_REJECTED =
  "loopStage mutations are rejected — Ask/Do/Write back is a quality bar, not a stored week verb";

export const SPOKEN_LOOP_WRITE_REJECTED =
  "spoken Ask/Do/Write back are not card fields — loop is a quality bar, not where-we-are";

export const SPOKEN_LOOP_WRITE_KEYS = [
  "loopSpoken",
  "loopWeek",
  "spokenLoop",
  "weekVerb",
] as const;

/** True when incoming is set and differs from stored. Omit or identical → false. */
export function loopStageMutationRejected(
  current: number,
  incoming: number | undefined,
): boolean {
  return incoming !== undefined && incoming !== current;
}

export function spokenLoopWriteRejected(source: unknown): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const rec = source as Record<string, unknown>;
  return SPOKEN_LOOP_WRITE_KEYS.some((key) => rec[key] !== undefined);
}

/** Missing Write back is said from artifacts — never invented as loopStage 7. */
export function writeBackMissingFromArtifacts(input: {
  lastWeeklySnapshotAt?: string | null;
  scoreboard?: Record<string, unknown> | null;
}): boolean {
  const fromState =
    typeof input.lastWeeklySnapshotAt === "string" && input.lastWeeklySnapshotAt.trim();
  const fromBoard = input.scoreboard?.lastWeeklySnapshotAt;
  const datedBoard = typeof fromBoard === "string" && fromBoard.trim();
  return !fromState && !datedBoard;
}

export function missingWriteBackLine(): string {
  return "Write back (no dated stated block + what we will not do)";
}

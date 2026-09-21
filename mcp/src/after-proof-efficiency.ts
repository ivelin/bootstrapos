/**
 * After-proof efficiency page gate. Not a house rule.
 * Home: company-os/after-proof-efficiency.md
 */

export const AFTER_PROOF_EFFICIENCY_DOC = "after-proof-efficiency" as const;

export const AFTER_PROOF_EFFICIENCY_URL =
  "https://github.com/ivelin/bootstrapos/blob/main/company-os/after-proof-efficiency.md";

export type AfterProofEfficiencyOpenInput = {
  choseFences: boolean;
  hasProof: boolean;
  askedEfficiencyOrExit: boolean;
};

/** Plugin opens the page only if ALL three hold. */
export function afterProofEfficiencyPageMayOpen(
  input: AfterProofEfficiencyOpenInput,
): boolean {
  return Boolean(input.choseFences && input.hasProof && input.askedEfficiencyOrExit);
}

export function emptyContextMayInventEfficiencyMetrics(): false {
  return false;
}

export function path1MayCiteEfficiencyNumbers(): false {
  return false;
}

/** A source older than a year is dead or cut. */
export function sourceOlderThanOneYearIsLive(): false {
  return false;
}

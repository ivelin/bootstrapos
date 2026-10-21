/**
 * Caller-visible setup catalog. Version 1.
 * Plain text for the person. No model instructions.
 */

export const SETUP_FORMAT_VERSION = 1;

export type SetupStep = {
  id: string;
  title: string;
  nextTool: string;
};

export const STARTER_BET_BOARD_STEP: SetupStep = {
  id: "starter-bet-board",
  title: "Open your private starter bet board",
  nextTool: "create_starter_board",
};

export const FIRST_BET_STEP: SetupStep = {
  id: "first-bet",
  title: "Name the first bet on this bet board",
  nextTool: "create_idea",
};

export const ZERO_COMPANY_GUIDANCE =
  "You are signed in, and this account has no bet board yet. Open your private starter bet board. It stays yours alone. You cannot invite anyone, and it cannot become a real company.";

export const EMPTY_COMPANY_GUIDANCE =
  "This bet board has no bet yet. Name the first bet, who it is for, and what you sell.";

export type SetupPayload = {
  setupFormatVersion: typeof SETUP_FORMAT_VERSION;
  setupSteps: SetupStep[];
  guidance: string;
};

export function setupForZeroCompany(): SetupPayload {
  return {
    setupFormatVersion: SETUP_FORMAT_VERSION,
    setupSteps: [STARTER_BET_BOARD_STEP],
    guidance: ZERO_COMPANY_GUIDANCE,
  };
}

export function setupForEmptyCompany(): SetupPayload {
  return {
    setupFormatVersion: SETUP_FORMAT_VERSION,
    setupSteps: [FIRST_BET_STEP],
    guidance: EMPTY_COMPANY_GUIDANCE,
  };
}

/** The only format source. Caller-visible fields only. */
export const SETUP_CATALOG = {
  setupFormatVersion: SETUP_FORMAT_VERSION,
  zeroCompany: setupForZeroCompany(),
  emptyCompany: setupForEmptyCompany(),
} as const;

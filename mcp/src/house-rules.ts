/**
 * OS house-rule reminders for the optional MCP adapter. Version: OS_VERSION.
 * Constitution lives in company-os/*.md. This file must not invent a second OS.
 */

export type ResearchInputLabel = "stated" | "synthetic" | "observed";

export const RESEARCH_INPUT_LABELS: readonly ResearchInputLabel[] = [
  "stated",
  "synthetic",
  "observed",
] as const;

export const HOUSE_RULE_LINES = [
  "Weigh stated, synthetic, and observed. When they disagree, observed wins.",
  "A spoken yes cannot promote a customer group.",
  "Do not seed a persona from a demographic one-liner. Seed from traces. Demo-only role-play is the weak case.",
  "Do not ask a synthetic user for a Likert or a naked dollar WTP; a choice or a sentence, then map.",
  "Ready for human eyes green is not demand or PMF.",
  "Several ideas are allowed. Each idea is its own thesis, instance, and scorecard. Do not hide a second idea to look focused. Rank and kill per board.",
  "Marketing volume cannot promote.",
  "A security program cannot promote.",
  "There is no optimal price until people have paid and stayed.",
  "Do not automate a step that should not exist. Every requirement has a person's name. Delete the step before you simplify it. Automate last. An agent team is automation. Name the one bottleneck this week and work that. Several ideas may attack that same bottleneck. Challenge a fun side quest dressed as the bottleneck. Founder still decides; the agent does not rubber-stamp.",
  "Legal paper cannot promote.",
  "Advisor ride-along is assumed, not observed. An advisor's opinion is a tip, not proof customers will pay. Write down who said it.",
  "SaaS 1.0 playbooks may be outdated. Stay current.",
  "AI never advances a journey phase without founder Advance / Iterate / Hold / Kill.",
  "Empty context with no founder update: do not invent their stage, a price, or an LTV number. Write unknown / none yet.",
  "Do not invent after-proof efficiency metrics. Open that page only if fences + proof + they asked.",
] as const;

export function weighResearchInputs(input: {
  stated?: boolean;
  synthetic?: boolean;
  observed?: boolean;
}): {
  winner: ResearchInputLabel | null;
  mayPromote: boolean;
  reason: string;
} {
  if (input.observed) {
    return {
      winner: "observed",
      mayPromote: true,
      reason:
        "Observed (time or money) wins a clash. A spoken yes still cannot promote by itself.",
    };
  }
  if (input.synthetic) {
    return {
      winner: "synthetic",
      mayPromote: false,
      reason: "Synthetic may rank or kill. Promote stays hold until observed time or money.",
    };
  }
  if (input.stated) {
    return {
      winner: "stated",
      mayPromote: false,
      reason: "Stated words are clues. A spoken yes cannot promote a group.",
    };
  }
  return {
    winner: null,
    mayPromote: false,
    reason: "No research-input label yet. Write none yet rather than inventing a persona.",
  };
}

export function spokenYesMayPromote(): false {
  return false;
}

/** Empty context, no founder update — do not invent journey or loop stage. */
export function emptyContextMayInventStage(): false {
  return false;
}

/** A spoken yes or verbal maybe is stated, not GTM / traction. */
export function spokenYesIsGtm(): false {
  return false;
}

export function demographicOneLinerIsValidSeed(): false {
  return false;
}

export function likertOrNakedDollarWtpAllowed(): false {
  return false;
}

export function marketingVolumeMayPromote(): false {
  return false;
}

export function handfulSurveyMaySetOptimalPrice(): false {
  return false;
}

export function ltvModelMayPromoteAtZeroToOne(): false {
  return false;
}

export function emptyContextMayInventPriceOrLtv(): false {
  return false;
}

/** A playbook with no named owner is not a step to automate. */
export function playbookMayBeAutomatedWithoutNamedOwner(): false {
  return false;
}

/** An agent team may not skip a step that has no named owner. */
export function agentTeamMaySkipUnownedStep(): false {
  return false;
}

export function legalPaperMayPromote(): false {
  return false;
}

export function advisorRideAlongIsObserved(): false {
  return false;
}

/**
 * A new landing page is not the bottleneck when no one has talked to customers,
 * unless the founder overrides with a written decision.
 */
export function newLandingPageMayBeBottleneckWhenNoOneHasTalkedToCustomers(
  founderOverrideWithWrittenDecision = false,
): boolean {
  return founderOverrideWithWrittenDecision === true;
}

/** Pins only — full essays live in the published OS. */
export const HOUSE_RULE_PINS = [
  {
    id: "observed-wins-spoken-yes",
    pin: "Weigh stated / synthetic / observed. Observed wins. A spoken yes cannot promote.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#how-to-do-honest-research--validation",
  },
  {
    id: "several-ideas",
    pin: "Several ideas are allowed. Rank and kill per board.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#core-beliefs",
  },
  {
    id: "marketing-volume-2.8.6",
    pin: "Marketing volume cannot promote.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-marketing-volume-cannot-promote",
  },
  {
    id: "security-program-2.8.7",
    pin: "A security program cannot promote.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-a-security-program-cannot-promote",
  },
  {
    id: "no-optimal-price-2.8.8",
    pin: "There is no optimal price until people have paid and stayed.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-there-is-no-optimal-price-until-people-have-paid-and-stayed",
  },
  {
    id: "do-not-automate-2.8.9",
    pin: "Do not automate a step that should not exist. Automate last. An agent team is automation. Name the one bottleneck this week. Several ideas may attack that same bottleneck.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-do-not-automate-a-step-that-should-not-exist",
  },
  {
    id: "legal-paper-2.8.10",
    pin: "Legal paper cannot promote.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-legal-paper-cannot-promote",
  },
  {
    id: "advisor-ride-along-2.8.11",
    pin: "Advisor ride-along is assumed, not observed. An advisor's opinion is a tip, not proof customers will pay. Write down who said it.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-advisor-ride-along-is-assumed-not-observed",
  },
  {
    id: "unpaid-weeks-2.8.13",
    pin: "Unpaid weeks cannot promote.",
    url: "https://github.com/ivelin/bootstrap/blob/main/company-os/operating-system.md#house-rule-unpaid-weeks-cannot-promote",
  },
] as const;

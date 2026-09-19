/**
 * Portable gate catalog — what evidence / work unlocks the next slow phase
 * or advances the fast loop. Aligned to company-os v2.8.6 exit signals.
 * Static process knowledge; instance state only marks hints, not auto-pass.
 * Constitution remains company-os/*.md — this is adapter furniture.
 */

export type EvidenceLabel =
  | "outside_facts"
  | "company_signals"
  | "assumed_capability"
  | "needs_real_world_proof";

/** Research-input labels (OS 2.8.6). Distinct from claim labels above. */
export type ResearchInputLabel = "stated" | "synthetic" | "observed";

export interface EvidenceItem {
  id: string;
  plain: string;
  /** Preferred claim label when this item is committed */
  labelHint: EvidenceLabel;
  /** Preferred research-input label (stated / synthetic / observed) */
  researchInputHint?: ResearchInputLabel;
  /** How an agent should produce it */
  howToGather: string;
}

export interface PhaseGate {
  phase: number;
  name: string;
  exitSignal: string;
  /** Evidence pack to even *consider* Advance to phase+1 */
  evidenceToAdvance: EvidenceItem[];
  /** Common Iterate / Hold traps */
  doNotCountAsEvidence: string[];
  agentFocus: string[];
}

export interface StageGate {
  stage: number;
  name: string;
  purpose: string;
  evidenceThisStage: EvidenceItem[];
  nextStageWhen: string;
  agentFocus: string[];
}

export const PHASE_GATES: Record<number, PhaseGate> = {
  1: {
    phase: 1,
    name: "Write the bet",
    exitSignal: "Written thesis + at least 3 customer-group candidates",
    evidenceToAdvance: [
      {
        id: "thesis_written",
        plain: "One-paragraph thesis: who hurts, what you offer, why now",
        labelHint: "assumed_capability",
        howToGather: "Draft with founder; store in hypothesis/state; no market claim without sources",
      },
      {
        id: "groups_ge_3",
        plain: "At least 3 distinct customer-group candidates (named, not 'everyone')",
        labelHint: "assumed_capability",
        howToGather:
          "Brainstorm + kill duplicates; write one sentence pain each. Do not seed a group from a demographic one-liner.",
      },
    ],
    doNotCountAsEvidence: [
      "Excitement",
      "Idea volume",
      "Generic TAM screenshots without use",
      "A demographic one-liner treated as a persona (demo-only role-play is the weak case)",
    ],
    agentFocus: [
      "Help founder write a falsifiable thesis",
      "List ≥3 groups with distinct pains",
      "Seed from traces outside the pitch, or write none yet",
      "Do not jump to build or outreach",
    ],
  },
  2: {
    phase: 2,
    name: "Write the bet",
    exitSignal: "Clear metrics / “done means…” per group",
    evidenceToAdvance: [
      {
        id: "success_per_group",
        plain: "For each candidate group: success metric and what 'done' means",
        labelHint: "assumed_capability",
        howToGather: "One measurable outcome per group (behavior or payment signal), not vibes",
      },
      {
        id: "non_goals",
        plain: "Explicit non-goals this quarter (what you will not build)",
        labelHint: "assumed_capability",
        howToGather: "Founder interview; write 3 non-goals",
      },
    ],
    doNotCountAsEvidence: ["Vanity metrics", "Copied competitor feature lists"],
    agentFocus: [
      "Turn success into observable signals",
      "Keep scorecard short enough for weekly review",
    ],
  },
  3: {
    phase: 3,
    name: "Filter cheaply",
    exitSignal: "Ranked groups with written evidence notes; promote still hold",
    evidenceToAdvance: [
      {
        id: "synthetic_ranked",
        plain:
          "Ranked customer groups with dated notes (synthetic leg). Forced choice, then map — not Likert or naked dollar WTP.",
        labelHint: "needs_real_world_proof",
        researchInputHint: "synthetic",
        howToGather:
          "Structured synthetic interviews/scenarios. Seed from traces, not a demographic one-liner. Label claims. Write stated words separately. Demo-only role-play is the weak case.",
      },
      {
        id: "promote_hold",
        plain:
          "Written decision: no primary-focus promote on synthetic or a spoken yes (Hold promote)",
        labelHint: "assumed_capability",
        researchInputHint: "synthetic",
        howToGather:
          "bootstrap_log_decision: Hold promote until observed time or money. Spoken yes cannot promote.",
      },
    ],
    doNotCountAsEvidence: [
      "Single chatbot chat as 'research'",
      "Unlabeled market stats as demand",
      "Persona seeded only from a demographic one-liner (demo-only role-play is the weak case)",
      "Spoken yes / 'I would buy' as promotion",
      "Likert 1–5 or naked dollar WTP from a sim",
    ],
    agentFocus: [
      "Run synthetic discovery with claim labels + stated / synthetic / observed",
      "Seed from traces outside the thesis; write none yet if truly none",
      "Forced choice, then map — never Likert or naked dollar WTP",
      "Rank groups; refuse to treat synthetic or spoken yes as PMF",
    ],
  },
  4: {
    phase: 4,
    name: "Ground it",
    exitSignal: "Real interest tests and/or conversations; weak groups demoted",
    evidenceToAdvance: [
      {
        id: "real_conversations_or_tests",
        plain:
          "Real conversations and/or interest tests with dated notes. Label stated vs observed (time or money).",
        labelHint: "company_signals",
        researchInputHint: "observed",
        howToGather:
          "Talk to humans or run interest tests; redact PII. A waitlist click can be observed; a spoken yes is stated and cannot promote.",
      },
      {
        id: "demotions",
        plain: "Weak groups explicitly demoted or killed with reason",
        labelHint: "company_signals",
        howToGather: "Decision trace per kill/demote",
      },
    ],
    doNotCountAsEvidence: [
      "Friends saying 'cool idea'",
      "Survey of one",
      "Synthetic-only packs",
      "Spoken yes treated as observed",
      "Marketing volume cannot promote",
    ],
    agentFocus: [
      "Prep scripts and capture notes",
      "Stress monetization lightly (will they pay path?)",
      "Do not build heavy product yet",
    ],
  },
  5: {
    phase: 5,
    name: "Build tiny slice",
    exitSignal: "One tiny slice + pass/fail rules + human gates",
    evidenceToAdvance: [
      {
        id: "slice_spec",
        plain: "One thin slice defined with pass/fail eval rules",
        labelHint: "assumed_capability",
        howToGather: "Write spec: user, happy path, thresholds, human gates",
      },
      {
        id: "human_gates_named",
        plain: "Named high-stakes human gates (what AI must not do alone)",
        labelHint: "assumed_capability",
        howToGather: "List gates: spend, public claim, journey advance, live send",
      },
    ],
    doNotCountAsEvidence: ["Full architecture for imaginary scale", "Feature roadmap without slice"],
    agentFocus: [
      "Design smallest testable system",
      "Define eval harness before code binge",
    ],
  },
  6: {
    phase: 6,
    name: "Build tiny slice",
    exitSignal: "Slice runs end-to-end (fixture/sim OK); gate scores",
    evidenceToAdvance: [
      {
        id: "e2e_slice",
        plain: "End-to-end run of thin slice (fixture/sim acceptable)",
        labelHint: "assumed_capability",
        howToGather: "Build + run; save scores vs thresholds",
      },
      {
        id: "gate_scores",
        plain: "Eval gate scores recorded (pass/fail visible to founder)",
        labelHint: "assumed_capability",
        howToGather: "Update state.scores; decision if fail → Iterate not silent ship",
      },
    ],
    doNotCountAsEvidence: ["Code exists but never run cold", "Green unit tests alone"],
    agentFocus: [
      "Evaluation-driven build",
      "Stop at thin slice; no multi-feature sprawl",
      "Prep Ready for human eyes before external demo",
    ],
  },
  7: {
    phase: 7,
    name: "Try with real people",
    exitSignal: "Observed behavior, not only compliments",
    evidenceToAdvance: [
      {
        id: "human_eyes_green",
        plain: "Ready for human eyes green (or override + trace) before cold asks",
        labelHint: "assumed_capability",
        howToGather: "Cold URL + happy path; bootstrap_set_ready_for_human_eyes",
      },
      {
        id: "observed_behavior",
        plain: "Observed user behavior notes (not only compliments)",
        labelHint: "company_signals",
        howToGather: "Watch sessions / structured feedback; record outcomes",
      },
    ],
    doNotCountAsEvidence: [
      "Compliments without usage",
      "Burned favors on broken links",
      "Marketing volume cannot promote",
    ],
    agentFocus: [
      "Clear human-eyes blockers first",
      "Instrument learning questions",
      "Refuse external try-asks while blocked",
    ],
  },
  8: {
    phase: 8,
    name: "Try with real people",
    exitSignal: "Decision traces + score movement",
    evidenceToAdvance: [
      {
        id: "decision_traces",
        plain: "Decision traces for major product changes",
        labelHint: "company_signals",
        howToGather: "bootstrap_log_decision after each meaningful Iterate",
      },
      {
        id: "score_movement",
        plain: "Score movement over time (not single snapshot theater)",
        labelHint: "company_signals",
        howToGather: "Weekly scores in state; compare last vs prior",
      },
    ],
    doNotCountAsEvidence: ["Feature velocity without learning", "Anecdotes without scores"],
    agentFocus: [
      "Close the loop: feedback → change → re-measure",
      "Stage 7 write-back every cycle",
    ],
  },
  9: {
    phase: 9,
    name: "Try with real people",
    exitSignal: "Proof of value or payment; then growth pack — not spray-and-pray",
    evidenceToAdvance: [
      {
        id: "proof_value_or_pay",
        plain: "Proof of value and/or payment (company signals)",
        labelHint: "company_signals",
        howToGather: "Retention, payment, or repeated use with dates",
      },
      {
        id: "growth_cap",
        plain: "Growth experiments capped; channel decisions traced",
        labelHint: "company_signals",
        howToGather: "One channel at a time; kill criteria written first",
      },
    ],
    doNotCountAsEvidence: [
      "Spend without proof",
      "Multi-channel spray",
      "List size as PMF",
      "Marketing volume cannot promote",
    ],
    agentFocus: [
      "Hold scale until proof",
      "One growth hypothesis per round",
      "Evidence labels still apply",
    ],
  },
};

export const STAGE_GATES: Record<number, StageGate> = {
  1: {
    stage: 1,
    name: "Ask",
    purpose: "Produce labeled synthetic insights that sharpen groups/hypotheses",
    evidenceThisStage: [
      {
        id: "syn_notes",
        plain: "Dated synthetic research notes with claim labels + stated / synthetic / observed",
        labelHint: "needs_real_world_proof",
        researchInputHint: "synthetic",
        howToGather:
          "Run scenarios; write what evidence supports / does not establish. No Likert or naked dollar WTP — choice or sentence, then map. Observed wins a clash with stated.",
      },
    ],
    nextStageWhen: "You have notes good enough to design a validation ask",
    agentFocus: ["Research, don't build", "Label claims", "Update open questions"],
  },
  2: {
    stage: 2,
    name: "Ask",
    purpose: "Test concept against synthetic and/or planned real checks",
    evidenceThisStage: [
      {
        id: "validation_result",
        plain: "Pass/fail or ranked outcome on the week's concept test",
        labelHint: "company_signals",
        howToGather: "Define success before the test; record result + label",
      },
    ],
    nextStageWhen: "Result is written; weak paths demoted",
    agentFocus: ["One test at a time", "No silent goalpost moves"],
  },
  3: {
    stage: 3,
    name: "Make",
    purpose: "Build only the thin slice needed for this week's learning",
    evidenceThisStage: [
      {
        id: "slice_delta",
        plain: "What shipped this cycle (thin) + why it enables learning",
        labelHint: "assumed_capability",
        howToGather: "Ship minimal; link to eval criteria",
      },
    ],
    nextStageWhen: "Something runnable exists for test stage",
    agentFocus: ["Thin slice only", "No feature salad"],
  },
  4: {
    stage: 4,
    name: "Check",
    purpose: "Exercise the slice before humans burn time",
    evidenceThisStage: [
      {
        id: "test_log",
        plain: "Test log: happy path + key failures",
        labelHint: "assumed_capability",
        howToGather: "Automated + synthetic cold checks; save blockers",
      },
    ],
    nextStageWhen: "Known blockers listed; no silent 'works on my machine'",
    agentFocus: ["Fail closed", "Update human-eyes if product-facing"],
  },
  5: {
    stage: 5,
    name: "Check",
    purpose: "Score against thresholds; founder-visible gate",
    evidenceThisStage: [
      {
        id: "eval_scores",
        plain: "Scores vs thresholds; Iterate/Hold/Advance recommendation",
        labelHint: "assumed_capability",
        howToGather: "Fill state.scores; plain recommendation — founder decides",
      },
    ],
    nextStageWhen: "Gate is visible; weak scores mean Iterate not ship",
    agentFocus: ["Make gate visible", "Do not self-advance journey"],
  },
  6: {
    stage: 6,
    name: "Hear",
    purpose: "Bring real-world signal in lawfully and honestly",
    evidenceThisStage: [
      {
        id: "real_feedback",
        plain: "Redacted real feedback notes with outcomes",
        labelHint: "company_signals",
        howToGather: "Only after human-eyes policy allows external asks",
      },
    ],
    nextStageWhen: "At least one real signal written (or blocked reason)",
    agentFocus: [
      "Check bootstrap_refuse_external_ask_if_not_green first",
      "Capture behavior not compliments",
    ],
  },
  7: {
    stage: 7,
    name: "Write back",
    purpose: "Write back so next cycle is smarter",
    evidenceThisStage: [
      {
        id: "stage7_write",
        plain: "Write back: scores, open questions, hypothesis notes",
        labelHint: "company_signals",
        howToGather: "Update state + decision trace; set lastWeeklySnapshotAt if weekly",
      },
    ],
    nextStageWhen: "State reflects learning; loop stage can return to 1",
    agentFocus: [
      "Never skip write-back if you claim you ran the loop",
      "Prepare next week's top question",
    ],
  },
};

export function nextPhaseNumber(phase: number): number | null {
  if (phase >= 9) return null;
  if (phase < 1) return 1;
  return phase + 1;
}

export function nextStageNumber(stage: number): number {
  if (stage >= 7) return 1;
  if (stage < 1) return 1;
  return stage + 1;
}

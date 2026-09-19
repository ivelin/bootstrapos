import type { CompanyState } from "./state.js";
import {
  PHASE_GATES,
  STAGE_GATES,
  nextPhaseNumber,
  nextStageNumber,
  type EvidenceItem,
  type PhaseGate,
  type StageGate,
} from "./gates.js";
import {
  JOURNEY_PHASES,
  LOOP_STAGES,
  formatSpokenJourney,
  formatSpokenLoop,
  nextSpokenJourney,
  nextSpokenLoop,
} from "./constants.js";
import { HOUSE_RULE_LINES } from "./house-rules.js";

export interface StatusView {
  plain: string;
  companyId: string;
  hypothesis: string;
  slowClock: {
    phase: number;
    name: string;
    exitSignalForCurrentPhase: string;
  };
  fastClock: {
    stage: number;
    name: string;
    purpose: string;
  };
  autonomyPosture: string;
  gateStatus: string;
  readyForHumanEyes: CompanyState["readyForHumanEyes"];
  openQuestions: string[];
  scores: Record<string, unknown>;
  learningRituals: {
    lastWeeklySnapshotAt: string | null;
    weeklySnapshotOk: boolean;
  };
  lastAction: string;
  rules: string[];
}

export interface NextEvidenceView {
  plain: string;
  slowClock: {
    currentPhase: number;
    currentName: string;
    advanceToPhase: number | null;
    advanceToName: string | null;
    exitSignal: string;
    evidenceNeeded: EvidenceItem[];
    doNotCountAsEvidence: string[];
    founderMust: string;
  };
  fastClock: {
    currentStage: number;
    currentName: string;
    nextStage: number;
    nextName: string;
    completeWhen: string;
    evidenceNeeded: EvidenceItem[];
  };
  humanEyes: {
    status: string;
    blocksExternalProductAsks: boolean;
    blockers: string[];
    evidenceNeededIfNotGreen: EvidenceItem[];
  };
  agentFocus: {
    doNow: string[];
    doNotDo: string[];
    mode: "gather_evidence" | "do_work_toward_evidence" | "stage7_writeback" | "blocked_on_founder";
    modePlain: string;
  };
  howToRecordWhenReady: string[];
}

function phaseGate(phase: number): PhaseGate {
  return PHASE_GATES[phase] ?? PHASE_GATES[1];
}

function stageGate(stage: number): StageGate {
  return STAGE_GATES[stage] ?? STAGE_GATES[1];
}

export function buildStatusView(state: CompanyState, plainWhere: string): StatusView {
  const phase = Number(state.journeyPhase) || 1;
  const stage = Number(state.loopStage) || 1;
  const pg = phaseGate(phase);
  const sg = stageGate(stage);
  return {
    plain: plainWhere,
    companyId: state.companyId,
    hypothesis: state.hypothesis,
    slowClock: {
      phase,
      name: JOURNEY_PHASES[phase] ?? formatSpokenJourney(phase),
      exitSignalForCurrentPhase: pg.exitSignal,
    },
    fastClock: {
      stage,
      name: LOOP_STAGES[stage] ?? formatSpokenLoop(stage),
      purpose: sg.purpose,
    },
    autonomyPosture: String(state.autonomyPosture ?? "strict"),
    gateStatus: String(state.gateStatus ?? "open"),
    readyForHumanEyes: state.readyForHumanEyes,
    openQuestions: state.openQuestions ?? [],
    scores: (state.scores as Record<string, unknown>) ?? {},
    learningRituals: {
      lastWeeklySnapshotAt: state.lastWeeklySnapshotAt,
      weeklySnapshotOk: Boolean(state.lastWeeklySnapshotAt),
    },
    lastAction: state.lastAction ?? "",
    rules: [
      "AI never advances journey phase without founder approval",
      "Ready for human eyes green ≠ demand or PMF",
      "Evidence beats narrative — empty honest status beats fiction",
      ...HOUSE_RULE_LINES,
    ],
  };
}

export function buildNextEvidenceView(state: CompanyState): NextEvidenceView {
  const phase = Number(state.journeyPhase) || 1;
  const stage = Number(state.loopStage) || 1;
  const pg = phaseGate(phase);
  const sg = stageGate(stage);
  const np = nextPhaseNumber(phase);
  const ns = nextStageNumber(stage);
  const eyes = state.readyForHumanEyes?.status ?? "unknown";
  const eyesBlocked = eyes !== "green";

  const humanEyesEvidence: EvidenceItem[] = [
    {
      id: "cold_url",
      plain: "Cold URL loads for a stranger device/session",
      labelHint: "assumed_capability",
      howToGather: "Open deploy URL in private/other device; record pass/fail",
    },
    {
      id: "happy_path",
      plain: "Documented happy path completes without founder help",
      labelHint: "assumed_capability",
      howToGather: "Write steps; run once cold; list blockers",
    },
    {
      id: "eyes_artifact",
      plain: "Short Ready for human eyes note (date, URL, pass/fail, blockers)",
      labelHint: "assumed_capability",
      howToGather: "bootstrap_set_ready_for_human_eyes + optional evidencePath file",
    },
  ];

  // Mode selection: help agents choose gather vs work vs writeback vs founder
  let mode: NextEvidenceView["agentFocus"]["mode"] = "do_work_toward_evidence";
  let modePlain =
    "Do the work that produces solid evidence for the current stage and phase — then record it. Motion without evidence is not progress.";

  if (stage === 7) {
    mode = "stage7_writeback";
    modePlain =
      "Close the loop: write scores, open questions, and a decision trace before starting new work.";
  } else if (eyesBlocked && (phase >= 7 || stage === 6)) {
    mode = "gather_evidence";
    modePlain =
      "External learning is gated: clear Ready for human eyes (or founder override + trace) before cold asks.";
  } else if (!state.lastWeeklySnapshotAt && stage === 7) {
    mode = "stage7_writeback";
    modePlain = "Weekly snapshot missing — control-plane read-back is due.";
  } else if ((state.openQuestions?.length ?? 0) === 0 && phase <= 4) {
    mode = "do_work_toward_evidence";
    modePlain =
      "No open questions listed — define what would change your mind, then gather that evidence.";
  }

  const doNotDo = [
    ...pg.doNotCountAsEvidence.map((x) => `Do not treat as evidence: ${x}`),
    "Do not advance journey phase without founder Advance/Iterate/Hold/Kill",
    "Do not invent metrics or conversations",
    "Busy is not progress — agent runtime, chat volume, and feature count are not evidence",
    "Do not seed a persona from a demographic one-liner (demo-only role-play is the weak case)",
    "Do not treat a spoken yes as promotion; observed (time or money) wins a clash",
    "Do not treat marketing volume as promotion",
    "Do not treat a handful survey as optimal price or WTP; there is no optimal price until people have paid and stayed",
    "Do not model LTV or CAC as proof at 0-1",
    "Do not open after-proof efficiency without fences + proof + they asked — two clocks",
    "Do not invent CAC payback, NRR, or magic-number numbers at 0-1 or on Path 1",
    "Do not ask a sim for a Likert or a naked dollar WTP — choice or sentence, then map",
    eyesBlocked
      ? "Do not draft 'please try my link' to mentors/users until human-eyes green or override+trace"
      : "Do not claim human-eyes green means demand",
  ];

  const doNow = [
    ...sg.agentFocus,
    ...pg.agentFocus.slice(0, 2),
    stage === 7
      ? "Call bootstrap_log_decision + update state (scores, openQuestions, lastWeeklySnapshotAt)"
      : "When evidence exists, record it (decision trace / state scores / human-eyes) — do not leave it in chat",
  ];

  const plain = [
    "NEXT EVIDENCE & FOCUS (Bootstrap OS)",
    "",
    `SLOW CLOCK — Journey: ${formatSpokenJourney(phase)}`,
    `  Exit this rung when: ${pg.exitSignal}`,
    nextSpokenJourney(phase)
      ? `  To consider Advance → ${nextSpokenJourney(phase)?.label}, founder needs evidence pack:`
      : "  Try: grow pack only after proof; stay at Try until founder Advance. No sixth journey rung.",
    ...pg.evidenceToAdvance.map((e, i) => `    ${i + 1}. [${e.labelHint}] ${e.plain}`),
    "  Founder must still decide Advance / Iterate / Hold / Kill — AI does not advance alone.",
    "",
    `FAST CLOCK — Loop: ${formatSpokenLoop(stage)}`,
    `  Purpose: ${sg.purpose}`,
    `  Move toward ${nextSpokenLoop(stage).label} when: ${sg.nextStageWhen}`,
    ...sg.evidenceThisStage.map((e, i) => `    ${i + 1}. [${e.labelHint}] ${e.plain}`),
    "",
    `HUMAN EYES: ${eyes}${eyesBlocked ? " — blocks cold product asks" : ""}`,
    eyesBlocked
      ? humanEyesEvidence.map((e, i) => `    ${i + 1}. ${e.plain}`).join("\n")
      : "  Green for cold path only — not PMF.",
    "",
    `AGENT MODE: ${mode}`,
    `  ${modePlain}`,
    "  Do now:",
    ...doNow.map((x) => `    - ${x}`),
    "  Do not:",
    ...doNotDo.slice(0, 6).map((x) => `    - ${x}`),
    "",
    "When evidence is ready: bootstrap_log_decision and/or update state fields — never only chat.",
  ].join("\n");

  return {
    plain,
    slowClock: {
      currentPhase: phase,
      currentName: JOURNEY_PHASES[phase] ?? formatSpokenJourney(phase),
      advanceToPhase: np,
      advanceToName: nextSpokenJourney(phase)?.label ?? null,
      exitSignal: pg.exitSignal,
      evidenceNeeded: pg.evidenceToAdvance,
      doNotCountAsEvidence: pg.doNotCountAsEvidence,
      founderMust: "Explicit Advance / Iterate / Hold / Kill after reviewing evidence pack",
    },
    fastClock: {
      currentStage: stage,
      currentName: LOOP_STAGES[stage] ?? formatSpokenLoop(stage),
      nextStage: ns,
      nextName: nextSpokenLoop(stage).label,
      completeWhen: sg.nextStageWhen,
      evidenceNeeded: sg.evidenceThisStage,
    },
    humanEyes: {
      status: String(eyes),
      blocksExternalProductAsks: eyesBlocked,
      blockers: state.readyForHumanEyes?.blockers ?? [],
      evidenceNeededIfNotGreen: eyesBlocked ? humanEyesEvidence : [],
    },
    agentFocus: {
      doNow,
      doNotDo,
      mode,
      modePlain,
    },
    howToRecordWhenReady: [
      "bootstrap_log_decision — decision + evidence + next review",
      "bootstrap_update_state — scores, openQuestions, loopStage, lastAction (phase only with founderApprovedPhaseChange)",
      "bootstrap_set_ready_for_human_eyes — when cold path checked",
      "Future: bootstrap_record_evidence / accept_proposed (Phase C ledger)",
    ],
  };
}

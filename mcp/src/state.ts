import fs from "node:fs";
import path from "node:path";
import { resolveStatePath, resolveTracesDir } from "./paths.js";
import { formatSpokenJourney, formatSpokenLoop } from "./constants.js";

export type AutonomyPosture = "strict" | "auto" | "dangerous";
export type ReadyStatus = "unknown" | "blocked" | "green";
export type GateStatus = "open" | "blocked" | "cleared";

export interface CompanyState {
  version: number;
  companyId: string;
  hypothesis: string;
  journeyPhase: number;
  loopStage: number;
  gateStatus: GateStatus | string;
  autonomyPosture: AutonomyPosture | string;
  readyForHumanEyes: {
    status: ReadyStatus | string;
    checkedAt: string | null;
    happyPath: string;
    blockers?: string[];
    evidencePath?: string;
  };
  scores: Record<string, unknown>;
  founderApprovals: unknown[];
  openQuestions: string[];
  lastAction: string;
  lastWeeklySnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export function readState(): CompanyState {
  const p = resolveStatePath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `Company state not found at ${p}. Copy templates/company/state/company-state.json into your instance, or set BOOTSTRAP_STATE_PATH / BOOTSTRAP_INSTANCE_ROOT.`,
    );
  }
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as CompanyState;
}

export function writeState(state: CompanyState): void {
  const p = resolveStatePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function patchState(
  patch: Partial<CompanyState> & {
    readyForHumanEyes?: Partial<CompanyState["readyForHumanEyes"]>;
    scores?: Record<string, unknown>;
  },
  options: { allowPhaseAdvance?: boolean } = {},
): { state: CompanyState; warnings: string[] } {
  const state = readState();
  const warnings: string[] = [];

  if (patch.journeyPhase !== undefined && patch.journeyPhase !== state.journeyPhase) {
    if (!options.allowPhaseAdvance) {
      warnings.push(
        `Journey phase change ${state.journeyPhase} → ${patch.journeyPhase} requires founder approval. Pass founderApprovedPhaseChange=true only after explicit founder Advance/Iterate/Hold/Kill.`,
      );
      delete patch.journeyPhase;
    } else {
      warnings.push(
        "Recorded journey phase change with founderApprovedPhaseChange. Ensure a decision trace exists.",
      );
    }
  }

  if (patch.autonomyPosture !== undefined && patch.autonomyPosture !== state.autonomyPosture) {
    warnings.push(
      "Autonomy posture change is high-leverage. Confirm founder intent (especially toward looser than Strict).",
    );
  }

  if (patch.readyForHumanEyes) {
    state.readyForHumanEyes = {
      ...state.readyForHumanEyes,
      ...patch.readyForHumanEyes,
    };
    delete (patch as { readyForHumanEyes?: unknown }).readyForHumanEyes;
  }

  if (patch.scores) {
    state.scores = { ...state.scores, ...patch.scores };
    delete (patch as { scores?: unknown }).scores;
  }

  Object.assign(state, patch);
  writeState(state);
  return { state, warnings };
}

export function whereAreWePlain(state: CompanyState): string {
  const phase = state.journeyPhase;
  const stage = state.loopStage;
  const phaseLabel = formatSpokenJourney(phase);
  const stageLabel = formatSpokenLoop(stage);
  const eyes = state.readyForHumanEyes?.status ?? "unknown";
  const posture = state.autonomyPosture ?? "strict";
  const weekly = state.lastWeeklySnapshotAt
    ? `last weekly snapshot ${state.lastWeeklySnapshotAt}`
    : "weekly control-plane snapshot missing or not recorded";

  const questions = (state.openQuestions ?? []).slice(0, 5);
  const qBlock =
    questions.length > 0
      ? questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n")
      : "  (none listed)";

  return [
    "Where we stand (Bootstrap OS control plane)",
    "",
    `Company: ${state.companyId}`,
    `Hypothesis: ${state.hypothesis}`,
    "",
    `Journey: ${phaseLabel}`,
    `Live loop: ${stageLabel}`,
    `AI freedom (autonomy): ${posture} (Strict = pause on strategy/spend/live sends; Auto = more routine autonomy; Dangerous = high risk)`,
    `Gate status: ${state.gateStatus}`,
    `Ready for human eyes: ${eyes} (green only means cold happy path works — not demand or PMF)`,
    eyes === "blocked" && state.readyForHumanEyes?.blockers?.length
      ? `  Blockers: ${state.readyForHumanEyes.blockers.join("; ")}`
      : null,
    `Learning rituals: ${weekly}`,
    `Last action: ${state.lastAction}`,
    "",
    "Top open questions:",
    qBlock,
    "",
    "Scores (honest; engineering green is not PMF):",
    JSON.stringify(state.scores ?? {}, null, 2),
    "",
    "Rules reminder: AI never advances journey phase alone. Evidence beats narrative.",
    "House rules (OS 2.8.6): stated / synthetic / observed — observed wins. Spoken yes cannot promote.",
    "Do not seed from a demographic one-liner (demo-only role-play is the weak case).",
    "Several ideas are allowed. Each companyId is its own board. Rank and kill per board.",
    "Marketing volume cannot promote.",
    "There is no optimal price until people have paid and stayed.",
    "No Likert or naked dollar WTP — choice or sentence, then map.",
    "Same state as markdown: company-state.json + where-are-we.py. Green human-eyes ≠ demand/PMF.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function appendDecisionTrace(input: {
  title: string;
  decision: string;
  evidence?: string;
  outcome?: string;
  nextReview?: string;
  founderApproved?: boolean;
}): string {
  const dir = resolveTracesDir();
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const file = path.join(dir, `${day}-${slug || "decision"}.md`);
  const body = [
    `# ${input.title}`,
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Founder approved:** ${input.founderApproved ? "yes" : "not claimed"}`,
    "",
    "## Decision",
    input.decision,
    "",
    "## Evidence",
    input.evidence ?? "(none recorded)",
    "",
    "Label: stated | synthetic | observed (observed wins). A spoken yes cannot promote.",
    "",
    "## Outcome / expected outcome",
    input.outcome ?? "(pending)",
    "",
    "## Next review",
    input.nextReview ?? "(unset)",
    "",
  ].join("\n");
  fs.writeFileSync(file, body, "utf8");
  return file;
}

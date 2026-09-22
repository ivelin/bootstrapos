/**
 * Self-host disk registry: one MCP connector, many isolated instances.
 * initCompany() bootstraps state on this machine. Hosted Pirin boards use create_company.
 * Never merge state across companyId.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function osRoot(): string {
  if (process.env.BOOTSTRAP_OS_ROOT) {
    return path.resolve(process.env.BOOTSTRAP_OS_ROOT);
  }
  return path.resolve(__dirname, "..", "..");
}

export interface CompanyRecord {
  companyId: string;
  displayName: string;
  instanceRoot: string;
  createdAt: string;
  updatedAt: string;
}

export interface Registry {
  version: 1;
  activeCompanyId: string | null;
  companies: Record<string, CompanyRecord>;
}

/** Process-session override (stdio process lifetime). */
let sessionCompanyId: string | null = null;
let sessionInstanceRoot: string | null = null;

export function resolveDataRoot(): string {
  if (process.env.BOOTSTRAP_DATA_ROOT) {
    return path.resolve(process.env.BOOTSTRAP_DATA_ROOT);
  }
  return path.join(os.homedir(), ".bootstrap-os");
}

function registryPath(): string {
  return path.join(resolveDataRoot(), "registry.json");
}

function defaultRegistry(): Registry {
  return { version: 1, activeCompanyId: null, companies: {} };
}

export function readRegistry(): Registry {
  const p = registryPath();
  if (!fs.existsSync(p)) return defaultRegistry();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Registry;
    if (!raw.companies) raw.companies = {};
    return raw;
  } catch {
    return defaultRegistry();
  }
}

export function writeRegistry(reg: Registry): void {
  const root = resolveDataRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify(reg, null, 2) + "\n", "utf8");
}

export function slugifyCompanyId(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!s) throw new Error("companyId must contain letters or numbers");
  return s;
}

export function instanceRootForId(companyId: string): string {
  return path.join(resolveDataRoot(), "instances", companyId);
}

export function setSessionActive(companyId: string, instanceRoot: string): void {
  sessionCompanyId = companyId;
  sessionInstanceRoot = path.resolve(instanceRoot);
}

/** Clear session active company (tests + process hygiene). */
export function clearSession(): void {
  sessionCompanyId = null;
  sessionInstanceRoot = null;
}

export function getSessionActive(): {
  companyId: string | null;
  instanceRoot: string | null;
} {
  return { companyId: sessionCompanyId, instanceRoot: sessionInstanceRoot };
}

export function resolveActiveCompanyId(): string | null {
  if (sessionCompanyId) return sessionCompanyId;
  if (process.env.BOOTSTRAP_INSTANCE_ROOT) {
    return path.basename(path.resolve(process.env.BOOTSTRAP_INSTANCE_ROOT));
  }
  return readRegistry().activeCompanyId;
}

export function listCompanies(): {
  dataRoot: string;
  activeCompanyId: string | null;
  sessionCompanyId: string | null;
  singleInstanceEnv: boolean;
  companies: Array<
    CompanyRecord & {
      active: boolean;
      hasState: boolean;
      journeyPhase?: number;
      loopStage?: number;
    }
  >;
} {
  const reg = readRegistry();
  const activeId = resolveActiveCompanyId();
  const companies = Object.values(reg.companies)
    .sort((a, b) => a.companyId.localeCompare(b.companyId))
    .map((c) => {
      const statePath = path.join(c.instanceRoot, "company", "state", "company-state.json");
      let journeyPhase: number | undefined;
      let loopStage: number | undefined;
      let hasState = false;
      if (fs.existsSync(statePath)) {
        hasState = true;
        try {
          const st = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
            journeyPhase?: number;
            loopStage?: number;
          };
          journeyPhase = st.journeyPhase;
          loopStage = st.loopStage;
        } catch {
          /* ignore */
        }
      }
      return {
        ...c,
        active: c.companyId === activeId,
        hasState,
        journeyPhase,
        loopStage,
      };
    });

  return {
    dataRoot: resolveDataRoot(),
    activeCompanyId: activeId,
    sessionCompanyId,
    singleInstanceEnv: Boolean(process.env.BOOTSTRAP_INSTANCE_ROOT),
    companies,
  };
}

export function useCompany(companyIdRaw: string): {
  companyId: string;
  instanceRoot: string;
  displayName: string;
} {
  const companyId = slugifyCompanyId(companyIdRaw);
  const reg = readRegistry();
  const rec = reg.companies[companyId];
  if (!rec) {
    throw new Error(
      `Unknown company "${companyId}" on this self-host disk. Call bootstrap_init_company to bootstrap it here. On the hosted Pirin connector, a super admin calls create_company, then create_idea — or ask an admin / email bootstrap@pirin.ai.`,
    );
  }
  if (!fs.existsSync(rec.instanceRoot)) {
    throw new Error(
      `Instance root missing for ${companyId}: ${rec.instanceRoot}. Re-init or fix registry.`,
    );
  }
  reg.activeCompanyId = companyId;
  rec.updatedAt = new Date().toISOString();
  writeRegistry(reg);
  setSessionActive(companyId, rec.instanceRoot);
  return {
    companyId,
    instanceRoot: rec.instanceRoot,
    displayName: rec.displayName,
  };
}

function blankState(companyId: string, hypothesis: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const templatePath = path.join(
    osRoot(),
    "templates",
    "company",
    "state",
    "company-state.json",
  );
  let base: Record<string, unknown> = {};
  if (fs.existsSync(templatePath)) {
    base = JSON.parse(fs.readFileSync(templatePath, "utf8")) as Record<string, unknown>;
  }
  return {
    ...base,
    version: 1,
    companyId,
    hypothesis: hypothesis || (base.hypothesis as string) || "One sentence — subject to evidence",
    journeyPhase: 1,
    loopStage: 1,
    gateStatus: "open",
    autonomyPosture: "strict",
    readyForHumanEyes: {
      status: "unknown",
      checkedAt: null,
      happyPath: "",
    },
    scores: base.scores ?? {
      problemEvidence: null,
      willingnessToPay: null,
      completion: null,
      traceCompleteness: null,
      notes:
        "Fill scores honestly. Engineering green is not PMF. Label willingness stated / synthetic / observed. Do not ask a sim for a Likert or naked dollar WTP — choice or sentence, then map.",
    },
    founderApprovals: [],
    openQuestions: base.openQuestions ?? [
      "What is our written thesis and at least three customer-group candidates?",
      "What evidence would make us advance, iterate, hold, or kill?",
      "When is the next weekly where-do-we-stand check-in?",
    ],
    lastAction: "instance_created",
    lastWeeklySnapshotAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Self-host disk bootstrap under BOOTSTRAP_DATA_ROOT. Not the hosted Pirin create path. */
export function initCompany(input: {
  companyId: string;
  displayName?: string;
  hypothesis?: string;
  instanceRoot?: string;
  activate?: boolean;
}): {
  companyId: string;
  displayName: string;
  instanceRoot: string;
  statePath: string;
  created: boolean;
  activated: boolean;
} {
  const companyId = slugifyCompanyId(input.companyId);
  const reg = readRegistry();
  if (reg.companies[companyId] && fs.existsSync(reg.companies[companyId].instanceRoot)) {
    const existing = reg.companies[companyId];
    const activate = input.activate !== false;
    if (activate) {
      reg.activeCompanyId = companyId;
      writeRegistry(reg);
      setSessionActive(companyId, existing.instanceRoot);
    }
    return {
      companyId,
      displayName: existing.displayName,
      instanceRoot: existing.instanceRoot,
      statePath: path.join(existing.instanceRoot, "company", "state", "company-state.json"),
      created: false,
      activated: activate,
    };
  }

  const instanceRoot = path.resolve(input.instanceRoot ?? instanceRootForId(companyId));
  const stateDir = path.join(instanceRoot, "company", "state");
  const tracesDir = path.join(instanceRoot, "company", "traces");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(tracesDir, { recursive: true });

  const state = blankState(companyId, input.hypothesis ?? "");
  const statePath = path.join(stateDir, "company-state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");

  // Same state furniture as path 2: schema + where-are-we.py. Never write company-os/.
  for (const name of ["company-state.schema.json", "where-are-we.py"] as const) {
    const src = path.join(osRoot(), "templates", "company", "state", name);
    const dst = path.join(stateDir, name);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
    }
  }

  const appliedSrc = path.join(osRoot(), "templates", "applied-here.md");
  const appliedDst = path.join(instanceRoot, "applied-here.md");
  if (fs.existsSync(appliedSrc) && !fs.existsSync(appliedDst)) {
    let body = fs.readFileSync(appliedSrc, "utf8");
    body = body.replace(/\[YOUR COMPANY\]/g, input.displayName ?? companyId);
    fs.writeFileSync(appliedDst, body, "utf8");
  }

  const now = new Date().toISOString();
  const rec: CompanyRecord = {
    companyId,
    displayName: input.displayName?.trim() || companyId,
    instanceRoot,
    createdAt: now,
    updatedAt: now,
  };
  reg.companies[companyId] = rec;
  const activate = input.activate !== false;
  if (activate) {
    reg.activeCompanyId = companyId;
    setSessionActive(companyId, instanceRoot);
  }
  writeRegistry(reg);

  return {
    companyId,
    displayName: rec.displayName,
    instanceRoot,
    statePath,
    created: true,
    activated: activate,
  };
}

export function requireActiveContext(): {
  companyId: string | null;
  instanceRoot: string;
  mode: "session" | "env" | "registry" | "template_demo";
} {
  if (sessionInstanceRoot) {
    return {
      companyId: sessionCompanyId,
      instanceRoot: sessionInstanceRoot,
      mode: "session",
    };
  }
  if (process.env.BOOTSTRAP_INSTANCE_ROOT) {
    return {
      companyId: resolveActiveCompanyId(),
      instanceRoot: path.resolve(process.env.BOOTSTRAP_INSTANCE_ROOT),
      mode: "env",
    };
  }
  const reg = readRegistry();
  if (reg.activeCompanyId && reg.companies[reg.activeCompanyId]) {
    return {
      companyId: reg.activeCompanyId,
      instanceRoot: path.resolve(reg.companies[reg.activeCompanyId].instanceRoot),
      mode: "registry",
    };
  }
  return {
    companyId: null,
    instanceRoot: osRoot(),
    mode: "template_demo",
  };
}

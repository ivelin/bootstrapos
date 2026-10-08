/**
 * Verify receipt for a phase change or Ready for human eyes.
 * Stateless HMAC. audit_events (list_provenance) could hold a jsonb row, but
 * authenticated cannot INSERT, emit_audit is revoked, and list_provenance omits
 * the row id — storing one would be a migration. MAC key is HKDF-SHA256 of
 * BOOTSTRAP_VERIFY_SECRET (fallback BOOTSTRAP_INVITE_MAIL_SECRET, temporary)
 * with info "bootstrap-verify-v1", never the raw secret.
 */
import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { PHASE_GATES } from "./gates.js";
import { HUMAN_EYES_EVIDENCE } from "./guidance.js";
import type { JourneyActor } from "./journey-auth.js";
import { normalizeSlug, type JourneyStore } from "./journey.js";

export const VERIFY_HINT = "call bootstrap_verify";
export const VERIFY_INFO = "bootstrap-verify-v1";
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFY_ERROR = `This write needs a verify receipt for this company, claim, and person. ${VERIFY_HINT}`;
export type VerifyResult = {
  pass: boolean;
  gaps: string[];
  evidence_id: string | null;
  expires_at: string | null;
};
type Receipt = {
  v: 1;
  pass: boolean;
  company: string;
  claim: string;
  sub: string;
  revision: string;
  exp: number;
  idea: string;
};
type BoardIdea = {
  slug?: string;
  clocks?: { journeyPhase?: number; loopStage?: number; currentGate?: string };
  scoreboard?: Record<string, unknown>;
  updated_at?: string;
  updatedAt?: string;
};
type Board = { ok?: boolean; ideas?: BoardIdea[] };
const SECRET_MIN = 32;
const macKeys = new Map<string, Buffer>();
export function verifyServerSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.BOOTSTRAP_VERIFY_SECRET?.trim() || env.BOOTSTRAP_INVITE_MAIL_SECRET?.trim();
  if (!raw || raw.length < SECRET_MIN) return undefined;
  return raw;
}
export function verifyMacKey(secret: string): Buffer {
  const hit = macKeys.get(secret);
  if (hit) return hit;
  const key = Buffer.from(hkdfSync("sha256", secret, "", VERIFY_INFO, 32));
  macKeys.set(secret, key);
  return key;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
/** Clocks + scoreboard from the journey read. ideas.updated_at is not on that read. */

export function journeyRevision(board: unknown): string {
  const ideas = ((board as Board | null)?.ideas ?? []).map((idea) => ({
    slug: idea.slug ?? "",
    phase: idea.clocks?.journeyPhase ?? null,
    loop: idea.clocks?.loopStage ?? null,
    gate: idea.clocks?.currentGate ?? null,
    updatedAt: idea.updated_at ?? idea.updatedAt ?? null,
    scoreboard: idea.scoreboard ?? {},
  }));
  ideas.sort((a, b) => a.slug.localeCompare(b.slug));
  return createHash("sha256").update(stable(ideas)).digest("hex");
}
export function canonicalClaim(raw: string): string {
  const claim = raw.trim().toLowerCase();
  if (claim === "rfhe" || claim === "ready-for-human-eyes") return "ready-for-human-eyes";
  return claim;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function eyesOf(scoreboard: Record<string, unknown>) {
  const nested =
    scoreboard.readyForHumanEyes && typeof scoreboard.readyForHumanEyes === "object"
      ? (scoreboard.readyForHumanEyes as Record<string, unknown>)
      : {};
  const blockers = Array.isArray(nested.blockers)
    ? nested.blockers
    : Array.isArray(scoreboard.blockers)
      ? scoreboard.blockers
      : [];
  return {
    status: text(nested.status) || "unknown",
    happy: text(nested.happyPath) || text(scoreboard.happyPath),
    url: text(nested.evidencePath) || text(scoreboard.evidencePath),
    blockers: blockers.map((row) => text(row)).filter(Boolean),
  };
}
function publicHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]" && host !== "::1";
  } catch {
    return false;
  }
}
const PHASE_RECORDED: Record<string, (scoreboard: Record<string, unknown>) => boolean> = {
  thesis_written: (scoreboard) => text(scoreboard.hypothesis).length > 0,
  groups_ge_3: (scoreboard) =>
    Array.isArray(scoreboard.openQuestions) &&
    scoreboard.openQuestions.filter((row) => text(row).length > 0).length >= 3,
};
/** Existing cold-path checklist against the board already read. No fetch. */

function rungNeedsReceipt(phase: number): boolean {
  const gate = PHASE_GATES[phase];
  if (!gate?.evidenceToAdvance.length) return false;
  return gate.evidenceToAdvance.every((item) => Boolean(PHASE_RECORDED[item.id]));
}
export function coldPathGaps(claim: string, board: Board, ideaSlug?: string): string[] {
  if (board.ok !== true || !board.ideas?.length) return ["This company board is not visible."];
  const idea = leadIdea(board, ideaSlug);
  if (!idea) return ["That idea is not on this board."];
  const scoreboard = idea.scoreboard ?? {};
  const key = canonicalClaim(claim);
  if (!key) return ["Say the claim to check."];
  if (key === "ready-for-human-eyes") {
    const eyes = eyesOf(scoreboard);
    const urlOk = publicHttps(eyes.url);
    const happyOk = eyes.happy.length > 0;
    const clear = eyes.status !== "blocked" && eyes.blockers.length === 0;
    const gaps: string[] = [];
    for (const item of HUMAN_EYES_EVIDENCE) {
      const pass =
        item.id === "cold_url" ? urlOk : item.id === "happy_path" ? happyOk : urlOk && happyOk && clear;
      if (!pass) gaps.push(item.plain);
    }
    return gaps.concat(eyes.blockers);
  }
  const cur = Number(idea.clocks?.journeyPhase) || 1;
  const numbered = /^phase:([1-9])$/.exec(key);
  if (key !== "phase" && !numbered) return ["That claim is not one of the cold-path checks."];
  if (numbered && Number(numbered[1]) !== cur + 1) return ["That claim is not the next rung."];
  const gate = PHASE_GATES[cur];
  if (!gate) return ["No cold-path check for this rung."];
  return gate.evidenceToAdvance
    .filter((item) => !(PHASE_RECORDED[item.id]?.(scoreboard) ?? false))
    .map((item) => item.plain);
}
function mac(payload: string, secret: string): string {
  return createHmac("sha256", verifyMacKey(secret)).update(payload).digest("base64url");
}

export function signVerifyReceipt(body: Receipt, secret: string): string {
  const payload = Buffer.from(stable(body), "utf8").toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}
export function readVerifyReceipt(
  token: string,
  secret: string,
  nowMs: number,
): { ok: true; body: Receipt } | { ok: false } {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return { ok: false };
  const payload = token.slice(0, dot);
  const left = Buffer.from(token.slice(dot + 1));
  const right = Buffer.from(mac(payload, secret));
  if (left.length === 0 || left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false };
  }
  let body: Receipt;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Receipt;
  } catch {
    return { ok: false };
  }
  if (body.v !== 1 || typeof body.exp !== "number" || nowMs >= body.exp || body.pass !== true) {
    return { ok: false };
  }
  return { ok: true, body };
}
function asBoard(raw: unknown): Board {
  return raw && typeof raw === "object" ? (raw as Board) : { ok: false };
}
function leadIdea(board: Board, idea?: string): BoardIdea | undefined {
  const ideas = board.ideas ?? [];
  if (!idea) return ideas.length === 1 ? ideas[0] : ideas.find((row) => row.slug === "default");
  return ideas.find((row) => row.slug === normalizeSlug(idea));
}
function eyesStatus(scoreboard: Record<string, unknown> | undefined): string | undefined {
  const nested = scoreboard?.readyForHumanEyes;
  if (!nested || typeof nested !== "object") return undefined;
  const status = (nested as { status?: unknown }).status;
  return typeof status === "string" ? status : undefined;
}

export async function runVerify(input: {
  store: JourneyStore;
  actor: JourneyActor;
  company: string;
  claim: string;
  idea?: string;
  nowMs?: number;
  secret?: string;
}): Promise<VerifyResult | { error: string }> {
  const now = input.nowMs ?? Date.now();
  const company = normalizeSlug(input.company || "");
  const claim = canonicalClaim(input.claim || "");
  const sub = input.actor.sub?.trim() || "";
  if (!company || !claim || !sub) {
    return {
      pass: false,
      gaps: ["Company, claim, and a signed-in person are required."],
      evidence_id: null,
      expires_at: null,
    };
  }
  const board = asBoard(await input.store.getJourney(input.actor, { companySlug: company }));
  const picked = leadIdea(board, input.idea);
  const gaps = coldPathGaps(claim, board, input.idea);
  if (gaps.length > 0 || board.ok !== true || !picked?.slug) {
    return {
      pass: false,
      gaps: gaps.length ? gaps : ["That idea is not on this board."],
      evidence_id: null,
      expires_at: null,
    };
  }
  const secret = input.secret ?? verifyServerSecret();
  if (!secret) return { error: `Verify receipts are not signed on this host. ${VERIFY_HINT}` };
  const exp = now + VERIFY_TTL_MS;
  return {
    pass: true,
    gaps: [],
    evidence_id: signVerifyReceipt(
      {
        v: 1,
        pass: true,
        company,
        claim,
        sub,
        revision: journeyRevision(board),
        exp,
        idea: picked.slug,
      },
      secret,
    ),
    expires_at: new Date(exp).toISOString(),
  };
}

export async function enforceVerifyReceipt(input: {
  store: JourneyStore;
  actor: JourneyActor;
  company: string;
  idea?: string;
  journeyPhase?: number;
  scoreboard?: Record<string, unknown>;
  evidenceId?: string;
  claim?: string;
  founderWrittenDecision?: string;
  nowMs?: number;
  secret?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const company = normalizeSlug(input.company || "");
  const board = asBoard(await input.store.getJourney(input.actor, { companySlug: company }));
  const idea = board.ok === true ? leadIdea(board, input.idea) : undefined;
  const wants = input.journeyPhase !== undefined || eyesStatus(input.scoreboard) !== undefined;
  if (board.ok !== true || !idea?.slug) return wants ? { ok: false, error: VERIFY_ERROR } : { ok: true };
  const cur = Number(idea.clocks?.journeyPhase) || 1;
  const phaseChange = input.journeyPhase !== undefined && input.journeyPhase !== cur;
  const nextEyes = eyesStatus(input.scoreboard);
  const eyesToGreen = nextEyes === "green" && nextEyes !== eyesStatus(idea.scoreboard);
  if (!phaseChange && !eyesToGreen) return { ok: true };
  if (phaseChange && eyesToGreen) return { ok: false, error: VERIFY_ERROR };
  if (phaseChange && (input.journeyPhase as number) < cur) {
    if (!text(input.founderWrittenDecision)) return { ok: false, error: VERIFY_ERROR };
    return { ok: true };
  }
  if (phaseChange && input.journeyPhase !== cur + 1) return { ok: false, error: VERIFY_ERROR };
  if (phaseChange && !rungNeedsReceipt(cur)) {
    if (!text(input.founderWrittenDecision)) return { ok: false, error: VERIFY_ERROR };
    return { ok: true };
  }
  const claim = canonicalClaim(input.claim || "");
  const claimOk = phaseChange
    ? claim === "phase" || claim === `phase:${input.journeyPhase}`
    : claim === "ready-for-human-eyes";
  const secret = input.secret ?? verifyServerSecret();
  const sub = input.actor.sub?.trim() || "";
  if (!claimOk || !secret || !input.evidenceId || !sub) return { ok: false, error: VERIFY_ERROR };
  const read = readVerifyReceipt(input.evidenceId, secret, input.nowMs ?? Date.now());
  if (!read.ok) return { ok: false, error: VERIFY_ERROR };
  if (read.body.company !== company || read.body.claim !== claim || read.body.sub !== sub) {
    return { ok: false, error: VERIFY_ERROR };
  }
  if (read.body.idea !== idea.slug) return { ok: false, error: VERIFY_ERROR };
  if (read.body.revision !== journeyRevision(board)) return { ok: false, error: VERIFY_ERROR };
  return { ok: true };
}

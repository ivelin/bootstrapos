/**
 * submit_feedback — append-only ticket for the signed-in account.
 * House name until MCP core ships a feedback primitive. No board write.
 * No mail from this host. Database is the record. Cos applies the SQL.
 * PR agents: memory or PGlite only. Do not live-probe supabase-pirin-ai.
 */
import { createHash, randomBytes } from "node:crypto";
import { MCP_VERSION } from "./constants.js";
import { hostedProdIdentityAllowed } from "./identity.js";

export const FEEDBACK_PRODUCT = "bootstrap-os";
export const FEEDBACK_DEDUPE_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const FEEDBACK_KINDS = ["bug", "missing_capability", "confusing_output", "docs"] as const;
export const FEEDBACK_SEVERITIES = ["blocker", "annoying", "wish"] as const;
export const FEEDBACK_CONTEXT_LEVELS = ["identity_only", "tool_trace", "reasoning_trace"] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];
export type FeedbackContextLevel = (typeof FEEDBACK_CONTEXT_LEVELS)[number];

export type FeedbackStamp = {
  actorId: string;
  tenantId: string;
  actorEmail?: string | null;
  serverVersion?: string | null;
  deploySha?: string | null;
  protocolVersion?: string | null;
  clientName?: string | null;
  clientVersion?: string | null;
  httpUserAgent?: string | null;
};

export type PreparedFeedback = {
  kind: FeedbackKind;
  summary: string;
  expected: string | null;
  actual: string | null;
  tool: string | null;
  severity: FeedbackSeverity;
  intentContext: string | null;
  contextLevel: FeedbackContextLevel;
  pluginVersion: string | null;
  skillVersion: string | null;
  botId: string | null;
  requestId: string | null;
  submissionId: string | null;
  argumentKeys: string[] | null;
  errorCode: string | null;
  latencyMs: number | null;
  reasoning: string | null;
  actorId: string;
  tenantId: string;
  actorEmail: string | null;
  product: typeof FEEDBACK_PRODUCT;
  serverVersion: string;
  deploySha: string | null;
  protocolVersion: string | null;
  clientName: string | null;
  clientVersion: string | null;
  httpUserAgent: string | null;
  fingerprint: string;
};

export type FeedbackAck = {
  ok: true;
  id: string;
  line: string;
  duplicate: boolean;
};

export type FeedbackFailure = { ok: false; error: string };
export type FeedbackResult = FeedbackAck | FeedbackFailure;

export type FeedbackStore = {
  submit(ticket: PreparedFeedback, nowMs?: number): Promise<FeedbackResult>;
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const KEY_RE = /\b(?:sk|pk|rk|bos)_[A-Za-z0-9_]{8,}\b/gi;
const URL_SECRET_RE = /(?:postgres|postgresql|mysql|mongodb)(?:\+[a-z]+)?:\/\/\S+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const COOKIE_RE = /Cookie:\s*\S+/gi;
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b/g;
const ARG_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,64}$/;

export function redactFeedbackText(text: string, actorEmail?: string | null): string {
  const keep = actorEmail?.trim().toLowerCase() || "";
  let out = text;
  out = out.replace(BEARER_RE, "[redacted]");
  out = out.replace(KEY_RE, "[redacted]");
  out = out.replace(URL_SECRET_RE, "[redacted]");
  out = out.replace(JWT_RE, "[redacted]");
  out = out.replace(COOKIE_RE, "[redacted]");
  out = out.replace(PHONE_RE, "[redacted]");
  out = out.replace(EMAIL_RE, (match) => (match.toLowerCase() === keep ? match : "[redacted]"));
  return out;
}

export function feedbackFingerprint(input: {
  tool?: string | null;
  kind: string;
  summary: string;
}): string {
  const prefix = input.summary.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  const payload = [FEEDBACK_PRODUCT, input.tool?.trim() || "", input.kind, prefix].join("\n");
  return createHash("md5").update(payload, "utf8").digest("hex");
}

function str(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function tooLong(raw: unknown, max: number): boolean {
  return typeof raw === "string" && raw.trim().length > max;
}

function hasTraceFields(raw: Record<string, unknown>): boolean {
  return (
    raw.reasoning !== undefined ||
    raw.argument_keys !== undefined ||
    raw.argumentKeys !== undefined ||
    raw.error_code !== undefined ||
    raw.errorCode !== undefined ||
    raw.latency_ms !== undefined ||
    raw.latencyMs !== undefined
  );
}

export function prepareFeedback(
  raw: Record<string, unknown>,
  stamp: FeedbackStamp,
): { ok: true; ticket: PreparedFeedback } | FeedbackFailure {
  const actorId = stamp.actorId.trim();
  const tenantId = stamp.tenantId.trim();
  if (!actorId || !tenantId) {
    return { ok: false, error: "Sign in to Bootstrap OS and ask again." };
  }
  if (raw.user_consented !== true && raw.userConsented !== true) {
    return { ok: false, error: "Needs a yes in this chat." };
  }
  const kind = raw.kind;
  if (typeof kind !== "string" || !(FEEDBACK_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "That kind is not one of the four." };
  }
  if (typeof raw.summary !== "string" || !raw.summary.trim()) {
    return { ok: false, error: "Say what happened." };
  }
  if (tooLong(raw.summary, 2000)) return { ok: false, error: "Summary is too long." };
  if (tooLong(raw.expected, 2000) || tooLong(raw.actual, 2000)) {
    return { ok: false, error: "That note is too long." };
  }
  if (tooLong(raw.intent_context, 500) || tooLong(raw.intentContext, 500)) {
    return { ok: false, error: "That note is too long." };
  }
  if (tooLong(raw.reasoning, 8000)) return { ok: false, error: "That note is too long." };

  const contextLevel = (raw.context_level ?? raw.contextLevel ?? "identity_only") as string;
  if (!(FEEDBACK_CONTEXT_LEVELS as readonly string[]).includes(contextLevel)) {
    return { ok: false, error: "That context level is not one of the three." };
  }
  if (contextLevel === "identity_only" && hasTraceFields(raw)) {
    return { ok: false, error: "Leave the trace off this ticket." };
  }

  const severityRaw = (raw.severity ?? "annoying") as string;
  if (!(FEEDBACK_SEVERITIES as readonly string[]).includes(severityRaw)) {
    return { ok: false, error: "That severity is not one of the three." };
  }

  const actorEmail = stamp.actorEmail?.trim().toLowerCase() || null;
  const summary = redactFeedbackText(raw.summary.trim(), actorEmail);
  const expected = str(raw.expected, 2000);
  const actual = str(raw.actual, 2000);
  const intentRaw = str(raw.intent_context ?? raw.intentContext, 500);
  const toolRaw = str(raw.tool, 80);
  if (toolRaw && !/^[A-Za-z0-9_]{1,80}$/.test(toolRaw)) {
    return { ok: false, error: "Name the tool in plain letters." };
  }

  let argumentKeys: string[] | null = null;
  let errorCode: string | null = null;
  let latencyMs: number | null = null;
  let reasoning: string | null = null;
  if (contextLevel === "tool_trace" || contextLevel === "reasoning_trace") {
    const keysRaw = raw.argument_keys ?? raw.argumentKeys;
    if (keysRaw !== undefined) {
      if (!Array.isArray(keysRaw) || keysRaw.length > 32) {
        return { ok: false, error: "Name the argument keys only." };
      }
      const keys: string[] = [];
      for (const key of keysRaw) {
        if (typeof key !== "string" || !ARG_KEY_RE.test(key)) {
          return { ok: false, error: "Name the argument keys only." };
        }
        keys.push(key);
      }
      argumentKeys = keys;
    }
    const code = str(raw.error_code ?? raw.errorCode, 80);
    errorCode = code ? redactFeedbackText(code, actorEmail) : null;
    const latency = raw.latency_ms ?? raw.latencyMs;
    if (latency !== undefined) {
      if (typeof latency !== "number" || !Number.isInteger(latency) || latency < 0 || latency > 600_000) {
        return { ok: false, error: "Latency must be a small whole number." };
      }
      latencyMs = latency;
    }
  }
  if (contextLevel === "reasoning_trace") {
    if (typeof raw.reasoning !== "string" || !raw.reasoning.trim()) {
      return { ok: false, error: "Needs the pasted note." };
    }
    reasoning = redactFeedbackText(raw.reasoning.trim(), actorEmail);
    if (!reasoning.trim()) return { ok: false, error: "Needs the pasted note." };
  }

  const submissionRaw = str(raw.submissionId ?? raw.submission_id, 80);
  if (submissionRaw && !/^[A-Za-z0-9_-]{8,80}$/.test(submissionRaw)) {
    return { ok: false, error: "The submission id must be 8 to 80 plain letters." };
  }

  const label = (value: unknown, max = 80) => {
    const text = str(value, max);
    return text ? redactFeedbackText(text, actorEmail).slice(0, max) : null;
  };

  const ticket: PreparedFeedback = {
    kind: kind as FeedbackKind,
    summary,
    expected: expected ? redactFeedbackText(expected, actorEmail) : null,
    actual: actual ? redactFeedbackText(actual, actorEmail) : null,
    tool: toolRaw,
    severity: severityRaw as FeedbackSeverity,
    intentContext: intentRaw ? redactFeedbackText(intentRaw, actorEmail) : null,
    contextLevel: contextLevel as FeedbackContextLevel,
    pluginVersion: label(raw.plugin_version ?? raw.pluginVersion),
    skillVersion: label(raw.skill_version ?? raw.skillVersion),
    botId: label(raw.bot_id ?? raw.botId),
    requestId: label(raw.request_id ?? raw.requestId),
    submissionId: submissionRaw,
    argumentKeys,
    errorCode,
    latencyMs,
    reasoning,
    actorId,
    tenantId,
    actorEmail,
    product: FEEDBACK_PRODUCT,
    serverVersion: stamp.serverVersion?.trim() || MCP_VERSION,
    deploySha: stamp.deploySha?.trim() || null,
    protocolVersion: stamp.protocolVersion?.trim() || null,
    clientName: stamp.clientName?.trim() || null,
    clientVersion: stamp.clientVersion?.trim() || null,
    httpUserAgent: stamp.httpUserAgent?.trim()?.slice(0, 200) || null,
    fingerprint: feedbackFingerprint({ tool: toolRaw, kind, summary }),
  };
  return { ok: true, ticket };
}

export function feedbackLine(id: string, duplicate: boolean): string {
  return duplicate ? `Already filed ${id}. A person reads it.` : `Filed ${id}. A person reads it.`;
}

type StoredTicket = PreparedFeedback & { id: string; createdAt: number };

export class MemoryFeedbackStore implements FeedbackStore {
  readonly rows: StoredTicket[] = [];

  async submit(ticket: PreparedFeedback, nowMs = Date.now()): Promise<FeedbackResult> {
    const prior = this.rows.find((row) => {
      if (row.actorId !== ticket.actorId) return false;
      if (nowMs - row.createdAt > FEEDBACK_DEDUPE_MS) return false;
      if (ticket.submissionId && row.submissionId === ticket.submissionId) return true;
      return row.fingerprint === ticket.fingerprint;
    });
    if (prior) {
      return { ok: true, id: prior.id, line: feedbackLine(prior.id, true), duplicate: true };
    }
    const id = `fb_${randomBytes(8).toString("hex")}`;
    this.rows.push({ ...ticket, id, createdAt: nowMs });
    return { ok: true, id, line: feedbackLine(id, false), duplicate: false };
  }

  /** Test canary. Not an MCP tool. */
  listFor(actorId: string): StoredTicket[] {
    return this.rows.filter((row) => row.actorId === actorId);
  }
}

let testStore: FeedbackStore | null | undefined;

export function setFeedbackStoreForTests(store: FeedbackStore | null | undefined): void {
  testStore = store;
}

function supabaseUrl(): string | undefined {
  return process.env.BOOTSTRAP_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

function supabaseAnonKey(): string | undefined {
  return (
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

export class SupabaseFeedbackStore implements FeedbackStore {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly accessToken: string,
  ) {}

  async submit(ticket: PreparedFeedback): Promise<FeedbackResult> {
    const base = this.url.replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/rest/v1/rpc/bootstrap_os_submit_feedback`, {
        method: "POST",
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ p_body: ticketToRpcBody(ticket) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, error: "Could not file that." };
    }
    if (!res.ok) return { ok: false, error: `feedback_rpc_failed:${res.status}` };
    let raw: unknown = null;
    try {
      raw = await res.json();
    } catch {
      return { ok: false, error: "Could not file that." };
    }
    return parseFeedbackAck(raw);
  }
}

export function ticketToRpcBody(ticket: PreparedFeedback): Record<string, unknown> {
  const body: Record<string, unknown> = {
    kind: ticket.kind,
    summary: ticket.summary,
    user_consented: true,
    severity: ticket.severity,
    context_level: ticket.contextLevel,
    server_version: ticket.serverVersion,
  };
  const optional: Record<string, unknown> = {
    tool: ticket.tool,
    expected: ticket.expected,
    actual: ticket.actual,
    intent_context: ticket.intentContext,
    plugin_version: ticket.pluginVersion,
    skill_version: ticket.skillVersion,
    bot_id: ticket.botId,
    request_id: ticket.requestId,
    submission_id: ticket.submissionId,
    argument_keys: ticket.argumentKeys,
    error_code: ticket.errorCode,
    latency_ms: ticket.latencyMs,
    reasoning: ticket.reasoning,
    client_name: ticket.clientName,
    client_version: ticket.clientVersion,
    http_user_agent: ticket.httpUserAgent,
    protocol_version: ticket.protocolVersion,
    deploy_sha: ticket.deploySha,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    body[key] = value;
  }
  return body;
}

export function parseFeedbackAck(raw: unknown): FeedbackResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Could not file that." };
  const body = raw as { ok?: unknown; id?: unknown; line?: unknown; duplicate?: unknown; error?: unknown };
  if (body.ok !== true || typeof body.id !== "string" || typeof body.line !== "string") {
    const error = typeof body.error === "string" && body.error.trim() ? body.error.trim() : "Could not file that.";
    return { ok: false, error: error.slice(0, 200) };
  }
  return {
    ok: true,
    id: body.id,
    line: body.line,
    duplicate: body.duplicate === true,
  };
}

export function createSupabaseFeedbackStore(accessToken?: string): FeedbackStore | null {
  if (!hostedProdIdentityAllowed()) return null;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key || !accessToken) return null;
  return new SupabaseFeedbackStore(url, key, accessToken);
}

export function resolveFeedbackStore(accessToken?: string): FeedbackStore | null {
  if (testStore !== undefined) return testStore;
  return createSupabaseFeedbackStore(accessToken);
}

export type RateDecision =
  | { ok: true; remaining: number }
  | { ok: false; reason: "rate_limited"; retryAt: string; message: string }
  | { ok: false; reason: "rate_limiter_unavailable"; message: string };

export type RateTakeInput = {
  actorId: string;
  action: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

export type RateQuery = (
  sql: string,
  params: readonly unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export interface RateLimiter {
  take(input: RateTakeInput): Promise<RateDecision>;
}

const ACTION_RE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_LIMIT = 1_000_000;
const MAX_WINDOW_SECONDS = 366 * 24 * 60 * 60;
const MAX_WINDOW_MS = MAX_WINDOW_SECONDS * 1000;
const SWEEP_LIMIT = 32;
const UNAVAILABLE_MESSAGE = "The limiter could not be reached. This action was refused.";

const FUNCTION_NAME_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;
const DEFAULT_TAKE_FUNCTION = "public.bootstrap_rate_take";

function takeSql(functionName: string): string {
  return `select ${functionName}($1::text, $2::text, $3::int, $4::int, $5::timestamptz) as decision`;
}

type Bucket = { taken: number; windowMs: number };

type CheckedTake = {
  actorId: string;
  action: string;
  limit: number;
  windowMs: number;
};

function unavailable(): RateDecision {
  return { ok: false, reason: "rate_limiter_unavailable", message: UNAVAILABLE_MESSAGE };
}

function limited(action: string, retryAt: string): RateDecision {
  return {
    ok: false,
    reason: "rate_limited",
    retryAt,
    message: `Limit reached for ${action}. Try again after ${retryAt}.`,
  };
}

function check(input: RateTakeInput): CheckedTake | RateDecision {
  const actorId = typeof input.actorId === "string" ? input.actorId.trim() : "";
  if (!actorId) return unavailable();
  if (typeof input.action !== "string" || !ACTION_RE.test(input.action)) return unavailable();
  if (!Number.isInteger(input.limit) || input.limit < 0 || input.limit > MAX_LIMIT) return unavailable();
  if (
    !Number.isInteger(input.windowMs) ||
    input.windowMs <= 0 ||
    input.windowMs > MAX_WINDOW_MS ||
    input.windowMs % 1000 !== 0
  ) {
    return unavailable();
  }
  if (input.now !== undefined && (!(input.now instanceof Date) || Number.isNaN(input.now.getTime()))) {
    return unavailable();
  }
  return { actorId, action: input.action, limit: input.limit, windowMs: input.windowMs };
}

function isRefusal(value: CheckedTake | RateDecision): value is RateDecision {
  return "ok" in value;
}

function bucketKey(actorId: string, action: string, windowStartMs: number): string {
  return `${actorId}\0${action}\0${windowStartMs}`;
}

function expired(startMs: number, windowMs: number, nowMs: number): boolean {
  return startMs + windowMs <= nowMs;
}

function sweep(buckets: Map<string, Bucket>, actorId: string, action: string, nowMs: number): void {
  const prefix = `${actorId}\0${action}\0`;
  for (const key of [...buckets.keys()]) {
    if (!key.startsWith(prefix)) continue;
    const row = buckets.get(key);
    if (!row) continue;
    const startMs = Number(key.slice(prefix.length));
    if (expired(startMs, row.windowMs, nowMs)) buckets.delete(key);
  }
  const doomed: string[] = [];
  for (const key of [...buckets.keys()].sort()) {
    const row = buckets.get(key);
    if (!row) continue;
    const startMs = Number(key.split("\0")[2]);
    if (!Number.isFinite(startMs) || !expired(startMs, row.windowMs, nowMs)) continue;
    doomed.push(key);
    if (doomed.length === SWEEP_LIMIT) break;
  }
  for (const key of doomed) buckets.delete(key);
}

function applyCharge(buckets: Map<string, Bucket>, input: CheckedTake & { now: Date }): RateDecision {
  const nowMs = input.now.getTime();
  const startMs = nowMs - (nowMs % input.windowMs);
  const retryAt = new Date(startMs + input.windowMs).toISOString();
  sweep(buckets, input.actorId, input.action, nowMs);
  if (input.limit < 1) return limited(input.action, retryAt);
  const key = bucketKey(input.actorId, input.action, startMs);
  const row = buckets.get(key);
  if (!row) {
    buckets.set(key, { taken: 1, windowMs: input.windowMs });
    return { ok: true, remaining: input.limit - 1 };
  }
  if (row.taken < input.limit) {
    row.taken += 1;
    return { ok: true, remaining: input.limit - row.taken };
  }
  return limited(input.action, retryAt);
}

export function memoryRateLimiter(options?: { now?: () => Date }): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const tails = new Map<string, Promise<void>>();
  const now = () => options?.now?.() ?? new Date();

  return {
    async take(input) {
      const checked = check(input);
      if (isRefusal(checked)) return checked;
      const key = `${checked.actorId}\0${checked.action}`;
      const previous = tails.get(key) ?? Promise.resolve();
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tail = previous.then(
        () => gate,
        () => gate,
      );
      tails.set(key, tail);
      await previous.catch(() => undefined);
      try {
        await Promise.resolve();
        const at = input.now ?? now();
        if (!(at instanceof Date) || Number.isNaN(at.getTime())) return unavailable();
        return applyCharge(buckets, { ...checked, now: at });
      } catch {
        return unavailable();
      } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
      }
    },
  };
}

function readPayload(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function decisionFromPayload(value: unknown): RateDecision {
  const payload = readPayload(value);
  if (!payload || typeof payload.ok !== "boolean") return unavailable();
  if (payload.ok === true) {
    return typeof payload.remaining === "number" && Number.isFinite(payload.remaining)
      ? { ok: true, remaining: payload.remaining }
      : unavailable();
  }
  const reason = payload.reason ?? payload.error;
  if (reason === "rate_limited" && typeof payload.retryAt === "string" && typeof payload.message === "string") {
    return {
      ok: false,
      reason: "rate_limited",
      retryAt: payload.retryAt,
      message: payload.message,
    };
  }
  if (reason === "rate_limiter_unavailable" && typeof payload.message === "string") {
    return { ok: false, reason: "rate_limiter_unavailable", message: payload.message };
  }
  return unavailable();
}

export function postgresRateLimiter(
  query: RateQuery,
  functionName: string = DEFAULT_TAKE_FUNCTION,
): RateLimiter {
  if (!FUNCTION_NAME_RE.test(functionName)) {
    return { async take() { return unavailable(); } };
  }
  const sql = takeSql(functionName);
  return {
    async take(input) {
      const checked = check(input);
      if (isRefusal(checked)) return checked;
      const at = input.now ?? new Date();
      try {
        const result = await query(sql, [
          checked.actorId,
          checked.action,
          checked.limit,
          checked.windowMs / 1000,
          at,
        ]);
        const row = result?.rows?.[0];
        if (!row) return unavailable();
        return decisionFromPayload(row.decision);
      } catch {
        return unavailable();
      }
    },
  };
}

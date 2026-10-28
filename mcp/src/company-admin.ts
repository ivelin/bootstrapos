/**
 * Hosted company create + super_admin grant/revoke.
 * Authority is the SECURITY DEFINER RPCs. This module does not mint tenants.
 * Preview never attaches. Tests inject a store. No email-domain admin heuristic.
 */
import { randomUUID } from "node:crypto";
import { hostedProdIdentityAllowed } from "./identity.js";
import { HOSTED_DAILY_CAPS, hostedActorKey, refusalMessage } from "./hosted-caps.js";
import { memoryRateLimiter, type RateLimiter } from "./rate-limit.js";

export type HostedAdminRole = "member" | "super_admin" | "unset";

export type AdminResult = {
  ok: boolean;
  status?: number;
  error?: string;
  message?: string;
  retryAt?: string;
  slug?: string;
  displayName?: string | null;
  email?: string;
  role?: HostedAdminRole;
  companyId?: string;
};

const FORBIDDEN_ERRORS = new Set([
  "self_grant",
  "founder_yes_required",
  "invalid_slug",
  "invalid_name",
  "ask_admin",
]);

export const BET_BOARD_LIMIT_MESSAGE = "You can open up to 3 bet boards.";
export const BET_BOARD_CONFIRM_MESSAGE = "Confirm your email before you open a bet board.";
export const BET_BOARD_READY_MESSAGE = "Your bet board is ready.";

const BET_BOARD_ERRORS: Record<string, string> = {
  company_limit_reached: BET_BOARD_LIMIT_MESSAGE,
  email_unconfirmed: BET_BOARD_CONFIRM_MESSAGE,
};

const CONFLICT_ERRORS = new Set(["slug_taken", "last_super_admin"]);

/** Fail-closed shape. 403 and 409 drop anything that is not an allow-listed error code. */
export function publicAdminResult(raw: AdminResult): AdminResult {
  if (!raw.ok && typeof raw.error === "string" && BET_BOARD_ERRORS[raw.error]) {
    return { ok: false, status: 403, error: raw.error, message: BET_BOARD_ERRORS[raw.error] };
  }
  if (
    raw.status === 409 ||
    (raw.ok === false && typeof raw.error === "string" && CONFLICT_ERRORS.has(raw.error))
  ) {
    const error =
      typeof raw.error === "string" && CONFLICT_ERRORS.has(raw.error) ? raw.error : "slug_taken";
    return { ok: false, status: 409, error };
  }
  if (!raw.ok) {
    if (raw.status === 403 && raw.error && FORBIDDEN_ERRORS.has(raw.error)) {
      return { ok: false, status: 403, error: raw.error };
    }
    return { ok: false, status: 403 };
  }
  const out: AdminResult = { ok: true };
  if (typeof raw.slug === "string") out.slug = raw.slug;
  if (raw.displayName !== undefined) out.displayName = raw.displayName;
  if (typeof raw.email === "string") out.email = raw.email;
  if (raw.role === "member" || raw.role === "super_admin" || raw.role === "unset") {
    out.role = raw.role;
  }
  if (typeof raw.companyId === "string" && /^[0-9a-f-]{36}$/i.test(raw.companyId)) {
    out.companyId = raw.companyId;
  }
  if (raw.message === BET_BOARD_READY_MESSAGE) out.message = raw.message;
  return out;
}

export function askAdminResult(): AdminResult {
  return { ok: false, status: 403, error: "ask_admin" };
}

export interface CompanyAdminStore {
  createCompany(
    actorEmail: string,
    input: { slug: string; displayName?: string; founderYes: boolean; why?: string },
  ): Promise<AdminResult>;
  createCompanySelfServe(actorEmail: string, name: string): Promise<AdminResult>;
  grantSuperAdmin(actorEmail: string, email: string): Promise<AdminResult>;
  revokeSuperAdmin(actorEmail: string, email: string): Promise<AdminResult>;
}

type RoleRow = {
  email: string;
  role: "member" | "super_admin";
  revokedAt: string | null;
};

type AuditRow = {
  op: "create_company" | "grant_super_admin" | "revoke_super_admin";
  actorEmail: string;
  targetEmail?: string;
  slug?: string;
  why?: string;
};

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function closed(): AdminResult {
  return { ok: false, status: 403 };
}

export class MemoryCompanyAdminStore implements CompanyAdminStore {
  readonly labels = new Map<string, Set<string>>();
  readonly companies = new Map<string, { displayName: string | null; createdBy: string }>();
  readonly selfServe: Array<{ actor: string; slug: string; companyId: string }> = [];
  readonly roles: RoleRow[] = [];
  readonly audit: AuditRow[] = [];
  private readonly limiter: RateLimiter;

  constructor(
    seed: Array<{ email: string; role: "member" | "super_admin"; labels?: string[] }> = [],
    options?: { limiter?: RateLimiter },
  ) {
    this.limiter = options?.limiter ?? memoryRateLimiter();
    for (const row of seed) {
      const email = row.email.toLowerCase();
      this.roles.push({ email, role: row.role, revokedAt: null });
      this.labels.set(email, new Set(row.labels ?? []));
    }
  }

  private liveRole(email: string): "member" | "super_admin" | null {
    const hits = this.roles.filter((row) => row.email === email && row.revokedAt === null);
    if (hits.some((row) => row.role === "super_admin")) return "super_admin";
    if (hits.some((row) => row.role === "member")) return "member";
    return null;
  }

  private known(email: string): boolean {
    return this.roles.some((row) => row.email === email) || this.labels.has(email);
  }

  async createCompany(
    actorEmail: string,
    input: { slug: string; displayName?: string; founderYes: boolean; why?: string },
  ): Promise<AdminResult> {
    const actor = actorEmail.toLowerCase();
    if (this.liveRole(actor) !== "super_admin") return closed();
    if (input.founderYes !== true) {
      return { ok: false, status: 403, error: "founder_yes_required" };
    }
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return { ok: false, status: 403, error: "invalid_slug" };
    const taken =
      this.companies.has(slug) ||
      [...this.labels.values()].some((set) => set.has(slug));
    if (taken) return { ok: false, status: 409, error: "slug_taken" };
    const decision = await this.limiter.take({
      actorId: hostedActorKey({ email: actor }),
      action: "create_company",
      limit: HOSTED_DAILY_CAPS.create_company.limit,
      windowMs: HOSTED_DAILY_CAPS.create_company.windowMs,
    });
    if (!decision.ok) {
      const refused: AdminResult = {
        ok: false,
        error: decision.reason,
        message: decision.message,
      };
      if (decision.reason === "rate_limited") refused.retryAt = decision.retryAt;
      return refused;
    }
    const displayName = input.displayName?.trim() ? input.displayName.trim() : null;
    this.companies.set(slug, { displayName, createdBy: actor });
    const held = this.labels.get(actor) ?? new Set<string>();
    held.add(slug);
    this.labels.set(actor, held);
    this.audit.push({
      op: "create_company",
      actorEmail: actor,
      slug,
      why: input.why,
    });
    return { ok: true, slug, displayName, role: "super_admin" };
  }

  async createCompanySelfServe(actorEmail: string, name: string): Promise<AdminResult> {
    const actor = actorEmail.toLowerCase();
    const slug = name.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return { ok: false, status: 403, error: "invalid_name" };
    if (this.selfServe.filter((row) => row.actor === actor).length >= 3) {
      return { ok: false, status: 403, error: "company_limit_reached" };
    }
    if (this.companies.has(slug) || this.selfServe.some((row) => row.slug === slug)) {
      return { ok: false, status: 409, error: "slug_taken" };
    }
    const companyId = randomUUID();
    this.selfServe.push({ actor, slug, companyId });
    this.companies.set(slug, { displayName: slug, createdBy: actor });
    const held = this.labels.get(actor) ?? new Set<string>();
    held.add(slug);
    this.labels.set(actor, held);
    return { ok: true, slug, companyId, message: BET_BOARD_READY_MESSAGE };
  }

  async grantSuperAdmin(actorEmail: string, email: string): Promise<AdminResult> {
    const actor = actorEmail.toLowerCase();
    if (this.liveRole(actor) !== "super_admin") return closed();
    const target = email.trim().toLowerCase();
    if (!target) return closed();
    if (target === actor) return { ok: false, status: 403, error: "self_grant" };
    if (!this.known(target)) return closed();
    if (this.liveRole(target) !== "super_admin") {
      for (const row of this.roles) {
        if (row.email === target && row.revokedAt === null) row.revokedAt = new Date().toISOString();
      }
      this.roles.push({ email: target, role: "super_admin", revokedAt: null });
    }
    this.audit.push({ op: "grant_super_admin", actorEmail: actor, targetEmail: target, why: "grant" });
    return { ok: true, email: target, role: "super_admin" };
  }

  async revokeSuperAdmin(actorEmail: string, email: string): Promise<AdminResult> {
    const actor = actorEmail.toLowerCase();
    if (this.liveRole(actor) !== "super_admin") return closed();
    const target = email.trim().toLowerCase();
    if (!target || !this.known(target)) return closed();
    const live = this.roles.find(
      (row) => row.email === target && row.role === "super_admin" && row.revokedAt === null,
    );
    if (!live) return closed();
    const liveAdmins = this.roles.filter(
      (row) => row.role === "super_admin" && row.revokedAt === null,
    );
    if (liveAdmins.length <= 1) {
      return { ok: false, status: 409, error: "last_super_admin" };
    }
    live.revokedAt = new Date().toISOString();
    if (this.liveRole(target) === null) {
      this.roles.push({ email: target, role: "member", revokedAt: null });
    }
    this.audit.push({
      op: "revoke_super_admin",
      actorEmail: actor,
      targetEmail: target,
      why: "revoke",
    });
    return { ok: true, email: target, role: "member" };
  }
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

function rpcErrorCode(text: string): string | undefined {
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    return undefined;
  }
  return undefined;
}

function asResult(raw: unknown): AdminResult {
  const blocked = refusalMessage(raw);
  if (blocked) {
    const record =
      typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : {};
    const code =
      typeof record.error === "string"
        ? record.error
        : typeof record.reason === "string"
          ? record.reason
          : undefined;
    const out: AdminResult = { ok: false, message: blocked };
    if (code) out.error = code;
    if (typeof record.retryAt === "string" && record.retryAt) out.retryAt = record.retryAt;
    return out;
  }
  if (!raw || typeof raw !== "object") return closed();
  const body = raw as AdminResult;
  if (typeof body.ok !== "boolean") return closed();
  return publicAdminResult(body);
}

export class SupabaseCompanyAdminStore implements CompanyAdminStore {
  readonly kind = "supabase" as const;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly accessToken: string,
  ) {}

  private async rpc(name: string, body: Record<string, unknown>): Promise<AdminResult> {
    const base = this.url.replace(/\/+$/, "");
    const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 409) return { ok: false, status: 409, error: "slug_taken" };
      return closed();
    }
    try {
      return asResult(text ? JSON.parse(text) : null);
    } catch {
      return closed();
    }
  }

  createCompany(
    _actorEmail: string,
    input: { slug: string; displayName?: string; founderYes: boolean; why?: string },
  ): Promise<AdminResult> {
    return this.rpc("bootstrap_os_create_company", {
      p_slug: input.slug,
      p_display_name: input.displayName ?? null,
      p_founder_yes: input.founderYes,
      p_why: input.why ?? null,
    });
  }

  async createCompanySelfServe(_actorEmail: string, name: string): Promise<AdminResult> {
    const base = this.url.replace(/\/+$/, "");
    const res = await fetch(`${base}/rest/v1/rpc/create_company_self_serve`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      const code = rpcErrorCode(text);
      if (code === "slug_taken") return { ok: false, status: 409, error: "slug_taken" };
      if (code === "company_limit_reached" || code === "email_unconfirmed" || code === "invalid_name") {
        return { ok: false, status: 403, error: code };
      }
      return closed();
    }
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return closed();
    }
    if (typeof parsed !== "string") return closed();
    return {
      ok: true,
      companyId: parsed,
      slug: name.trim().toLowerCase(),
      message: BET_BOARD_READY_MESSAGE,
    };
  }

  grantSuperAdmin(_actorEmail: string, email: string): Promise<AdminResult> {
    return this.rpc("bootstrap_os_grant_super_admin", { p_email: email });
  }

  revokeSuperAdmin(_actorEmail: string, email: string): Promise<AdminResult> {
    return this.rpc("bootstrap_os_revoke_super_admin", { p_email: email });
  }
}

export function createCompanyAdminStore(accessToken?: string): CompanyAdminStore | null {
  if (!hostedProdIdentityAllowed()) return null;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key || !accessToken) return null;
  return new SupabaseCompanyAdminStore(url, key, accessToken);
}

let testStore: CompanyAdminStore | null | undefined;

export function setCompanyAdminStoreForTests(store: CompanyAdminStore | null | undefined): void {
  testStore = store;
}

export function resolveCompanyAdminStore(accessToken?: string): CompanyAdminStore | null {
  if (testStore !== undefined) return testStore;
  return createCompanyAdminStore(accessToken);
}

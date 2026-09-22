/**
 * Hosted-MCP identity: pirin.ai access token → whoami + company labels.
 * Fail-closed: a valid JWT is not enough; email/auth_user must be on bootstrap_mcp_mentees.
 * Public OS tools do not use this module. No company-state. No boards.
 * Product path is a JWT issued by pirin.ai login (authorization code + PKCE).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isJwtAccessToken } from "./oauth.js";

export type HostedRole = "member" | "super_admin" | "unset";

export function parseHostedRole(raw: unknown): HostedRole {
  return raw === "member" || raw === "super_admin" || raw === "unset" ? raw : "unset";
}

export type HostedWhoami = {
  authenticated: boolean;
  email?: string;
  labels: string[];
  role?: HostedRole;
  reason?: string;
  note?: string;
  identityStore?: "supabase" | "memory" | "unset";
};

export type MenteeRecord = {
  id: string;
  email: string;
  authUserId: string | null;
  labels: string[];
  tokenHashes: string[];
  role?: HostedRole;
};

export interface IdentityStore {
  readonly kind: "supabase" | "memory";
  whoami(token: string | undefined): Promise<HostedWhoami>;
}

export const IVELIN_SEED_EMAIL = "founder@example.test";
export const IVELIN_SEED_LABELS = ["alpha", "bravo", "charlie"] as const;

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseBearerToken(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return undefined;
  const token = match[1].trim();
  return token.length >= 16 ? token : undefined;
}

export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Mirrors SQL: mentees_select_own / labels_select_own. */
export function rlsVisibleMentees(
  rows: MenteeRecord[],
  actorAuthUserId: string | null,
): MenteeRecord[] {
  if (!actorAuthUserId) return [];
  return rows.filter((row) => row.authUserId === actorAuthUserId);
}

export function rlsVisibleLabels(
  rows: MenteeRecord[],
  actorAuthUserId: string | null,
): string[] {
  return rlsVisibleMentees(rows, actorAuthUserId).flatMap((row) => [...row.labels].sort());
}

export function whoamiFromMentee(mentee: MenteeRecord | undefined, store: HostedWhoami["identityStore"]): HostedWhoami {
  if (!mentee) {
    return {
      authenticated: false,
      labels: [],
      reason: "invalid_or_revoked_token",
      identityStore: store,
    };
  }
  return {
    authenticated: true,
    email: mentee.email,
    labels: [...mentee.labels].sort(),
    role: mentee.role ?? "unset",
    note: "Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.",
    identityStore: store,
  };
}

export type LabelsRpcBody = {
  authenticated?: unknown;
  email?: unknown;
  labels?: unknown;
  role?: unknown;
  reason?: unknown;
  note?: unknown;
};

/**
 * Fail-closed: a valid pirin JWT is not enough. RPC must say authenticated: true
 * (row on bootstrap_mcp_mentees). Mirrors SQL bootstrap_mcp_my_labels.
 */
export function whoamiFromLabelsRpc(
  userEmail: string | undefined,
  raw: LabelsRpcBody | null,
  rpcOk: boolean,
): HostedWhoami {
  if (!rpcOk || !raw) {
    return {
      authenticated: false,
      labels: [],
      reason: "identity_lookup_failed",
      identityStore: "supabase",
    };
  }
  const email = typeof raw.email === "string" ? raw.email : userEmail;
  if (raw.authenticated !== true) {
    return {
      authenticated: false,
      email,
      labels: [],
      reason: typeof raw.reason === "string" && raw.reason ? raw.reason : "not_invited",
      identityStore: "supabase",
    };
  }
  const labels = Array.isArray(raw.labels) ? raw.labels.map(String).sort() : [];
  return {
    authenticated: true,
    email,
    labels,
    role: parseHostedRole(raw.role),
    note:
      typeof raw.note === "string" && raw.note
        ? raw.note
        : "Companies this login can open. A company may have several ideas; each idea is its own 0-1 board.",
    identityStore: "supabase",
  };
}

export class MemoryIdentityStore implements IdentityStore {
  readonly kind = "memory" as const;
  constructor(private readonly mentees: MenteeRecord[]) {}

  async whoami(token: string | undefined): Promise<HostedWhoami> {
    if (!token || token.length < 16) {
      return {
        authenticated: false,
        labels: [],
        reason: "missing_or_short_token",
        identityStore: "memory",
      };
    }
    const digest = hashMcpToken(token);
    const mentee = this.mentees.find((row) => row.tokenHashes.some((h) => hashesEqual(h, digest)));
    return whoamiFromMentee(mentee, "memory");
  }
}

export function ivelinMemoryFixture(token: string): MemoryIdentityStore {
  return new MemoryIdentityStore([
    {
      id: "mentee-ivelin",
      email: IVELIN_SEED_EMAIL,
      authUserId: "auth-ivelin",
      labels: [...IVELIN_SEED_LABELS],
      role: "member",
      tokenHashes: [hashMcpToken(token)],
    },
    {
      id: "mentee-other",
      email: "other@example.test",
      authUserId: "auth-other",
      labels: ["secret-other"],
      role: "unset",
      tokenHashes: [hashMcpToken("bos_other_token_fixture_xx")],
    },
  ]);
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

export function identityEnvConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export class SupabaseIdentityStore implements IdentityStore {
  readonly kind = "supabase" as const;
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  async whoami(token: string | undefined): Promise<HostedWhoami> {
    if (!token || token.length < 16) {
      return {
        authenticated: false,
        labels: [],
        reason: "missing_or_short_token",
        identityStore: "supabase",
      };
    }
    if (!isJwtAccessToken(token)) {
      return {
        authenticated: false,
        labels: [],
        reason: "not_a_pirin_access_token",
        identityStore: "supabase",
      };
    }
    const base = this.url.replace(/\/+$/, "");
    const userRes = await fetch(`${base}/auth/v1/user`, {
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!userRes.ok) {
      return {
        authenticated: false,
        labels: [],
        reason: "invalid_or_revoked_token",
        identityStore: "supabase",
      };
    }
    const user = (await userRes.json()) as { email?: string };
    const labelsRes = await fetch(`${base}/rest/v1/rpc/bootstrap_mcp_my_labels`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    let raw: LabelsRpcBody | null = null;
    if (labelsRes.ok) {
      raw = (await labelsRes.json()) as LabelsRpcBody;
    }
    return whoamiFromLabelsRpc(user.email, raw, labelsRes.ok);
  }
}

/**
 * Live pirin.ai Supabase is production-pin only.
 * Preview / development / CI / local must not attach even if BOOTSTRAP_SUPABASE_* is set.
 * Tests inject PGlite/memory via setIdentityStoreForTests.
 */
export function hostedProdIdentityAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

export function createIdentityStore(): IdentityStore | null {
  if (!hostedProdIdentityAllowed()) return null;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  return new SupabaseIdentityStore(url, key);
}

let testStore: IdentityStore | null | undefined;

/** Test hook. Pass null to force unset. Omit to restore production lookup. */
export function setIdentityStoreForTests(store: IdentityStore | null | undefined): void {
  testStore = store;
}

export function resolveIdentityStore(): IdentityStore | null {
  if (testStore !== undefined) return testStore;
  return createIdentityStore();
}

export async function resolveHostedWhoami(authorizationHeader: string | null | undefined): Promise<HostedWhoami> {
  const token = parseBearerToken(authorizationHeader);
  const store = resolveIdentityStore();
  if (!store) {
    return {
      authenticated: false,
      labels: [],
      reason: token ? "identity_store_unset" : "missing_or_short_token",
      identityStore: "unset",
      note: "Public OS tools stay open. Gated tools need a pirin.ai access token and this host's Supabase env.",
    };
  }
  return store.whoami(token);
}

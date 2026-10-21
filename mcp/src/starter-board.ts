/**
 * One private starter bet board per confirmed signup.
 * It cannot take invites and it cannot become a real company.
 */
import { randomBytes } from "node:crypto";
import { hostedProdIdentityAllowed } from "./identity.js";

export type StarterBoardRecord = {
  email: string;
  slug: string;
  invites: false;
  promotable: false;
};

export type StarterCreateResult =
  | { ok: true; created: boolean; board: StarterBoardRecord }
  | { ok: false; error: string };

export interface StarterBoardStore {
  create(email: string): Promise<StarterCreateResult>;
  isSandbox(slug: string): Promise<boolean>;
  promote(email: string): Promise<{ ok: false; error: "sandbox_cannot_promote" }>;
}

function randomStarterSlug(): string {
  return `sb${randomBytes(4).toString("hex")}`;
}

export class MemoryStarterStore implements StarterBoardStore {
  private readonly byEmail = new Map<string, StarterBoardRecord>();
  private readonly inflight = new Map<string, Promise<StarterCreateResult>>();

  constructor(
    private readonly onCreated?: (email: string, slug: string) => void,
    private readonly nextSlug: () => string = randomStarterSlug,
  ) {}

  async create(email: string): Promise<StarterCreateResult> {
    const owner = email.trim().toLowerCase();
    if (!owner || !owner.includes("@")) return { ok: false, error: "confirmed_signup_required" };
    const pending = this.inflight.get(owner);
    if (pending) return pending;
    const run = this.createOnce(owner);
    this.inflight.set(owner, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(owner);
    }
  }

  private async createOnce(owner: string): Promise<StarterCreateResult> {
    await Promise.resolve();
    const existing = this.byEmail.get(owner);
    if (existing) return { ok: true, created: false, board: existing };
    const used = new Set([...this.byEmail.values()].map((board) => board.slug));
    let slug = this.nextSlug();
    for (let attempt = 0; attempt < 8 && used.has(slug); attempt += 1) {
      slug = this.nextSlug();
    }
    if (used.has(slug)) return { ok: false, error: "starter_cap" };
    const board: StarterBoardRecord = {
      email: owner,
      slug,
      invites: false,
      promotable: false,
    };
    this.byEmail.set(owner, board);
    this.onCreated?.(owner, board.slug);
    return { ok: true, created: true, board };
  }

  async isSandbox(slug: string): Promise<boolean> {
    const want = slug.trim().toLowerCase();
    for (const board of this.byEmail.values()) {
      if (board.slug === want) return true;
    }
    return false;
  }

  async promote(_email: string): Promise<{ ok: false; error: "sandbox_cannot_promote" }> {
    return { ok: false, error: "sandbox_cannot_promote" };
  }

  count(): number {
    return this.byEmail.size;
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

export class SupabaseStarterStore implements StarterBoardStore {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    const base = this.url.replace(/\/+$/, "");
    const res = await this.fetchImpl(`${base}/rest/v1/rpc/${name}`, {
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
    if (!res.ok) return { ok: false, error: "starter_store_unavailable" };
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, error: "starter_store_unavailable" };
    }
  }

  async create(_email: string): Promise<StarterCreateResult> {
    const raw = await this.rpc("bootstrap_os_create_starter_board", {});
    if (!raw || typeof raw !== "object") return { ok: false, error: "starter_store_unavailable" };
    const body = raw as { ok?: boolean; error?: string; created?: boolean; slug?: string };
    if (body.ok !== true || typeof body.slug !== "string") {
      return { ok: false, error: body.error || "starter_store_unavailable" };
    }
    return {
      ok: true,
      created: body.created === true,
      board: { email: _email.toLowerCase(), slug: body.slug, invites: false, promotable: false },
    };
  }

  async isSandbox(slug: string): Promise<boolean> {
    const raw = await this.rpc("bootstrap_os_my_starter_slug", {});
    if (raw === null) return false;
    if (typeof raw !== "string") return true;
    return raw === slug.trim().toLowerCase();
  }

  async promote(_email: string): Promise<{ ok: false; error: "sandbox_cannot_promote" }> {
    return { ok: false, error: "sandbox_cannot_promote" };
  }
}

export function createStarterStore(
  accessToken?: string,
  fetchImpl?: typeof fetch,
): StarterBoardStore | null {
  if (!hostedProdIdentityAllowed()) return null;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key || !accessToken) return null;
  return new SupabaseStarterStore(url, key, accessToken, fetchImpl);
}

let testStore: StarterBoardStore | null | undefined;

export function setStarterStoreForTests(store: StarterBoardStore | null | undefined): void {
  testStore = store;
}

export function resolveStarterStore(accessToken?: string): StarterBoardStore | null {
  if (testStore !== undefined) return testStore;
  return createStarterStore(accessToken);
}

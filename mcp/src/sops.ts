export type SopVersion = {
  version: string;
  published_at: string;
  sha256: string;
};

export type SopListEntry = {
  name: string;
  version: string;
  published_at: string;
  sha256: string;
  versions: SopVersion[];
};

export type SopBody = {
  name: string;
  version: string;
  published_at: string;
  sha256: string;
  body: string;
};

type RpcFn = (name: string, body: Record<string, unknown>) => Promise<unknown>;

let rpcForTests: RpcFn | undefined;

export function setSopRpcForTests(fn: RpcFn | undefined): void {
  rpcForTests = fn;
}

function supabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.BOOTSTRAP_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "SOP store is not configured. Set BOOTSTRAP_SUPABASE_URL and BOOTSTRAP_SUPABASE_ANON_KEY.",
    );
  }
  return { url: url.replace(/\/+$/, ""), anonKey };
}

async function callRpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  if (rpcForTests) return rpcForTests(name, body);
  const { url, anonKey } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SOP read failed ${res.status}`);
  }
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function listSops(): Promise<SopListEntry[]> {
  const raw = await callRpc("bootstrap_os_list_sops", {});
  if (!Array.isArray(raw)) return [];
  return raw as SopListEntry[];
}

export async function getSop(name: string, version?: string): Promise<SopBody> {
  const raw = await callRpc("bootstrap_os_get_sop", {
    p_name: name,
    p_version: version ?? null,
  });
  const row = asRecord(raw);
  if (!row) {
    throw new Error(`Unknown SOP "${name}". Valid names: .`);
  }
  if (row.error === "unknown_name") {
    const names = stringList(row.valid_names);
    throw new Error(`Unknown SOP "${name}". Valid names: ${names.join(", ")}.`);
  }
  if (row.error === "unknown_version") {
    const versions = stringList(row.valid_versions);
    throw new Error(
      `Unknown version "${version ?? ""}" for SOP "${name}". Valid versions: ${versions.join(", ")}.`,
    );
  }
  if (typeof row.error === "string") {
    throw new Error(`SOP read failed: ${row.error}`);
  }
  return {
    name: String(row.name),
    version: String(row.version),
    published_at: String(row.published_at),
    sha256: String(row.sha256),
    body: String(row.body),
  };
}

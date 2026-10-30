import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveDocsBaseUrl, resolveDocsSource } from "./docs.js";
import { resolveOsRoot } from "./paths.js";

/**
 * Published SOP files. Hosted read fetches these from the same docs base as
 * bootstrap_get_doc (BOOTSTRAP_OS_DOCS_BASE, else raw GitHub main).
 * Append a path when you publish a version. Do not edit a published file.
 */
export const SOP_FILES = ["company-os/sops/bet-loop/v1.0.0.md"] as const;

export type SopRecord = {
  name: string;
  version: string;
  published_at: string;
  sha256: string;
  body: string;
  path: string;
};

const VERSION_FILE = /^v(\d+)\.(\d+)\.(\d+)\.md$/;

export function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * sha256 is the lowercase hex SHA-256 of the UTF-8 body.
 * The body is every byte after the closing front-matter fence.
 * The fence is a line whose entire content is `---`.
 * The newline that ends that line is not part of the body.
 */
export function splitSopFile(raw: string): { fields: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) {
    throw new Error("SOP file is missing front matter");
  }
  const end = raw.indexOf("\n---\n", 3);
  if (end < 0) {
    throw new Error("SOP file front matter is not closed");
  }
  const fields: Record<string, string> = {};
  for (const line of raw.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const match = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`SOP front matter line is not key: value (${line})`);
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[match[1]] = value;
  }
  return { fields, body: raw.slice(end + "\n---\n".length) };
}

function parseRecord(rel: string, raw: string): SopRecord {
  const { fields, body } = splitSopFile(raw);
  const name = fields.name;
  const version = fields.version;
  const published_at = fields.published_at;
  const sha256 = fields.sha256;
  if (!name || !version || !published_at || !sha256) {
    throw new Error(`SOP ${rel} front matter needs name, version, published_at, and sha256`);
  }
  const digest = sha256Hex(body);
  if (digest !== sha256) {
    throw new Error(`SOP ${rel} sha256 does not match the body`);
  }
  const base = path.posix.basename(rel);
  const fromName = VERSION_FILE.exec(base);
  if (!fromName || `${fromName[1]}.${fromName[2]}.${fromName[3]}` !== version) {
    throw new Error(`SOP ${rel} version does not match the file name`);
  }
  const dir = path.posix.basename(path.posix.dirname(rel));
  if (dir !== name) {
    throw new Error(`SOP ${rel} name does not match the directory`);
  }
  return { name, version, published_at, sha256, body, path: rel };
}

async function readSopFile(rel: string): Promise<string> {
  if (resolveDocsSource() !== "published") {
    const full = path.join(resolveOsRoot(), rel);
    if (!fs.existsSync(full)) {
      throw new Error(`SOP not found: ${full}`);
    }
    return fs.readFileSync(full, "utf8");
  }
  const url = `${resolveDocsBaseUrl()}/${rel}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`SOP fetch failed ${res.status}: ${url}`);
  }
  return await res.text();
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number(part));
  const pb = b.split(".").map((part) => Number(part));
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function loadSopCatalog(): Promise<SopRecord[]> {
  const records: SopRecord[] = [];
  for (const rel of SOP_FILES) {
    records.push(parseRecord(rel, await readSopFile(rel)));
  }
  return records;
}

export type SopListEntry = {
  name: string;
  version: string;
  published_at: string;
  sha256: string;
  versions: { version: string; published_at: string; sha256: string }[];
};

export async function listSops(): Promise<SopListEntry[]> {
  const byName = new Map<string, SopRecord[]>();
  for (const record of await loadSopCatalog()) {
    const rows = byName.get(record.name) ?? [];
    rows.push(record);
    byName.set(record.name, rows);
  }
  return [...byName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, rows]) => {
      const versions = [...rows].sort((a, b) => compareSemver(a.version, b.version));
      const latest = versions[versions.length - 1];
      return {
        name,
        version: latest.version,
        published_at: latest.published_at,
        sha256: latest.sha256,
        versions: versions.map((row) => ({
          version: row.version,
          published_at: row.published_at,
          sha256: row.sha256,
        })),
      };
    });
}

function validNames(records: SopRecord[]): string {
  return [...new Set(records.map((row) => row.name))].sort().join(", ");
}

export async function getSop(name: string, version?: string): Promise<SopRecord> {
  const records = await loadSopCatalog();
  const named = records.filter((row) => row.name === name);
  if (named.length === 0) {
    throw new Error(`Unknown SOP "${name}". Valid names: ${validNames(records)}.`);
  }
  if (!version) {
    const latest = [...named].sort((a, b) => compareSemver(a.version, b.version)).at(-1);
    if (!latest) {
      throw new Error(`Unknown SOP "${name}". Valid names: ${validNames(records)}.`);
    }
    return latest;
  }
  const pinned = named.find((row) => row.version === version);
  if (!pinned) {
    const versions = [...named]
      .sort((a, b) => compareSemver(a.version, b.version))
      .map((row) => row.version)
      .join(", ");
    throw new Error(`Unknown version "${version}" for SOP "${name}". Valid versions: ${versions}.`);
  }
  return pinned;
}

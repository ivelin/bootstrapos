/**
 * Board notify contract. Webhook fires here. Email is enqueue-only —
 * Resend lives on pirin.ai. No SMTP from this repo. No PII dump.
 */
import type { AclRow, CompanyRow, IdeaRow } from "./journey.js";

export const BOARD_NOTIFY_EVENT_TYPES = ["put_journey", "post_comment", "gate_event"] as const;
export type BoardNotifyEventType = (typeof BOARD_NOTIFY_EVENT_TYPES)[number];

export const BOARD_NOTIFY_CHANNELS = ["webhook", "email"] as const;
export type BoardNotifyChannel = (typeof BOARD_NOTIFY_CHANNELS)[number];

export type BoardSubscriberRow = {
  id: string;
  companyId: string;
  ideaId: string | null;
  principal: string;
  principalKind: "email" | "sub";
  webhookUrl: string;
  emailOptIn: boolean;
  createdBy: string;
};

export type BoardNotifyPayload = {
  company: { slug: string; label: string };
  idea: { slug: string; name: string } | null;
  event: BoardNotifyEventType;
  who: string;
  at: string;
  summary: string;
};

export type NotifyOutboxRow = {
  id: string;
  companyId: string;
  ideaId: string | null;
  subscriberId: string;
  channel: BoardNotifyChannel;
  payload: BoardNotifyPayload;
};

export type WebhookDelivery = {
  url: string;
  payload: BoardNotifyPayload;
};

export function subscriberHasAclAccess(
  acl: AclRow[],
  companyId: string,
  principal: string,
  principalKind: "email" | "sub",
): boolean {
  const want = principalKind === "email" ? principal.trim().toLowerCase() : principal.trim();
  return acl.some(
    (row) =>
      row.companyId === companyId &&
      row.principal === want &&
      row.principalKind === principalKind,
  );
}

export function isHttpsWebhookUrl(raw: string): boolean {
  const url = raw.trim();
  if (url.length < 10 || url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function summarizeBoardNotify(input: {
  event: BoardNotifyEventType;
  why?: string;
  commentBody?: string;
  gate?: string;
}): string {
  if (input.event === "post_comment") {
    const body = (input.commentBody ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    return body || "comment";
  }
  if (input.event === "gate_event") {
    return `gate ${input.gate ?? "hold"}`.slice(0, 80);
  }
  const why = (input.why ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return why || "board write";
}

export function buildBoardNotifyPayload(input: {
  company: CompanyRow;
  idea?: IdeaRow | null;
  event: BoardNotifyEventType;
  who: string;
  at?: string;
  summary: string;
}): BoardNotifyPayload {
  return {
    company: { slug: input.company.slug, label: input.company.label },
    idea: input.idea ? { slug: input.idea.slug, name: input.idea.name } : null,
    event: input.event,
    who: input.who,
    at: input.at ?? new Date().toISOString(),
    summary: input.summary.slice(0, 80),
  };
}

export function subscribersForEvent(
  subscribers: BoardSubscriberRow[],
  acl: AclRow[],
  companyId: string,
  ideaId?: string | null,
): BoardSubscriberRow[] {
  return subscribers.filter((row) => {
    if (row.companyId !== companyId) return false;
    if (row.ideaId && ideaId && row.ideaId !== ideaId) return false;
    if (row.ideaId && !ideaId) return false;
    return subscriberHasAclAccess(acl, companyId, row.principal, row.principalKind);
  });
}

export function enqueueBoardNotify(input: {
  subscribers: BoardSubscriberRow[];
  acl: AclRow[];
  company: CompanyRow;
  idea?: IdeaRow | null;
  event: BoardNotifyEventType;
  who: string;
  summary: string;
  nextId: (prefix: string) => string;
}): { outbox: NotifyOutboxRow[]; deliveries: WebhookDelivery[] } {
  const at = new Date().toISOString();
  const payload = buildBoardNotifyPayload({
    company: input.company,
    idea: input.idea,
    event: input.event,
    who: input.who,
    at,
    summary: input.summary,
  });
  const targets = subscribersForEvent(
    input.subscribers,
    input.acl,
    input.company.id,
    input.idea?.id ?? null,
  );
  const outbox: NotifyOutboxRow[] = [];
  const deliveries: WebhookDelivery[] = [];
  for (const sub of targets) {
    outbox.push({
      id: input.nextId("no"),
      companyId: input.company.id,
      ideaId: input.idea?.id ?? null,
      subscriberId: sub.id,
      channel: "webhook",
      payload,
    });
    deliveries.push({ url: sub.webhookUrl, payload });
    if (sub.emailOptIn) {
      outbox.push({
        id: input.nextId("no"),
        companyId: input.company.id,
        ideaId: input.idea?.id ?? null,
        subscriberId: sub.id,
        channel: "email",
        payload,
      });
    }
  }
  return { outbox, deliveries };
}

export function normalizeSubscribePrincipal(
  principal: string,
  principalKind: "email" | "sub",
): string {
  const trimmed = principal.trim();
  return principalKind === "email" ? trimmed.toLowerCase() : trimmed;
}

export function sameSubscriberScope(
  row: BoardSubscriberRow,
  input: {
    companyId: string;
    ideaId?: string | null;
    principal: string;
    principalKind: "email" | "sub";
  },
): boolean {
  const ideaId = input.ideaId ?? null;
  return (
    row.companyId === input.companyId &&
    row.ideaId === ideaId &&
    row.principal === normalizeSubscribePrincipal(input.principal, input.principalKind) &&
    row.principalKind === input.principalKind
  );
}

export function parseWebhookDeliveries(raw: unknown): WebhookDelivery[] {
  if (!raw || typeof raw !== "object") return [];
  const rows = (raw as { webhookDeliveries?: unknown }).webhookDeliveries;
  if (!Array.isArray(rows)) return [];
  const out: WebhookDelivery[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const url = typeof (row as { url?: unknown }).url === "string" ? (row as { url: string }).url.trim() : "";
    const payload = (row as { payload?: unknown }).payload;
    if (!isHttpsWebhookUrl(url)) continue;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    out.push({ url, payload: payload as BoardNotifyPayload });
  }
  return out;
}

/** POST https webhooks. Failures never throw — board state already committed. */
export async function postBoardWebhookDeliveries(
  deliveries: WebhookDelivery[],
  post: typeof fetch = fetch,
): Promise<{ posted: number; failed: number }> {
  let posted = 0;
  let failed = 0;
  for (const row of deliveries) {
    if (!isHttpsWebhookUrl(row.url)) {
      failed += 1;
      continue;
    }
    try {
      const res = await post(row.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(row.payload),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) posted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { posted, failed };
}

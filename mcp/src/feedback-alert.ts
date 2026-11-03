/**
 * New-ticket note to bootstrap@pirin.ai.
 * Uses the Resend HTTPS API (the same mailbox pirin-ai sends from).
 * No SDK import. Preview and CI skip. A failed alert never fails the ticket.
 */
import { INVITE_MAIL_FROM } from "./invite-mail.js";

export const FEEDBACK_ALERT_TO = INVITE_MAIL_FROM;

export type FeedbackAlertInput = {
  id: string;
  kind: string;
  severity: string;
  summary: string;
};

export async function alertNewFeedback(
  ticket: FeedbackAlertInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (env.VERCEL_ENV !== "production") return;
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return;
  const summary = ticket.summary.replace(/\s+/g, " ").trim().slice(0, 80);
  const text = [`id: ${ticket.id}`, `kind: ${ticket.kind}`, `severity: ${ticket.severity}`, `summary: ${summary}`].join(
    "\n",
  );
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FEEDBACK_ALERT_TO,
        to: [FEEDBACK_ALERT_TO],
        subject: `Bootstrap OS feedback ${ticket.id}`,
        text,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.error("feedback_alert_failed");
  } catch {
    console.error("feedback_alert_failed");
  }
}

/**
 * Outsider invite mail contract (MCP side).
 * From: bootstrap@pirin.ai only. Never ivelin@ / cos@.
 * This repo enqueues + builds the body. pirin-ai Resend sends on production.
 * Default off here. dry-run for tests. Never blast prod mail from MCP / CI.
 */
import { PIRIN_OAUTH_ORIGIN, PIRIN_ORIGIN } from "./oauth.js";

export const INVITE_MAIL_FROM = "bootstrap@pirin.ai";
export const INVITE_SIGNUP_QUERY = "invite";

export const INVITE_MAIL_NOTE =
  "Open the signup URL on your agent's computer and fill the form card in the chat. The fields are Email and Password. Press Continue, then Accept invite. This is the universal path for any agentic client. Sign in or create the account for this invitee email only, then accept_invite with the same token. pirin-ai sends From bootstrap@pirin.ai on production.";

export type InviteMailMode = "off" | "dry-run";

export type InviteMail = {
  from: typeof INVITE_MAIL_FROM;
  to: string;
  subject: string;
  text: string;
  signupUrl: string;
  qrPayload: string;
  inviteToken: string;
  inviterEmail: string;
  inviteeEmail: string;
  companyWorkspace: string;
};

export type InviteMailInput = {
  inviterEmail: string;
  inviteeEmail: string;
  companyWorkspace: string;
  inviteToken: string;
  expiresAt: string;
};

let mailSink: ((mail: InviteMail) => void) | undefined;

export function setInviteMailSinkForTests(sink?: (mail: InviteMail) => void): void {
  mailSink = sink;
}

export function inviteSignupUrl(token: string): string {
  const url = new URL(`${PIRIN_ORIGIN}/bootstrap-os/login`);
  url.searchParams.set(INVITE_SIGNUP_QUERY, token);
  return url.toString();
}

export const DEFAULT_PIRIN_INVITE_MAIL_URL = `${PIRIN_OAUTH_ORIGIN}/api/bootstrap-os/invite-mail`;

export type PirinInviteMailKick = {
  inviteeEmail: string;
  invitedByEmail: string;
  companyLabel: string;
  inviteToken: string;
};

/** Production MCP kicks pirin to send immediately. Preview/CI never POST. */
export function shouldPostPirinInviteMail(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV !== "production") return false;
  return Boolean(env.BOOTSTRAP_INVITE_MAIL_SECRET?.trim());
}

function pirinInviteMailUrl(env: NodeJS.ProcessEnv): string | null {
  const raw = (env.BOOTSTRAP_INVITE_MAIL_URL || DEFAULT_PIRIN_INVITE_MAIL_URL).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "pirin.ai" && host !== "www.pirin.ai") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function notifyPirinInviteMail(
  kick: PirinInviteMailKick,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ skipped?: string; status?: number }> {
  if (env.VERCEL_ENV !== "production") return { skipped: "not_production" };
  const secret = env.BOOTSTRAP_INVITE_MAIL_SECRET?.trim();
  if (!secret) return { skipped: "secret_unset" };
  const url = pirinInviteMailUrl(env);
  if (!url) return { skipped: "url_not_pirin" };
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inviteeEmail: kick.inviteeEmail,
      invitedByEmail: kick.invitedByEmail,
      companyLabel: kick.companyLabel,
      inviteToken: kick.inviteToken,
      signupUrl: inviteSignupUrl(kick.inviteToken),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status };
}

export function assertInviteMailFrom(from: string): asserts from is typeof INVITE_MAIL_FROM {
  if (from !== INVITE_MAIL_FROM) {
    throw new Error("Invite mail From must be bootstrap@pirin.ai");
  }
  if (/ivelin@|cos@/i.test(from) && from !== INVITE_MAIL_FROM) {
    throw new Error("Invite mail From must be bootstrap@pirin.ai");
  }
}

export function resolveInviteMailMode(
  env: NodeJS.ProcessEnv = process.env,
): InviteMailMode {
  const raw = (env.BOOTSTRAP_INVITE_MAIL ?? "off").trim().toLowerCase();
  if (raw === "dry-run") return "dry-run";
  // "send" is not implemented in this repo. Prod Resend lives on pirin-ai.
  // Force off in production so CI / Vercel never blast mail.
  if (raw === "send" && env.VERCEL_ENV !== "production") return "dry-run";
  return "off";
}

export function buildInviteMail(input: InviteMailInput): InviteMail {
  assertInviteMailFrom(INVITE_MAIL_FROM);
  const signupUrl = inviteSignupUrl(input.inviteToken);
  const text = [
    "You've been invited to a Bootstrap OS company workspace.",
    "",
    `Who invited: ${input.inviterEmail}`,
    `Invitee email: ${input.inviteeEmail}`,
    `Company workspace: ${input.companyWorkspace}`,
    `Invite token: ${input.inviteToken}`,
    `Signup URL: ${signupUrl}`,
    `QR payload (same as signup URL): ${signupUrl}`,
    `Expires: ${input.expiresAt}`,
    "",
    "Open the signup URL on your agent's computer and fill the form card in the chat.",
    "The fields are Email and Password. Press Continue, then Accept invite.",
    "Sign in or create the account for this invitee email only.",
    "Continue uses the existing password when this email already has an account.",
    "After a pirin.ai login exists for that email, call accept_invite with the same token.",
    "",
    INVITE_MAIL_NOTE,
  ].join("\n");
  return {
    from: INVITE_MAIL_FROM,
    to: input.inviteeEmail,
    subject: `${input.inviterEmail} invited you to ${input.companyWorkspace} on Bootstrap OS`,
    text,
    signupUrl,
    qrPayload: signupUrl,
    inviteToken: input.inviteToken,
    inviterEmail: input.inviterEmail,
    inviteeEmail: input.inviteeEmail,
    companyWorkspace: input.companyWorkspace,
  };
}

/** dry-run / test sink only. Never HTTP to Resend from this process. */
export function deliverInviteMailDryRun(mail: InviteMail): void {
  assertInviteMailFrom(mail.from);
  mailSink?.(mail);
}

/**
 * Outsider invite mail contract (MCP side).
 * From: bootstrap@pirin.ai only. Never ivelin@ / cos@.
 * This repo enqueues + builds the body. pirin-ai Resend sends on production.
 * Default off here. dry-run for tests. Never blast prod mail from MCP / CI.
 */
import { PIRIN_OAUTH_ORIGIN, PIRIN_ORIGIN } from "./oauth.js";

export const INVITE_MAIL_FROM = "bootstrap@pirin.ai";
export const INVITE_SIGNUP_QUERY = "invite";

/** Connect lines in the dry-run mirror. The live template owns the same three slots. */
export const BOOTSTRAP_MCP_CONNECT_LEAD = "Install the Bootstrap OS connector.";
export const BOOTSTRAP_MCP_URL = "https://mcp.bootstrap.pirin.ai/mcp";
export const BOOTSTRAP_MCP_CONNECT_TAIL =
  "Sign in on pirin.ai with the invited email. Then ask where you are.";

export const INVITE_MAIL_NOTE =
  "Open this to sign in or create your account. One link, with ?invite=. This is the universal path for any agentic client. The signed-in email is matched to the invite. The token alone does not grant access. pirin-ai sends From bootstrap@pirin.ai on production.";

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
  inviterName?: string;
  inviteeEmail: string;
  companyWorkspace: string;
  inviteToken: string;
  expiresAt: string;
};

export function inviterDisplayName(inviterName: string | undefined, inviterEmail: string): string {
  const named = inviterName?.trim();
  return named ? named : inviterEmail;
}

export function inviterNameForKick(inviterName: string | undefined, inviterEmail: string): string | undefined {
  const named = inviterName?.trim();
  if (!named) return undefined;
  if (named.toLowerCase() === inviterEmail.trim().toLowerCase()) return undefined;
  return named;
}

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
  inviterName?: string;
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
  const inviterName = inviterNameForKick(kick.inviterName, kick.invitedByEmail);
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
      ...(inviterName ? { inviterName } : {}),
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
  const inviterName = inviterDisplayName(input.inviterName, input.inviterEmail);
  const text = [
    "Base camp is ready.",
    "",
    `${inviterName} invited you to ${input.companyWorkspace}, a private bet board on Bootstrap OS. Only people invited to it can join.`,
    "",
    "Bring your own AI agent. Connect it to the bet board, and work on it together.",
    "",
    "Enter base camp:",
    signupUrl,
    "",
    `Sign in or create your account as ${input.inviteeEmail}, then press Accept invite. Invited by ${input.inviterEmail}.`,
    "",
    "Connect your agent:",
    BOOTSTRAP_MCP_CONNECT_LEAD,
    BOOTSTRAP_MCP_URL,
    BOOTSTRAP_MCP_CONNECT_TAIL,
    "",
    "Not expecting this? You can ignore this email. Nothing happens unless you accept.",
    "",
    "Bootstrap OS, by pirin.ai",
  ].join("\n") + "\n";
  return {
    from: INVITE_MAIL_FROM,
    to: input.inviteeEmail,
    subject: `${inviterName} invited you to base camp: the ${input.companyWorkspace} bet board`,
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

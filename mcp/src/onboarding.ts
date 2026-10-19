/**
 * Invited-founder sign-in. A verified GoTrue session is authenticated.
 * Zero boards is a membership fact, not a rejected access token.
 * The invite URL email is never the authority — only the verified session email.
 */
import type { HostedWhoami } from "./identity.js";

export const NO_BOARDS_HINT =
  "No boards yet. Ask your inviter to resend the invite to this email.";

export const SESSION_GRANT_PATH = "/bootstrap-os/session";

/** Login page keeps this copy for every address. It does not say whether an account exists. */
export const FORGOT_PASSWORD_PUBLIC_MESSAGE =
  "If that email has an account, we sent a reset link.";

export const INVITE_LINK_LINE = "Open this to sign in or create your account";

export function forgotPasswordPublicResponse(_email: string): { ok: true; message: string } {
  return { ok: true, message: FORGOT_PASSWORD_PUBLIC_MESSAGE };
}

/**
 * `not_invited` means GoTrue accepted the session and the allowlist row is missing.
 * That is no_membership. It must not be presented as an auth failure.
 */
export function presentVerifiedWhoami(who: HostedWhoami): HostedWhoami {
  if (who.authenticated) return who;
  if (who.reason !== "not_invited" && who.reason !== "no_membership") return who;
  return {
    authenticated: true,
    email: who.email?.trim().toLowerCase() || who.email,
    labels: [],
    role: who.role ?? "unset",
    reason: "no_membership",
    note: NO_BOARDS_HINT,
    identityStore: who.identityStore,
  };
}

export function noBoardsPayload(email?: string | null): {
  ok: true;
  authenticated: true;
  email: string | null;
  companies: string[];
  labels: string[];
  reason: "no_membership";
  hint: string;
  note: string;
} {
  return {
    ok: true,
    authenticated: true,
    email: email ?? null,
    companies: [],
    labels: [],
    reason: "no_membership",
    hint: NO_BOARDS_HINT,
    note: NO_BOARDS_HINT,
  };
}

export type SessionGrantBody = {
  ok: true;
  authenticated: true;
  grant: "allow";
  email: string | null;
  companies: string[];
  reason: "no_membership" | null;
  hint: string | null;
};

/** What the pirin.ai login page renders after Allow. Grant succeeds either way. */
export function sessionGrantBody(who: HostedWhoami): SessionGrantBody {
  const companies = [...who.labels].sort();
  const empty = companies.length === 0;
  return {
    ok: true,
    authenticated: true,
    grant: "allow",
    email: who.email ?? null,
    companies,
    reason: empty ? "no_membership" : null,
    hint: empty ? NO_BOARDS_HINT : null,
  };
}

export function isSessionGrantPath(pathname: string): boolean {
  return pathname === SESSION_GRANT_PATH || pathname.endsWith(SESSION_GRANT_PATH);
}

/** Body/query email is ignored. Present so callers can see it is not read. */
export function ignoredSessionEmail(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email : undefined;
}

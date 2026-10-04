/**
 * Journey-tool identity: Bearer JWT email (fallback sub) → ACL principal.
 * No FAST claim. Fail closed. Login lives on pirin.ai — not this host.
 */
import { isJwtAccessToken } from "./oauth.js";

export type JourneyActor = {
  authenticated: boolean;
  email?: string;
  sub?: string;
  principal?: string;
  identityStore?: "memory" | "pglite" | "supabase" | "unset";
  reason?: string;
};

export type JourneyAclRole = "founder" | "founder_authorized" | "advisor";

export function parseBearerToken(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return undefined;
  const token = match[1].trim();
  return token.length >= 16 ? token : undefined;
}

/**
 * Decode email then sub. Ignore FAST / role / group claims.
 * This PR does not live-probe JWKS or supabase-pirin-ai.
 */
export function actorClaimsFromAccessToken(
  token: string,
): { email?: string; sub?: string } | null {
  if (!isJwtAccessToken(token)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      email?: unknown;
      sub?: unknown;
      fast?: unknown;
    };
    void payload.fast;
    const email =
      typeof payload.email === "string" && payload.email.trim()
        ? payload.email.trim().toLowerCase()
        : undefined;
    const sub =
      typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : undefined;
    if (!email && !sub) return null;
    return { email, sub };
  } catch {
    return null;
  }
}

export function principalFromClaims(claims: { email?: string; sub?: string }): string | undefined {
  return claims.email || claims.sub || undefined;
}

/**
 * RFC 7519: the current time must be before `exp` (seconds).
 * Missing `exp` is not treated as expired. Signature stays on /auth/v1/user.
 */
export function accessTokenExpired(token: string | undefined, nowMs = Date.now()): boolean {
  if (!token || !isJwtAccessToken(token)) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return false;
    return nowMs >= payload.exp * 1000;
  } catch {
    return false;
  }
}

export function unauthenticatedActor(
  reason: string,
  store: JourneyActor["identityStore"] = "unset",
): JourneyActor {
  return { authenticated: false, identityStore: store, reason };
}

export function actorFromAuthorizationHeader(
  header: string | null | undefined,
  store: JourneyActor["identityStore"] = "unset",
): JourneyActor {
  const token = parseBearerToken(header);
  if (!token) {
    return unauthenticatedActor("missing_or_short_token", store);
  }
  const claims = actorClaimsFromAccessToken(token);
  if (!claims) {
    return unauthenticatedActor("not_a_pirin_access_token", store);
  }
  const principal = principalFromClaims(claims);
  if (!principal) {
    return unauthenticatedActor("email_or_sub_required", store);
  }
  return {
    authenticated: true,
    email: claims.email,
    sub: claims.sub,
    principal,
    identityStore: store,
  };
}

/** Test helper: unsigned JWT. Never a real FAST token. Never live-probe. */
export function syntheticAccessToken(claims: {
  email?: string;
  sub?: string;
  extra?: Record<string, unknown>;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      ...(claims.extra ?? {}),
      ...(claims.email ? { email: claims.email } : {}),
      ...(claims.sub ? { sub: claims.sub } : {}),
    }),
  ).toString("base64url");
  return `${header}.${payload}.synthetic-sig`;
}

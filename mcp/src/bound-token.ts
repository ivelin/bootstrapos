/**
 * Audience-bound pirin.ai access tokens (RFC 9068 typ at+jwt, ES256).
 *
 * GoTrue /auth/v1/user only accepts a Supabase session JWT. A bound token is
 * verified here against the authorization-server JWKS and is never sent to
 * GoTrue. Any failure is a hard 401.
 *
 * After verification the same at+jwt bytes are the PostgREST bearer. Supabase
 * third-party auth checks that token. This host does not mint a second JWT
 * and does not send service_role. A labels RPC that is not ok (including
 * PostgREST 401/403) is identity_lookup_failed, HTTP 401.
 * No new GRANT to anon.
 */
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { HOSTED_MCP_RESOURCE, PIRIN_AUTHORIZATION_SERVER } from "./oauth.js";

const BOOTSTRAP_OS_SCOPE = "bootstrap-os";

export const BOUND_TOKEN_TYP = "at+jwt";
export const BOUND_TOKEN_ISSUER_ENV = "BOUND_TOKEN_ISSUER";
export const BOUND_TOKEN_AUDIENCE_ENV = "BOUND_TOKEN_AUDIENCE";
export const BOUND_TOKEN_JWKS_URL_ENV = "BOUND_TOKEN_JWKS_URL";

export const DEFAULT_BOUND_TOKEN_ISSUER = PIRIN_AUTHORIZATION_SERVER;
export const DEFAULT_BOUND_TOKEN_AUDIENCE = HOSTED_MCP_RESOURCE;
export const DEFAULT_BOUND_TOKEN_JWKS_URL = "https://www.pirin.ai/.well-known/jwks.json";

/** Seconds. exp may be this far in the past and still count as unexpired. */
export const BOUND_TOKEN_CLOCK_SKEW_SECONDS = 60;

const ALGORITHMS = ["ES256"] as const;

/** Pinned jose remote-JWKS cache. cooldownDuration matches the library default (30s). */
const JWKS_CACHE_MAX_AGE_MS = 600_000;
const JWKS_COOLDOWN_MS = 30_000;
const JWKS_TIMEOUT_MS = 5_000;

export type BoundTokenClaims = {
  email: string;
  sub: string;
  exp: number;
};

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;

const remoteJwksByUrl = new Map<string, RemoteJwks>();
let jwksOverride: JWTVerifyGetKey | undefined;

/** Test hook. Pass undefined to use createRemoteJWKSet again. */
export function setBoundTokenJwksForTests(getKey: JWTVerifyGetKey | undefined): void {
  jwksOverride = getKey;
}

export function boundTokenIssuer(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[BOUND_TOKEN_ISSUER_ENV];
  return raw && raw.trim() ? raw.trim() : DEFAULT_BOUND_TOKEN_ISSUER;
}

export function boundTokenAudience(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[BOUND_TOKEN_AUDIENCE_ENV];
  return raw && raw.trim() ? raw.trim() : DEFAULT_BOUND_TOKEN_AUDIENCE;
}

export function boundTokenJwksUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[BOUND_TOKEN_JWKS_URL_ENV];
  return raw && raw.trim() ? raw.trim() : DEFAULT_BOUND_TOKEN_JWKS_URL;
}

function remoteJwks(url: string): RemoteJwks {
  let hit = remoteJwksByUrl.get(url);
  if (!hit) {
    hit = createRemoteJWKSet(new URL(url), {
      cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
      cooldownDuration: JWKS_COOLDOWN_MS,
      timeoutDuration: JWKS_TIMEOUT_MS,
    });
    remoteJwksByUrl.set(url, hit);
  }
  return hit;
}

export function isAtJwtBearer(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const header = decodeProtectedHeader(token);
    return header.typ === BOUND_TOKEN_TYP;
  } catch {
    return false;
  }
}

function scopeIncludesBootstrapOs(scope: unknown): boolean {
  const parts =
    typeof scope === "string"
      ? scope.split(/[\s,]+/)
      : Array.isArray(scope)
        ? scope.filter((part): part is string => typeof part === "string")
        : [];
  return parts.some((part) => part.trim() === BOOTSTRAP_OS_SCOPE);
}

function audienceContains(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (!Array.isArray(aud)) return false;
  return aud.some((part) => part === expected);
}

/**
 * Local ES256 check. Fail closed. Does not call GoTrue.
 * aud may be a string or a list. It must contain the resource URL exactly.
 */
export async function verifyBoundAccessToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<BoundTokenClaims | null> {
  if (!isAtJwtBearer(token)) return null;
  const audience = boundTokenAudience(env);
  const issuer = boundTokenIssuer(env);
  try {
    const { payload, protectedHeader } = await jwtVerify(token, jwksOverride ?? remoteJwks(boundTokenJwksUrl(env)), {
      algorithms: [...ALGORITHMS],
      issuer,
      audience,
      clockTolerance: BOUND_TOKEN_CLOCK_SKEW_SECONDS,
      typ: BOUND_TOKEN_TYP,
      currentDate: now,
    });
    if (protectedHeader.alg !== "ES256") return null;
    if (payload.iss !== issuer) return null;
    if (!audienceContains(payload.aud, audience)) return null;
    if (payload.role !== "authenticated") return null;
    if (!scopeIncludesBootstrapOs(payload.scope)) return null;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!email || !sub) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    return { email, sub, exp: payload.exp };
  } catch {
    return null;
  }
}


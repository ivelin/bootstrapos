/**
 * Audience-bound pirin.ai access tokens (RFC 9068 typ at+jwt, ES256).
 *
 * GoTrue /auth/v1/user only accepts a Supabase session JWT. A bound token is
 * verified here against the authorization-server JWKS and is never sent to
 * GoTrue. Any failure is a hard 401.
 *
 * PostgREST reads auth.jwt() for actor_email(), actor_sub(), and has_rank.
 * The at+jwt is signed by the pirin.ai resource key, so PostgREST will not
 * accept it. There is no service-role RPC that takes an actor argument, and
 * calling as service_role would skip RLS. When BOOTSTRAP_SUPABASE_JWT_SECRET
 * is set, a verified token is exchanged for a short-lived role=authenticated
 * JWT carrying the same email and sub. Stores keep sending that bearer.
 * No new GRANT to anon. No migration.
 */
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { HOSTED_MCP_RESOURCE, PIRIN_AUTHORIZATION_SERVER } from "./oauth.js";

const BOOTSTRAP_OS_SCOPE = "bootstrap-os";

export const BOUND_TOKEN_TYP = "at+jwt";
export const BOUND_TOKEN_ISSUER_ENV = "BOUND_TOKEN_ISSUER";
export const BOUND_TOKEN_AUDIENCE_ENV = "BOUND_TOKEN_AUDIENCE";
export const BOUND_TOKEN_JWKS_URL_ENV = "BOUND_TOKEN_JWKS_URL";
export const BOUND_TOKEN_JWT_SECRET_ENV = "BOOTSTRAP_SUPABASE_JWT_SECRET";

export const DEFAULT_BOUND_TOKEN_ISSUER = PIRIN_AUTHORIZATION_SERVER;
export const DEFAULT_BOUND_TOKEN_AUDIENCE = HOSTED_MCP_RESOURCE;
export const DEFAULT_BOUND_TOKEN_JWKS_URL = "https://www.pirin.ai/.well-known/jwks.json";

/** Seconds. exp may be this far in the past and still count as unexpired. */
export const BOUND_TOKEN_CLOCK_SKEW_SECONDS = 60;

const ALGORITHMS = ["ES256"] as const;

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
    hit = createRemoteJWKSet(new URL(url));
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

/**
 * Local ES256 check. Fail closed. Does not call GoTrue.
 * aud must be exactly the resource URL (a list of audiences does not match).
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
    if (payload.aud !== audience) return null;
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

function jwtSecret(env: NodeJS.ProcessEnv): Uint8Array | null {
  const raw = env[BOUND_TOKEN_JWT_SECRET_ENV];
  if (!raw || !raw.trim()) return null;
  return new TextEncoder().encode(raw);
}

/**
 * PostgREST bearer for a verified at+jwt. Undefined when the token is not a
 * valid bound token, or when the Supabase JWT secret is unset (callers then
 * keep today's session-JWT forwarding).
 */
export async function databaseBearerForPresentedToken(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<string | undefined> {
  if (!token || !isAtJwtBearer(token)) return undefined;
  const secret = jwtSecret(env);
  if (!secret) return undefined;
  const claims = await verifyBoundAccessToken(token, env, now);
  if (!claims) return undefined;
  const iat = Math.floor(now.getTime() / 1000);
  const exp = Math.min(claims.exp, iat + 3600);
  return new SignJWT({
    role: "authenticated",
    email: claims.email,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret);
}

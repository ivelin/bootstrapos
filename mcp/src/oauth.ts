/**
 * Resource-server challenge only. Authorization server is pirin.ai.
 * Do not add a login UI or a second OAuth server in this repo.
 */
export const PIRIN_ORIGIN = "https://pirin.ai";

/**
 * Apex pirin.ai 307s to www (Vercel domain redirect). RFC 8414 / DCR / token
 * must be HTTP 200 — Grok App falls back to a Client ID form if register 307s.
 */
export const PIRIN_OAUTH_ORIGIN = "https://www.pirin.ai";

/** Production / merge authorize URL. www so discovery and DCR do not follow a 307. */
export const PIRIN_AUTHORIZATION_SERVER = `${PIRIN_OAUTH_ORIGIN}/bootstrap-os/login`;

/** Production RFC 8414. Preview copies this too — endpoints stay on www.pirin.ai (200). */
export const PIRIN_AUTHORIZATION_SERVER_METADATA = {
  issuer: PIRIN_AUTHORIZATION_SERVER,
  authorization_endpoint: PIRIN_AUTHORIZATION_SERVER,
  token_endpoint: `${PIRIN_OAUTH_ORIGIN}/oauth/token`,
  registration_endpoint: `${PIRIN_OAUTH_ORIGIN}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["bootstrap-os", "office-receptionist", "openid", "profile", "email"],
  service_documentation: PIRIN_AUTHORIZATION_SERVER,
} as const;

/**
 * Live pirin.ai RFC 9728. Do not emit as WWW-Authenticate resource_metadata.
 * That document still advertises resource=bootstrap-os-mcp.vercel.app until pirin-ai updates.
 * Never use as Hold-preview resource_metadata (its resource is not the preview pin).
 */
export const PIRIN_PROTECTED_RESOURCE_METADATA_URL =
  `${PIRIN_ORIGIN}/.well-known/oauth-protected-resource`;

/** Invite-only collab / Grok / whoami pin. Cookie-less initialize / tools/list / GET SSE 401. Never emit on VERCEL_ENV=preview. */
export const HOSTED_MCP_RESOURCE = "https://mcp.bootstrap.pirin.ai/mcp";

/**
 * Vercel production deploy Host. Not a Path 1 pin. Not advertised.
 * Cos HARD 2026-09-09: treat exactly like collab — cookie-less initialize
 * / tools/list HTTP 401 + WWW-Authenticate. Not a silent 200 alias.
 */
export const HOSTED_MCP_RESOURCE_ALIAS = "https://bootstrap-os-mcp.vercel.app/mcp";

/** Canonical public no-SSO git preview for PR #17. */
export const PREVIEW_HOSTED_MCP_RESOURCE =
  "https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/mcp";

/** Hold-preview RFC 9728 on this MCP origin — not pirin.ai live, not the dead #143 git preview. */
export const PREVIEW_HOSTED_PROTECTED_RESOURCE_METADATA_URL =
  "https://bootstrap-os-mcp-git-cursor-ho-16df4d-ivelins-projects-9f9b7132.vercel.app/.well-known/oauth-protected-resource";

export const OAUTH_RESOURCE_METADATA_ENV = "BOOTSTRAP_OAUTH_RESOURCE_METADATA";

export function isAllowedProtectedResourceMetadataUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    return url.pathname.replace(/\/+$/, "") === "/.well-known/oauth-protected-resource";
  } catch {
    return false;
  }
}

function stripProto(host: string): string {
  return host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function normalizeMcpResource(raw: string): string {
  const host = stripProto(raw).replace(/\/mcp$/i, "");
  return `https://${host}/mcp`;
}

export function isProdPinResource(url: string): boolean {
  const normalized = normalizeMcpResource(url);
  return normalized === HOSTED_MCP_RESOURCE || normalized === HOSTED_MCP_RESOURCE_ALIAS;
}

/** Invite-only hosted Hosts: advertised pin and the vercel.app deploy Host. Same 401. */
export function isCollabHostedResource(url: string): boolean {
  const normalized = normalizeMcpResource(url);
  return normalized === HOSTED_MCP_RESOURCE || normalized === HOSTED_MCP_RESOURCE_ALIAS;
}

/** Vercel production deploy Host. Not the advertised pin. Same handshake 401 as collab. */
export function isUndeclaredDeployAlias(url: string): boolean {
  return normalizeMcpResource(url) === HOSTED_MCP_RESOURCE_ALIAS;
}

export function originProtectedResourceMetadataUrl(resourceUrl: string): string {
  return `${normalizeMcpResource(resourceUrl).replace(/\/mcp$/i, "")}/.well-known/oauth-protected-resource`;
}

/** Production / main RFC 9728 on this MCP origin. Matches HOSTED_MCP_RESOURCE. */
export const HOSTED_PROTECTED_RESOURCE_METADATA_URL =
  originProtectedResourceMetadataUrl(HOSTED_MCP_RESOURCE);

function isLivePirinProtectedResourceMetadata(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    return (
      (host === "pirin.ai" || host === "www.pirin.ai") &&
      url.pathname.replace(/\/+$/, "") === "/.well-known/oauth-protected-resource"
    );
  } catch {
    return false;
  }
}

function resourceFromRequest(req?: Request): string | undefined {
  if (!req) return undefined;
  try {
    const parsed = new URL(req.url);
    const host = (
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      parsed.host ||
      ""
    )
      .split(",")[0]
      .trim();
    if (!host) return undefined;
    return normalizeMcpResource(host);
  } catch {
    return undefined;
  }
}

function isPreviewResourceContext(req?: Request): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "preview") return true;
  const fromReq = resourceFromRequest(req);
  return fromReq === PREVIEW_HOSTED_MCP_RESOURCE;
}

/**
 * Protected-resource identifier this host advertises.
 * Preview (VERCEL_ENV=preview) derives from the request host / Vercel preview URL.
 * Never the production pin on preview. Merge / production is the invite-only collab pin.
 */
export function hostedMcpResource(req?: Request): string {
  if (process.env.VERCEL_ENV === "preview") {
    const fromReq = resourceFromRequest(req);
    if (fromReq && !isProdPinResource(fromReq)) return fromReq;
    const branch = process.env.VERCEL_BRANCH_URL?.trim();
    if (branch) return normalizeMcpResource(branch);
    const vercelUrl = process.env.VERCEL_URL?.trim();
    if (vercelUrl) return normalizeMcpResource(vercelUrl);
    return PREVIEW_HOSTED_MCP_RESOURCE;
  }
  return HOSTED_MCP_RESOURCE;
}

/**
 * Runtime metadata URL for WWW-Authenticate resource_metadata.
 * Production / main: this MCP origin well-known (derived from HOSTED_MCP_RESOURCE).
 * Hold preview: this MCP origin well-known. Never live pirin.ai (stale resource=vercel.app alias).
 * Never the dead #143 git preview. authorization_servers stay on pirin.ai login.
 */
export function protectedResourceMetadataUrl(req?: Request): string {
  if (isPreviewResourceContext(req)) {
    const resource = hostedMcpResource(req);
    if (resource && !isProdPinResource(resource)) {
      return originProtectedResourceMetadataUrl(resource);
    }
    return PREVIEW_HOSTED_PROTECTED_RESOURCE_METADATA_URL;
  }
  const override = process.env[OAUTH_RESOURCE_METADATA_ENV]?.trim();
  if (
    override &&
    isAllowedProtectedResourceMetadataUrl(override) &&
    !isLivePirinProtectedResourceMetadata(override)
  ) {
    return override.replace(/\/+$/, "");
  }
  return originProtectedResourceMetadataUrl(hostedMcpResource(req));
}

/**
 * Cookie-less initialize / GET SSE / tools/list 401 without a Bearer on:
 * - invite-only collab pin (mcp.bootstrap.pirin.ai)
 * - vercel.app deploy Host (same 401; not a Path 1 door, not a silent 200)
 * - Hold preview origins
 */
export function requiresHandshakeAuth(req?: Request): boolean {
  const fromReq = resourceFromRequest(req);
  if (fromReq && isCollabHostedResource(fromReq)) return true;
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "preview") return true;
  return fromReq === PREVIEW_HOSTED_MCP_RESOURCE;
}

/** Live pirin.ai login. Preview and production both advertise this — not #143, not this MCP host. */
export function authorizationServerUrl(_req?: Request): string {
  return PIRIN_AUTHORIZATION_SERVER;
}

/** RFC 8414 metadata. Always the live pirin.ai document. Endpoints stay on pirin.ai. */
export function authorizationServerMetadataDocument(_req?: Request): typeof PIRIN_AUTHORIZATION_SERVER_METADATA {
  return PIRIN_AUTHORIZATION_SERVER_METADATA;
}

export function wwwAuthenticateChallengeFor(
  metadataUrl: string,
  resourceUrl: string = HOSTED_MCP_RESOURCE,
  error?: "invalid_token" | "insufficient_scope",
): string {
  if (error === "insufficient_scope") {
    return `Bearer error="insufficient_scope", scope="bootstrap-os", resource_metadata="${metadataUrl}"`;
  }
  const base = `Bearer realm="bootstrap-os-mcp", resource_metadata="${metadataUrl}", resource="${resourceUrl}", scope="bootstrap-os"`;
  if (error === "invalid_token") {
    return `${base}, error="invalid_token", error_description="The access token expired or is invalid"`;
  }
  return base;
}

/** Single clean 403 challenge — clients reconnect once; do not treat as invalid_token. */
export function insufficientScopeChallenge(req?: Request): string {
  return wwwAuthenticateChallengeFor(
    protectedResourceMetadataUrl(req),
    hostedMcpResource(req),
    "insufficient_scope",
  );
}

/** Production / main default challenge (no env, not a Vercel preview). */
export const WWW_AUTHENTICATE_CHALLENGE = wwwAuthenticateChallengeFor(
  HOSTED_PROTECTED_RESOURCE_METADATA_URL,
  HOSTED_MCP_RESOURCE,
);

export function wwwAuthenticateChallenge(req?: Request): string {
  const auth = req?.headers.get("authorization") || "";
  const presented = /^Bearer\s+\S+/i.test(auth);
  return wwwAuthenticateChallengeFor(
    protectedResourceMetadataUrl(req),
    hostedMcpResource(req),
    presented ? "invalid_token" : undefined,
  );
}

export function protectedResourceMetadataDocument(req?: Request): {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
} {
  return {
    resource: hostedMcpResource(req),
    authorization_servers: [authorizationServerUrl(req)],
    scopes_supported: ["bootstrap-os"],
    bearer_methods_supported: ["header"],
  };
}

export function isJwtAccessToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0].length < 8) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as {
      typ?: string;
      alg?: string;
    };
    return Boolean(header.alg);
  } catch {
    return false;
  }
}

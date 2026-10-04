/**
 * Web-standard request handler for the hosted-read MCP surface.
 * Used by the Vercel function entry and the optional local HTTP helper.
 * Does not listen on 127.0.0.1. Does not host founder company-state.
 *
 * Journey tools (get/put/comment + board notify + enable_board_watch) are gated on this branch.
 * Public OS tools stay listed after auth on the invite-only collab host. Pin: oauth.ts / HOSTED_IDENTITY.md.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  isHostedGatedJourneyToolName,
  isHostedGatedToolName,
  isHostedPreAllowlistToolName,
} from "./constants.js";
import {
  parseBearerToken,
  resolveHostedWhoami,
  supabaseAccessTokenRejected,
  supabaseIdentityUpstreamFailure,
  type HostedWhoami,
} from "./identity.js";
import {
  accessTokenExpired,
  actorClaimsFromAccessToken,
  actorFromAuthorizationHeader,
  unauthenticatedActor,
  type JourneyActor,
} from "./journey-auth.js";
import { resolveJourneyStore, setLiveJourneyStoreFactory } from "./journey.js";
import { createJourneyStore, JOURNEY_RPC_UNAUTHORIZED } from "./hosted-journey-store.js";
import {
  authorizationServerMetadataDocument,
  hostedMcpResource,
  protectedResourceMetadataDocument,
  requiresHandshakeAuth,
  wwwAuthenticateChallenge,
} from "./oauth.js";
import { createBootstrapServer } from "./server.js";
import { hostedSessionKey } from "./hosted-company-context.js";

setLiveJourneyStoreFactory(createJourneyStore);

export function applyHostedReadEnv(): void {
  process.env.BOOTSTRAP_MCP_SURFACE = "hosted-read";
  if (!process.env.BOOTSTRAP_OS_DOCS_SOURCE) {
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "published";
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, MCP-Session-Id, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "WWW-Authenticate",
  };
}

function rpcMethodOf(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const method = (body as { method?: unknown }).method;
  return typeof method === "string" ? method : undefined;
}

function gatedToolNameFromRpc(body: unknown): string | undefined {
  if (rpcMethodOf(body) !== "tools/call") return undefined;
  const name = (body as { params?: { name?: unknown } }).params?.name;
  return typeof name === "string" && isHostedGatedToolName(name) ? name : undefined;
}

function isHandshakeRpc(body: unknown): boolean {
  const method = rpcMethodOf(body);
  return method === "initialize" || method === "tools/list";
}

/** Hint only. Never ACL. Wrong name must not change tools or companies. */
function clientHintFromInitialize(req: Request, body: unknown): {
  clientName?: string;
  userAgent?: string;
} {
  const userAgent = req.headers.get("user-agent") ?? undefined;
  let clientName: string | undefined;
  if (rpcMethodOf(body) === "initialize" && body && typeof body === "object") {
    const name = (body as { params?: { clientInfo?: { name?: unknown } } }).params
      ?.clientInfo?.name;
    if (typeof name === "string") clientName = name;
  }
  return { clientName, userAgent };
}

export function unauthorizedGatedToolResponse(
  whoami?: HostedWhoami,
  req?: Request,
  actor?: JourneyActor,
): Response {
  const resource = hostedMcpResource(req);
  const headers = {
    ...corsHeaders(),
    "WWW-Authenticate": wwwAuthenticateChallenge(req),
    "Content-Type": "application/json; charset=utf-8",
  };
  const reason = whoami?.reason ?? actor?.reason;
  const notInvited = reason === "not_invited";
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description: notInvited
        ? "This pirin.ai account is not on the hosted MCP allowlist. A valid JWT is not enough."
        : "Gated tools require a pirin.ai access token. Public OS tools stay open. Login lives on pirin.ai — not this host.",
      identityStore: actor?.identityStore ?? whoami?.identityStore ?? "unset",
      resource,
      reason: reason ?? null,
    }),
    { status: 401, headers },
  );
}

function journeyUpstreamUnavailableResponse(whoami: HostedWhoami): Response {
  return new Response(
    JSON.stringify({
      error: "upstream_unavailable",
      error_description: "The login check is temporarily unavailable.",
      identityStore: whoami.identityStore ?? "supabase",
      reason: whoami.reason ?? "identity_upstream_unavailable",
    }),
    {
      status: 503,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function pathnameOf(req: Request): string {
  try {
    return new URL(req.url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function isHealthPath(pathname: string): boolean {
  return pathname === "/health" || pathname.endsWith("/health");
}

function isMcpPath(pathname: string): boolean {
  return pathname === "/mcp" || pathname.endsWith("/mcp");
}

function isProtectedResourceMetadataPath(pathname: string): boolean {
  return (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp"
  );
}

function isAuthorizationServerMetadataPath(pathname: string): boolean {
  return (
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname === "/.well-known/oauth-authorization-server/mcp"
  );
}

function resolveGatedActor(authorization: string | null): JourneyActor {
  const store = resolveJourneyStore(parseBearerToken(authorization));
  const storeKind = store?.kind ?? "unset";
  if (accessTokenExpired(parseBearerToken(authorization))) {
    return unauthenticatedActor("invalid_or_revoked_token", storeKind);
  }
  const actor = actorFromAuthorizationHeader(authorization, storeKind);
  if (!actor.authenticated) return actor;
  if (!store) {
    return {
      authenticated: false,
      identityStore: "unset",
      reason: "identity_store_unset",
    };
  }
  if (!store.actorOnAllowlist(actor)) {
    return {
      authenticated: false,
      email: actor.email,
      sub: actor.sub,
      principal: actor.principal,
      identityStore: store.kind,
      reason: "not_on_allowlist",
    };
  }
  return actor;
}

export async function handleHostedReadFetch(req: Request): Promise<Response> {
  applyHostedReadEnv();
  const pathname = pathnameOf(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (isHealthPath(pathname)) {
    return new Response("ok", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() },
    });
  }

  if (isProtectedResourceMetadataPath(pathname)) {
    return new Response(JSON.stringify(protectedResourceMetadataDocument(req)), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
    });
  }

  if (isAuthorizationServerMetadataPath(pathname)) {
    return new Response(JSON.stringify(authorizationServerMetadataDocument(req)), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
    });
  }

  if (!isMcpPath(pathname)) {
    return new Response("Preview hosted-read MCP. POST /mcp. Not mentee-ready boards.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() },
    });
  }

  const authorization = req.headers.get("authorization");
  let rpcBody: unknown = null;
  if (req.method === "POST") {
    try {
      rpcBody = await req.clone().json();
    } catch {
      rpcBody = null;
    }
  }
  const gatedName = gatedToolNameFromRpc(rpcBody);
  // Expired journey tokens stop here: no whoami fetch and no PostgREST RPC.
  if (isHostedGatedJourneyToolName(gatedName) && accessTokenExpired(parseBearerToken(authorization))) {
    return unauthorizedGatedToolResponse(
      undefined,
      req,
      unauthenticatedActor(
        "invalid_or_revoked_token",
        resolveJourneyStore(parseBearerToken(authorization))?.kind ?? "unset",
      ),
    );
  }

  const whoami = await resolveHostedWhoami(authorization);
  const hasBearer = Boolean(parseBearerToken(authorization));
  const handshakeAuth = requiresHandshakeAuth(req);
  let actor: JourneyActor | undefined;

  if (handshakeAuth && !hasBearer && req.method === "GET") {
    return unauthorizedGatedToolResponse(whoami, req);
  }

  if (req.method === "POST") {
    if (handshakeAuth && !hasBearer && isHandshakeRpc(rpcBody)) {
      return unauthorizedGatedToolResponse(whoami, req);
    }
    if (gatedName) {
      if (isHostedPreAllowlistToolName(gatedName)) {
        // accept_invite: valid JWT required; allowlist is not (invitee is not_invited yet).
        if (!whoami.authenticated && whoami.reason !== "not_invited") {
          return unauthorizedGatedToolResponse(whoami, req);
        }
      } else if (isHostedGatedJourneyToolName(gatedName)) {
        // Same /auth/v1/user result whoami just recorded. Do not fetch it again.
        // 5xx / network: 503 and no challenge, so a GoTrue outage does not refresh-storm.
        if (supabaseIdentityUpstreamFailure(whoami)) {
          return journeyUpstreamUnavailableResponse(whoami);
        }
        if (supabaseAccessTokenRejected(whoami)) {
          return unauthorizedGatedToolResponse(whoami, req);
        }
        actor = resolveGatedActor(authorization);
        if (!actor.authenticated) {
          return unauthorizedGatedToolResponse(whoami, req, actor);
        }
      } else if (!whoami.authenticated) {
        return unauthorizedGatedToolResponse(whoami, req);
      }
    }
  }

  const accessToken = parseBearerToken(authorization);
  const inviteClaims = accessToken ? actorClaimsFromAccessToken(accessToken) : null;

  const server = createBootstrapServer("hosted-read", {
    whoami,
    resource: hostedMcpResource(req),
    actor,
    inviteActor: inviteClaims ?? (whoami.email ? { email: whoami.email } : undefined),
    accessToken,
    sessionKey: hostedSessionKey(req, accessToken),
    clientHint: clientHintFromInitialize(req, rpcBody),
    protocolVersion: req.headers.get("mcp-protocol-version"),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection: false,
  });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  if (isHostedGatedJourneyToolName(gatedName)) {
    const upgraded = await unauthorizedIfJourneyRpcRejected(res, req, actor);
    if (upgraded) return withCors(upgraded);
  }
  return withCors(res);
}

function toolResultJourneyRpcUnauthorized(raw: string): boolean {
  let rpc: { result?: { content?: Array<{ text?: string }> } };
  try {
    rpc = JSON.parse(raw) as { result?: { content?: Array<{ text?: string }> } };
  } catch {
    return false;
  }
  const content = rpc.result?.content;
  if (!Array.isArray(content)) return false;
  const text = content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n");
  if (!text.includes(JOURNEY_RPC_UNAUTHORIZED)) return false;
  try {
    const payload = JSON.parse(text) as { error?: unknown };
    return payload.error === JOURNEY_RPC_UNAUTHORIZED;
  } catch {
    return text.trim() === JOURNEY_RPC_UNAUTHORIZED;
  }
}

/** PostgREST 401 must be an HTTP 401 challenge. 403 and 5xx stay tool results. */
async function unauthorizedIfJourneyRpcRejected(
  res: Response,
  req: Request,
  actor: JourneyActor | undefined,
): Promise<Response | null> {
  if (res.status !== 200) return null;
  const raw = await res.clone().text();
  if (!toolResultJourneyRpcUnauthorized(raw)) return null;
  const storeKind = actor?.identityStore;
  const identityStore = storeKind === "supabase" || storeKind === "memory" ? storeKind : "unset";
  return unauthorizedGatedToolResponse(
    {
      authenticated: false,
      labels: [],
      reason: "invalid_or_revoked_token",
      identityStore,
    },
    req,
    unauthenticatedActor("invalid_or_revoked_token", storeKind ?? "unset"),
  );
}

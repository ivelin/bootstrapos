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
import { parseBearerToken, resolveHostedWhoami, type HostedWhoami } from "./identity.js";
import {
  actorClaimsFromAccessToken,
  actorFromAuthorizationHeader,
  type JourneyActor,
} from "./journey-auth.js";
import { resolveJourneyStore, setLiveJourneyStoreFactory } from "./journey.js";
import { createJourneyStore } from "./hosted-journey-store.js";
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
  const actor = actorFromAuthorizationHeader(authorization, store?.kind ?? "unset");
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

  const whoami = await resolveHostedWhoami(req.headers.get("authorization"));
  const hasBearer = Boolean(parseBearerToken(req.headers.get("authorization")));
  const handshakeAuth = requiresHandshakeAuth(req);
  let actor: JourneyActor | undefined;
  let rpcBody: unknown = null;

  if (handshakeAuth && !hasBearer && req.method === "GET") {
    return unauthorizedGatedToolResponse(whoami, req);
  }

  if (req.method === "POST") {
    try {
      rpcBody = await req.clone().json();
    } catch {
      rpcBody = null;
    }
    if (handshakeAuth && !hasBearer && isHandshakeRpc(rpcBody)) {
      return unauthorizedGatedToolResponse(whoami, req);
    }
    const gatedName = gatedToolNameFromRpc(rpcBody);
    if (gatedName) {
      if (isHostedPreAllowlistToolName(gatedName)) {
        // accept_invite: valid JWT required; allowlist is not (invitee is not_invited yet).
        if (!whoami.authenticated && whoami.reason !== "not_invited") {
          return unauthorizedGatedToolResponse(whoami, req);
        }
      } else if (isHostedGatedJourneyToolName(gatedName)) {
        actor = resolveGatedActor(req.headers.get("authorization"));
        if (!actor.authenticated) {
          return unauthorizedGatedToolResponse(whoami, req, actor);
        }
      } else if (!whoami.authenticated) {
        return unauthorizedGatedToolResponse(whoami, req);
      }
    }
  }

  const accessToken = parseBearerToken(req.headers.get("authorization"));
  const inviteClaims = accessToken ? actorClaimsFromAccessToken(accessToken) : null;

  const server = createBootstrapServer("hosted-read", {
    whoami,
    resource: hostedMcpResource(req),
    actor,
    inviteActor: inviteClaims ?? (whoami.email ? { email: whoami.email } : undefined),
    accessToken,
    sessionKey: hostedSessionKey(req, accessToken),
    clientHint: clientHintFromInitialize(req, rpcBody),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection: false,
  });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  return withCors(res);
}

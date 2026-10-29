import { Hono } from "hono";
import { handleHostedReadFetch } from "./src/hosted-handler.js";

const app = new Hono();

app.all("/health", (c) => handleHostedReadFetch(c.req.raw));
app.all("/mcp", (c) => handleHostedReadFetch(c.req.raw));
app.all("/bootstrap-os/session", (c) => handleHostedReadFetch(c.req.raw));
app.all("/api/health", (c) => handleHostedReadFetch(c.req.raw));
app.all("/api/mcp", (c) => handleHostedReadFetch(c.req.raw));
app.all("/.well-known/oauth-protected-resource", (c) => handleHostedReadFetch(c.req.raw));
app.all("/.well-known/oauth-protected-resource/mcp", (c) => handleHostedReadFetch(c.req.raw));
app.all("/.well-known/oauth-authorization-server", (c) => handleHostedReadFetch(c.req.raw));
app.all("/.well-known/oauth-authorization-server/mcp", (c) => handleHostedReadFetch(c.req.raw));
app.all("/", (c) =>
  c.text("Preview hosted-read MCP. POST /mcp. GET /health."),
);

export default app;

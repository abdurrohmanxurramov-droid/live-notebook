// Owned by the app (banner removed): wraps the generated MCP handler with a
// backward-compatibility adapter for legacy tool names. See src/lib/mcp/legacy.ts.
// route: /mcp

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";
import { translateJsonRpcPayload } from "../lib/mcp/legacy";

const handler = createTanStackMcpHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

/** Rewrites `tools/call` requests for retired tool names, leaving everything else untouched. */
async function withLegacyAliases(request: Request): Promise<Request> {
  if (request.method !== "POST") return request;
  const text = await request.clone().text();
  if (!text) return request;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return request;
  }
  const translated = translateJsonRpcPayload(payload);
  if (translated === payload) return request;
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(translated),
  });
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async (ctx) => handler({ ...ctx, request: await withLegacyAliases(ctx.request) }),
    },
  },
});

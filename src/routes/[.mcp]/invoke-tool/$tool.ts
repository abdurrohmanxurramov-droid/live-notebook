// Owned by the app (banner removed): wraps the generated invoke-tool handler
// with a backward-compatibility adapter for legacy tool names.
// route: /.mcp/invoke-tool/$tool

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackInvokeToolHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../../../lib/mcp/index";
import { translateLegacyCall } from "../../../lib/mcp/legacy";

const handler = createTanStackInvokeToolHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: async (ctx) => {
        const { request, params } = ctx;
        if (request.method !== "POST") return handler(ctx);
        const text = await request.clone().text();
        let args: unknown = {};
        if (text) {
          try {
            args = JSON.parse(text);
          } catch {
            return handler(ctx);
          }
        }
        const translated = translateLegacyCall(params.tool, args);
        if (!translated) return handler(ctx);
        return handler({
          ...ctx,
          params: { ...params, tool: translated.tool },
          request: new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(translated.arguments),
          }),
        });
      },
    },
  },
});

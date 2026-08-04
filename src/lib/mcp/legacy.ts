/**
 * Backward-compatibility adapter for MCP clients connected before the public
 * surface was collapsed to `query`, `mutate` and `workflow`.
 *
 * Old clients (e.g. an already-installed ChatGPT connector) still call the
 * legacy tool names below. They are NOT advertised in `list-tools` or the
 * manifest — they are only accepted on the invoke paths and translated into
 * the equivalent modern operation. Auth, RLS, ownership checks and schema
 * validation are unchanged: the translated call goes through the exact same
 * tool handler as a modern call.
 */

export type LegacyAlias = {
  /** Modern public tool that serves the legacy call. */
  tool: "query" | "mutate";
  /** Discriminator key inside `request`. */
  key: "resource" | "operation";
  /** Operation the legacy tool maps to. */
  operation: string;
};

export const LEGACY_TOOL_ALIASES: Readonly<Record<string, LegacyAlias>> = {
  list_students: { tool: "query", key: "resource", operation: "students.list" },
  list_lessons: { tool: "query", key: "resource", operation: "lessons.list" },
  list_finance: { tool: "query", key: "resource", operation: "finance.list" },
  list_homework: { tool: "query", key: "resource", operation: "homework.list" },
  set_lesson_status: { tool: "mutate", key: "operation", operation: "lesson.set_status" },
};

export function isLegacyToolName(name: unknown): name is keyof typeof LEGACY_TOOL_ALIASES {
  return typeof name === "string" && Object.hasOwn(LEGACY_TOOL_ALIASES, name);
}

/** Drops undefined/null values so the strict modern schemas don't reject them. */
function cleanArgs(args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/**
 * Translates a legacy tool call into the modern `{ tool, arguments }` shape.
 * Returns null when the name is not a legacy alias.
 */
export function translateLegacyCall(
  name: unknown,
  args: unknown,
): { tool: string; arguments: Record<string, unknown> } | null {
  if (!isLegacyToolName(name)) return null;
  const alias = LEGACY_TOOL_ALIASES[name]!;
  return {
    tool: alias.tool,
    arguments: { request: { [alias.key]: alias.operation, ...cleanArgs(args) } },
  };
}

/** Rewrites a JSON-RPC payload whose `tools/call` targets a legacy tool name. */
export function translateJsonRpcPayload(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return payload;
  if (Array.isArray(payload)) return payload.map(translateJsonRpcPayload);
  const message = payload as Record<string, unknown>;
  if (message.method !== "tools/call") return payload;
  const params = message.params;
  if (typeof params !== "object" || params === null) return payload;
  const { name, arguments: args } = params as Record<string, unknown>;
  const translated = translateLegacyCall(name, args);
  if (!translated) return payload;
  return {
    ...message,
    params: { ...params, name: translated.tool, arguments: translated.arguments },
  };
}

/**
 * Request-level adapter. Applied at the server entry (before routing) because
 * the generated MCP routes are owned by the build plugin. Rewrites:
 *  - `POST /mcp` JSON-RPC `tools/call` payloads for legacy names;
 *  - `POST /.mcp/invoke-tool/<legacy>` to the modern tool + translated body.
 * Any other request is returned untouched.
 */
export async function adaptLegacyMcpRequest(request: Request): Promise<Request> {
  if (request.method !== "POST") return request;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return request;
  }
  const path = url.pathname;
  const isRpc = path === "/mcp";
  const isInvoke = path.startsWith("/.mcp/invoke-tool/");
  if (!isRpc && !isInvoke) return request;
  if (isInvoke && !isLegacyToolName(path.slice("/.mcp/invoke-tool/".length))) return request;

  const text = await request.clone().text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      return request;
    }
  }

  if (isRpc) {
    const translated = translateJsonRpcPayload(payload);
    if (translated === payload) return request;
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(translated),
    });
  }

  const legacyName = path.slice("/.mcp/invoke-tool/".length);
  const translated = translateLegacyCall(legacyName, payload);
  if (!translated) return request;
  url.pathname = `/.mcp/invoke-tool/${translated.tool}`;
  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(translated.arguments),
  });
}

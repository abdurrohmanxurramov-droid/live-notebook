import { describe, expect, it } from "vitest";
import mcp from "./index";
import {
  LEGACY_TOOL_ALIASES,
  adaptLegacyMcpRequest,
  isLegacyToolName,
  translateJsonRpcPayload,
  translateLegacyCall,
} from "./legacy";
import { buildRequestSchema } from "./registry";
import { QUERY_OPS } from "./ops/queries";
import { MUTATE_OPS } from "./ops/mutations";

const querySchema = buildRequestSchema("resource", QUERY_OPS);
const mutateSchema = buildRequestSchema("operation", MUTATE_OPS);

describe("legacy tool aliases", () => {
  it("keeps the public catalog at exactly three tools", () => {
    const names = (mcp as unknown as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toEqual(["query", "mutate", "workflow"]);
    for (const legacy of Object.keys(LEGACY_TOOL_ALIASES)) {
      expect(names).not.toContain(legacy);
    }
  });

  it("covers every retired tool the connected client still calls", () => {
    expect(Object.keys(LEGACY_TOOL_ALIASES).sort()).toEqual([
      "list_finance",
      "list_homework",
      "list_lessons",
      "list_students",
      "set_lesson_status",
    ]);
  });

  it("recognises only legacy names", () => {
    expect(isLegacyToolName("list_students")).toBe(true);
    expect(isLegacyToolName("query")).toBe(false);
    expect(isLegacyToolName(42)).toBe(false);
  });

  it("translates list_students into a valid query request", () => {
    const out = translateLegacyCall("list_students", { status: "active" })!;
    expect(out.tool).toBe("query");
    expect(querySchema.safeParse(out.arguments.request).success).toBe(true);
  });

  it("translates list_lessons, list_finance and list_homework", () => {
    const lessons = translateLegacyCall("list_lessons", { from: "2026-01-01", to: "2026-01-31" })!;
    expect(querySchema.safeParse(lessons.arguments.request).success).toBe(true);

    const finance = translateLegacyCall("list_finance", { is_paid: false, limit: 10 })!;
    expect(querySchema.safeParse(finance.arguments.request).success).toBe(true);

    const homework = translateLegacyCall("list_homework", {})!;
    expect(querySchema.safeParse(homework.arguments.request).success).toBe(true);
  });

  it("translates set_lesson_status into a valid mutate request", () => {
    const out = translateLegacyCall("set_lesson_status", {
      lesson_id: "11111111-1111-4111-8111-111111111111",
      status: "completed",
    })!;
    expect(out.tool).toBe("mutate");
    expect(mutateSchema.safeParse(out.arguments.request).success).toBe(true);
  });

  it("drops null/undefined args so strict schemas still accept the call", () => {
    const out = translateLegacyCall("list_students", { status: null })!;
    expect(out.arguments.request).toEqual({ resource: "students.list" });
  });

  it("returns null for unknown or modern tool names", () => {
    expect(translateLegacyCall("query", {})).toBeNull();
    expect(translateLegacyCall("drop_database", {})).toBeNull();
  });

  it("rewrites a JSON-RPC tools/call for a legacy name", () => {
    const rewritten = translateJsonRpcPayload({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "list_students", arguments: { status: "paused" } },
    }) as { id: number; params: { name: string; arguments: { request: unknown } } };
    expect(rewritten.id).toBe(7);
    expect(rewritten.params.name).toBe("query");
    expect(rewritten.params.arguments.request).toEqual({
      resource: "students.list",
      status: "paused",
    });
  });

  it("leaves modern and non-call payloads untouched", () => {
    const listing = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    expect(translateJsonRpcPayload(listing)).toBe(listing);
    const modern = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "query", arguments: { request: { resource: "students.list" } } },
    };
    expect(translateJsonRpcPayload(modern)).toBe(modern);
  });
});

describe("request-level adapter", () => {
  const post = (url: string, body: unknown) =>
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    });

  it("rewrites a legacy invoke-tool path and body", async () => {
    const out = await adaptLegacyMcpRequest(
      post("https://app.test/.mcp/invoke-tool/list_students", { status: "active" }),
    );
    expect(new URL(out.url).pathname).toBe("/.mcp/invoke-tool/query");
    expect(await out.json()).toEqual({
      request: { resource: "students.list", status: "active" },
    });
    expect(out.headers.get("authorization")).toBe("Bearer t");
  });

  it("rewrites set_lesson_status to the mutate tool", async () => {
    const out = await adaptLegacyMcpRequest(
      post("https://app.test/.mcp/invoke-tool/set_lesson_status", {
        lesson_id: "11111111-1111-4111-8111-111111111111",
        status: "completed",
      }),
    );
    expect(new URL(out.url).pathname).toBe("/.mcp/invoke-tool/mutate");
    expect(await out.json()).toEqual({
      request: {
        operation: "lesson.set_status",
        lesson_id: "11111111-1111-4111-8111-111111111111",
        status: "completed",
      },
    });
  });

  it("rewrites a legacy JSON-RPC tools/call on /mcp", async () => {
    const out = await adaptLegacyMcpRequest(
      post("https://app.test/mcp", {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_finance", arguments: { is_paid: false } },
      }),
    );
    expect(await out.json()).toEqual({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "query",
        arguments: { request: { resource: "finance.list", is_paid: false } },
      },
    });
  });

  it("passes through modern calls and non-MCP paths unchanged", async () => {
    const modern = post("https://app.test/.mcp/invoke-tool/query", {
      request: { resource: "students.list" },
    });
    expect(await adaptLegacyMcpRequest(modern)).toBe(modern);
    const other = post("https://app.test/api/public/hooks/lesson-reminders", {});
    expect(await adaptLegacyMcpRequest(other)).toBe(other);
    const listing = post("https://app.test/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(await adaptLegacyMcpRequest(listing)).toBe(listing);
  });
});

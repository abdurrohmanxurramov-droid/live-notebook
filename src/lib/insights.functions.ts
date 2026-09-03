import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Secure UI bridge to a small allowlist of existing MCP v0.5.0 internal
 * operations. The public MCP contract (query/mutate/workflow) is untouched:
 * this only re-uses the same handlers from the app's own authenticated UI.
 * Everything still runs through requireCaller / guardWrite and Supabase RLS.
 */
const UI_QUERY_OPS = [
  "schedule.suggest_slot",
  "schedule.check_availability",
  "finance.overdue",
  "finance.cashflow",
  "finance.student_payment_history",
  "students.insights",
] as const;

const UI_MUTATE_OPS = ["homework.bulk_assign"] as const;

export type UiQueryOp = (typeof UI_QUERY_OPS)[number];
export type UiMutateOp = (typeof UI_MUTATE_OPS)[number];

const paramsSchema = z.record(z.string(), z.unknown()).default({});

const queryInput = z.object({
  operation: z.enum(UI_QUERY_OPS),
  params: paramsSchema,
});

const mutateInput = z.object({
  operation: z.enum(UI_MUTATE_OPS),
  params: paramsSchema,
});

async function runOp(kind: "query" | "mutate", operation: string, params: Record<string, unknown>) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const authHeader = getRequest()?.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  // Minimal ToolContext-compatible shim: the MCP handlers only use
  // isAuthenticated() and getToken().
  const ctx = {
    isAuthenticated: () => true,
    getToken: () => token,
  } as unknown as import("@lovable.dev/mcp-js").ToolContext;

  const { dispatch } = await import("@/lib/mcp/registry");
  const ops =
    kind === "query"
      ? (await import("@/lib/mcp/ops/queries")).QUERY_OPS
      : (await import("@/lib/mcp/ops/mutations")).MUTATE_OPS;

  const key = kind === "query" ? "resource" : "action";
  const result = await dispatch(key, ops, { [key]: operation, ...params }, ctx);
  if (result.isError) {
    throw new Error(result.content[0]?.text ?? "Операция не выполнена");
  }
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

export const uiQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => queryInput.parse(data))
  .handler(async ({ data }) => runOp("query", data.operation, data.params));

export const uiMutate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => mutateInput.parse(data))
  .handler(async ({ data }) => runOp("mutate", data.operation, data.params));

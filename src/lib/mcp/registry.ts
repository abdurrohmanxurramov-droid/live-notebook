import type { ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, type ToolResult } from "./supabase";

/**
 * An internal domain operation. Operations are NOT exposed as individual MCP
 * tools — the public surface is exactly three tools (query, mutate, workflow)
 * that route to these handlers after validating the operation-specific schema.
 */
export type Op = {
  /** Discriminator value, e.g. "students.list" or "student.create". */
  operation: string;
  /** One-line summary rendered into the tool's JSON Schema. */
  summary: string;
  /** Zod shape of the operation's own fields (without the discriminator). */
  shape: z.ZodRawShape;
  handler: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    ctx: ToolContext,
  ) => Promise<ToolResult> | ToolResult;
};

export function defineOp<S extends z.ZodRawShape>(op: {
  operation: string;
  summary: string;
  shape: S;
  handler: (input: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<ToolResult> | ToolResult;
}): Op {
  return op as unknown as Op;
}

/** Builds the discriminated union used as the tool's `request` JSON Schema. */
export function buildRequestSchema(key: string, ops: readonly Op[]) {
  const variants = ops.map((op) =>
    z
      .object({ [key]: z.literal(op.operation).describe(op.summary), ...op.shape })
      .strict()
      .describe(op.summary),
  );
  return z
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .discriminatedUnion(key, variants as any)
    .describe(`One of: ${ops.map((o) => o.operation).join(", ")}`);
}

/** Validates and routes one request to its operation handler. */
export async function dispatch(
  key: string,
  ops: readonly Op[],
  request: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (typeof request !== "object" || request === null) {
    return fail(`Некорректный запрос: ожидается объект с полем "${key}".`);
  }
  const record = request as Record<string, unknown>;
  const name = record[key];
  const op = ops.find((candidate) => candidate.operation === name);
  if (!op) {
    return fail(
      `Неизвестное значение "${key}": ${String(name)}. Доступно: ${ops
        .map((o) => o.operation)
        .join(", ")}`,
    );
  }
  const rest: Record<string, unknown> = { ...record };
  delete rest[key];
  const parsed = z.object(op.shape).strict().safeParse(rest);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return fail(`Некорректные параметры для ${op.operation}. ${issues}`);
  }
  return op.handler(parsed.data, ctx);
}

export function operationNames(ops: readonly Op[]): string[] {
  return ops.map((op) => op.operation);
}

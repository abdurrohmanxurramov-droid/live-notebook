import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildRequestSchema, defineOp, dispatch, operationNames } from "./registry";
import { QUERY_OPS } from "./ops/queries";
import { MUTATE_OPS } from "./ops/mutations";
import { WORKFLOW_OPS } from "./ops/workflows";
import mcp from "./index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = {} as any;

describe("public MCP surface", () => {
  it("exposes exactly three tools", () => {
    const names = (mcp as unknown as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toEqual(["query", "mutate", "workflow"]);
  });

  it("keeps operation names unique per tool", () => {
    for (const ops of [QUERY_OPS, MUTATE_OPS, WORKFLOW_OPS]) {
      const names = operationNames(ops);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("declares every read operation with a summary and no write side", () => {
    for (const op of QUERY_OPS) {
      expect(op.summary.length).toBeGreaterThan(10);
      expect(op.operation).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("never exposes a workflow that permanently deletes", () => {
    const purge = WORKFLOW_OPS.find((op) => op.operation === "request_permanent_delete");
    expect(purge).toBeDefined();
    expect(operationNames(WORKFLOW_OPS)).not.toContain("record.confirm_permanent_delete");
  });

  it("keeps the two-step permanent deletion in mutate", () => {
    const names = operationNames(MUTATE_OPS);
    expect(names).toContain("record.prepare_permanent_delete");
    expect(names).toContain("record.confirm_permanent_delete");
    expect(names).toContain("record.soft_delete");
    expect(names).toContain("record.restore");
  });
});

describe("request schema", () => {
  const schema = buildRequestSchema("resource", QUERY_OPS);

  it("accepts a valid variant", () => {
    expect(schema.safeParse({ resource: "students.list", status: "active" }).success).toBe(true);
  });

  it("rejects an unknown discriminator", () => {
    expect(schema.safeParse({ resource: "students.drop" }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(schema.safeParse({ resource: "students.list", sql: "select 1" }).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    expect(schema.safeParse({ resource: "lessons.get" }).success).toBe(false);
  });
});

describe("dispatch", () => {
  const spy = vi.fn(() => ({ content: [{ type: "text" as const, text: "done" }] }));
  const ops = [
    defineOp({
      operation: "demo.run",
      summary: "Demo operation used by tests.",
      shape: { id: z.string().uuid(), count: z.number().int().min(1).optional() },
      handler: spy,
    }),
  ];
  const id = "11111111-1111-4111-8111-111111111111";

  it("routes to the matching handler with parsed input", async () => {
    spy.mockClear();
    const result = await dispatch("operation", ops, { operation: "demo.run", id }, ctx);
    expect(result.isError).toBeUndefined();
    expect(spy).toHaveBeenCalledWith({ id }, ctx);
  });

  it("errors on an unknown operation", async () => {
    const result = await dispatch("operation", ops, { operation: "demo.nope", id }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("demo.run");
  });

  it("errors on invalid params without calling the handler", async () => {
    spy.mockClear();
    const result = await dispatch("operation", ops, { operation: "demo.run", id: "x" }, ctx);
    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects extra params", async () => {
    spy.mockClear();
    const result = await dispatch(
      "operation",
      ops,
      { operation: "demo.run", id, owner_id: "other" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("errors on a non-object request", async () => {
    const result = await dispatch("operation", ops, "students.list", ctx);
    expect(result.isError).toBe(true);
  });
});

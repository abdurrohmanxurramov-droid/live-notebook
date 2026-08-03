import { defineTool } from "@lovable.dev/mcp-js";
import { buildRequestSchema, dispatch, operationNames } from "../registry";
import { QUERY_OPS } from "../ops/queries";

/** Single read-only entry point. Every branch is a SELECT scoped by RLS. */
export const queryTool = defineTool({
  name: "query",
  title: "Query LiveNotebook data",
  description: `Read data from the signed-in teacher's LiveNotebook CRM. Never writes. Pick one operation in "request.resource": ${operationNames(
    QUERY_OPS,
  ).join(
    ", ",
  )}. Dates are YYYY-MM-DD, times HH:MM, weekdays 0=Sunday..6=Saturday. Date ranges may not exceed one year.`,
  inputSchema: {
    request: buildRequestSchema("resource", QUERY_OPS).describe(
      "The read operation and its parameters, discriminated by `resource`.",
    ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => dispatch("resource", QUERY_OPS, input.request, ctx),
});

export default queryTool;

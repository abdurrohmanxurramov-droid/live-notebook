import { defineTool } from "@lovable.dev/mcp-js";
import { buildRequestSchema, dispatch, operationNames } from "../registry";
import { MUTATE_OPS } from "../ops/mutations";

/** Single write entry point. Ownership, rate limits and soft-delete rules are enforced per operation. */
export const mutateTool = defineTool({
  name: "mutate",
  title: "Change LiveNotebook data",
  description: `Create or change one record in the signed-in teacher's LiveNotebook CRM. Pick one operation in "request.operation": ${operationNames(
    MUTATE_OPS,
  ).join(
    ", ",
  )}. Deletion is soft by default ("record.soft_delete") and reversible with "record.restore". Permanent deletion is two-step: "record.prepare_permanent_delete" returns a token, then "record.confirm_permanent_delete" consumes it — only after the user explicitly confirms. Attendance marking is idempotent per student and date.`,
  inputSchema: {
    request: buildRequestSchema("operation", MUTATE_OPS).describe(
      "The write operation and its typed payload, discriminated by `operation`.",
    ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: (input, ctx) => dispatch("operation", MUTATE_OPS, input.request, ctx),
});

export default mutateTool;

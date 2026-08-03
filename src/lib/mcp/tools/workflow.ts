import { defineTool } from "@lovable.dev/mcp-js";
import { buildRequestSchema, dispatch, operationNames } from "../registry";
import { WORKFLOW_OPS } from "../ops/workflows";

/** Multi-step orchestration. No workflow performs irreversible deletion. */
export const workflowTool = defineTool({
  name: "workflow",
  title: "Run a LiveNotebook workflow",
  description: `Run one supported multi-step routine in the signed-in teacher's LiveNotebook CRM. Pick one in "request.workflow": ${operationNames(
    WORKFLOW_OPS,
  ).join(
    ", ",
  )}. Each call returns a per-step report. Every workflow is reversible: none performs permanent deletion — "request_permanent_delete" only returns a confirmation token, and the user must confirm before the "mutate" tool executes "record.confirm_permanent_delete".`,
  inputSchema: {
    request: buildRequestSchema("workflow", WORKFLOW_OPS).describe(
      "The workflow and its typed input, discriminated by `workflow`.",
    ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: (input, ctx) => dispatch("workflow", WORKFLOW_OPS, input.request, ctx),
});

export default workflowTool;

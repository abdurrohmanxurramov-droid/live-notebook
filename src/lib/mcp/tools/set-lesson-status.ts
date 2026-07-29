import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function userClient(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "set_lesson_status",
  title: "Set lesson status",
  description:
    "Update the status of a lesson (planned | completed | cancelled | moved) and optionally add notes.",
  inputSchema: {
    id: z.string().uuid().describe("Lesson UUID"),
    status: z.enum(["planned", "completed", "cancelled", "moved"]),
    notes: z.string().max(1000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, status, notes }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = userClient(ctx);
    const patch: Record<string, unknown> = { status };
    if (notes !== undefined) patch.notes = notes;
    const { error } = await sb.from("lessons").update(patch).eq("id", id);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Lesson ${id} → ${status}` }] };
  },
});

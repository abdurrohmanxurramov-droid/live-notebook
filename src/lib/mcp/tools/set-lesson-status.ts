import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const LESSON_STATUSES = ["planned", "completed", "cancelled", "moved"] as const;

function userClient(ctx: ToolContext) {
  // Publishable key + the caller's bearer token: RLS runs as the signed-in user.
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "set_lesson_status",
  title: "Set lesson status",
  description:
    "Update the status of one existing lesson owned by the signed-in teacher. Allowed values: planned, completed, cancelled, moved.",
  inputSchema: {
    lesson_id: z.string().uuid().describe("ID of the lesson to update"),
    status: z.enum(LESSON_STATUSES).describe("New lesson status"),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ lesson_id, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = userClient(ctx);
    const { data: allowed, error: rateError } = await supabase.rpc("consume_app_rate_limit", {
      p_scope: "mcp_write",
    });
    if (rateError || allowed !== true) {
      return {
        content: [{ type: "text", text: "Too many requests. Try again later." }],
        isError: true,
      };
    }

    const { data: updated, error: updateError } = await supabase.rpc(
      "set_lesson_status_with_attendance",
      {
        p_lesson_id: lesson_id,
        p_notes: null,
        p_status: status,
        p_update_notes: false,
      },
    );
    if (updateError) {
      console.error("[mcp-set-lesson-status]", updateError.code);
      return {
        content: [{ type: "text", text: "The lesson could not be updated." }],
        isError: true,
      };
    }
    if (!updated) {
      return {
        content: [{ type: "text", text: "Lesson not found or not available." }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(updated) }],
      structuredContent: { lesson: updated },
    };
  },
});

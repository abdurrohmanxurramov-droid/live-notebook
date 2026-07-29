import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const LESSON_STATUSES = ["planned", "completed", "cancelled", "moved"] as const;
type LessonStatus = (typeof LESSON_STATUSES)[number];

function userClient(ctx: ToolContext) {
  // Publishable key + the caller's bearer token: RLS runs as the signed-in user.
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function lessonToAttendance(s: LessonStatus): string | null {
  if (s === "completed") return "present";
  if (s === "cancelled") return "absent";
  if (s === "moved") return "rescheduled_by_teacher";
  return null;
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
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ lesson_id, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = userClient(ctx);
    const userId = ctx.getUserId();

    // Existence + ownership check through the same user-scoped client (RLS).
    const { data: lesson, error: findError } = await supabase
      .from("lessons")
      .select("id, student_id, scheduled_date")
      .eq("id", lesson_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (findError)
      return { content: [{ type: "text", text: findError.message }], isError: true };
    if (!lesson)
      return {
        content: [
          { type: "text", text: "Lesson not found or not owned by the signed-in user." },
        ],
        isError: true,
      };

    const { data: updated, error: updateError } = await supabase
      .from("lessons")
      .update({ status })
      .eq("id", lesson_id)
      .select("id, student_id, scheduled_date, scheduled_time, duration_min, status, notes")
      .maybeSingle();
    if (updateError)
      return { content: [{ type: "text", text: updateError.message }], isError: true };
    if (!updated)
      return {
        content: [{ type: "text", text: "Update did not affect any lesson." }],
        isError: true,
      };

    // Keep the existing attendance sync that the app's status logic already performs.
    const attStatus = lessonToAttendance(status);
    const { data: existing } = await supabase
      .from("attendance")
      .select("id")
      .eq("student_id", lesson.student_id)
      .eq("date", lesson.scheduled_date)
      .is("deleted_at", null)
      .maybeSingle();
    if (attStatus === null) {
      if (existing)
        await supabase
          .from("attendance")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", existing.id);
    } else if (existing) {
      await supabase.from("attendance").update({ status: attStatus }).eq("id", existing.id);
    } else {
      await supabase.from("attendance").insert({
        owner_id: userId,
        student_id: lesson.student_id,
        date: lesson.scheduled_date,
        status: attStatus,
      });
    }

    return {
      content: [{ type: "text", text: JSON.stringify(updated) }],
      structuredContent: { lesson: updated },
    };
  },
});

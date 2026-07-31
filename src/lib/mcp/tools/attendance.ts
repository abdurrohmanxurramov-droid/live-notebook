import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  assertOwnStudent,
  dbError,
  fail,
  guardWrite,
  isToolResult,
  ok,
  requireCaller,
} from "../supabase";
import { ATTENDANCE_STATUSES, dateStr, noteSchema, uuid, validRange } from "../schemas";

export const listAttendance = defineTool({
  name: "list_attendance",
  title: "List attendance",
  description: "List attendance records in a date range, optionally for one student.",
  inputSchema: {
    from: dateStr,
    to: dateStr,
    student_id: uuid.optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    let query = caller.supabase
      .from("attendance")
      .select("id, student_id, date, status, note, compensated")
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });
    if (student_id) query = query.eq("student_id", student_id);
    const { data, error } = await query;
    if (error) return dbError("list_attendance", error);
    return ok({ attendance: data ?? [] });
  },
});

export const markAttendance = defineTool({
  name: "mark_attendance",
  title: "Mark attendance",
  description:
    "Set attendance for a student on a date. Calling it again for the same student and date updates the existing record instead of creating a duplicate.",
  inputSchema: {
    student_id: uuid,
    date: dateStr,
    status: z.enum(ATTENDANCE_STATUSES),
    note: noteSchema.optional().describe("Optional note; omit to keep the current note"),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ student_id, date, status, note }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase.rpc("upsert_attendance_entry", {
      p_student_id: student_id,
      p_date: date,
      p_status: status,
      p_note: note ?? "",
      p_update_note: note !== undefined,
    });
    if (error) return dbError("mark_attendance", error);
    if (!data) return fail("Ученик не найден.");
    return ok({ attendance: data });
  },
});

export default [listAttendance, markAttendance];

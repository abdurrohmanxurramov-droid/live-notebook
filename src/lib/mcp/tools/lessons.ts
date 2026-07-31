import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  assertOwnLesson,
  assertOwnStudent,
  dbError,
  fail,
  guardWrite,
  isToolResult,
  ok,
  requireCaller,
} from "../supabase";
import {
  compact,
  dateStr,
  durationSchema,
  LESSON_STATUSES,
  noteSchema,
  timeStr,
  uuid,
  validRange,
} from "../schemas";

const LESSON_COLUMNS =
  "id, student_id, scheduled_date, scheduled_time, duration_min, status, notes, source_slot_id, moved_from_id";
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listLessons = defineTool({
  name: "list_lessons",
  title: "List lessons",
  description: "List lessons in a date range (YYYY-MM-DD), optionally by student or status.",
  inputSchema: {
    from: dateStr,
    to: dateStr,
    student_id: uuid.optional(),
    status: z.enum(LESSON_STATUSES).optional(),
  },
  annotations: READ,
  handler: async ({ from, to, student_id, status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    let query = caller.supabase
      .from("lessons")
      .select(LESSON_COLUMNS)
      .is("deleted_at", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date")
      .order("scheduled_time");
    if (student_id) query = query.eq("student_id", student_id);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return dbError("list_lessons", error);
    return ok({ lessons: data ?? [] });
  },
});

export const getLesson = defineTool({
  name: "get_lesson",
  title: "Get lesson",
  description: "Get one lesson by ID.",
  inputSchema: { lesson_id: uuid },
  annotations: READ,
  handler: async ({ lesson_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("lessons")
      .select(LESSON_COLUMNS)
      .eq("id", lesson_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("get_lesson", error);
    if (!data) return fail("Урок не найден.");
    return ok({ lesson: data });
  },
});

export const createLesson = defineTool({
  name: "create_lesson",
  title: "Create lesson",
  description: "Create a single lesson for one of the teacher's students.",
  inputSchema: {
    student_id: uuid,
    scheduled_date: dateStr,
    scheduled_time: timeStr,
    duration_min: durationSchema.optional(),
    notes: noteSchema.optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ student_id, ...rest }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("lessons")
      .insert(compact({ student_id, owner_id: caller.userId, ...rest }))
      .select(LESSON_COLUMNS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return fail("Урок на это время уже существует.");
      return dbError("create_lesson", error);
    }
    return ok({ lesson: data });
  },
});

export const moveLesson = defineTool({
  name: "move_lesson",
  title: "Move lesson",
  description: "Reschedule an existing lesson to another date and/or time.",
  inputSchema: {
    lesson_id: uuid,
    scheduled_date: dateStr,
    scheduled_time: timeStr,
  },
  annotations: WRITE,
  handler: async ({ lesson_id, scheduled_date, scheduled_time }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data, error } = await caller.supabase
      .from("lessons")
      .update({ scheduled_date, scheduled_time, status: "planned" })
      .eq("id", lesson_id)
      .is("deleted_at", null)
      .select(LESSON_COLUMNS)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return fail("На это время уже назначен урок.");
      return dbError("move_lesson", error);
    }
    if (!data) return fail("Урок не найден.");
    return ok({ lesson: data });
  },
});

export const updateLesson = defineTool({
  name: "update_lesson",
  title: "Update lesson notes or duration",
  description: "Update the notes and/or duration of an existing lesson.",
  inputSchema: {
    lesson_id: uuid,
    notes: noteSchema.nullable().optional(),
    duration_min: durationSchema.optional(),
  },
  annotations: WRITE,
  handler: async ({ lesson_id, ...patch }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const fields = compact(patch);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("lessons")
      .update(fields)
      .eq("id", lesson_id)
      .is("deleted_at", null)
      .select(LESSON_COLUMNS)
      .maybeSingle();
    if (error) return dbError("update_lesson", error);
    if (!data) return fail("Урок не найден.");
    return ok({ lesson: data });
  },
});

export const setLessonStatus = defineTool({
  name: "set_lesson_status",
  title: "Set lesson status",
  description:
    "Update the status of one lesson (planned, completed, cancelled, moved) and keep attendance in sync. Repeating the call is idempotent.",
  inputSchema: {
    lesson_id: uuid,
    status: z.enum(LESSON_STATUSES),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ lesson_id, status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnLesson(caller.supabase, lesson_id))) return fail("Урок не найден.");
    const { data, error } = await caller.supabase.rpc("set_lesson_status_with_attendance", {
      p_lesson_id: lesson_id,
      p_notes: "",
      p_status: status,
      p_update_notes: false,
    });
    if (error) return dbError("set_lesson_status", error);
    if (!data) return fail("Урок не найден или недоступен.");
    return ok({ lesson: data });
  },
});

export default [listLessons, getLesson, createLesson, moveLesson, updateLesson, setLessonStatus];

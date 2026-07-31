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
import {
  compact,
  currencySchema,
  nameSchema,
  STUDENT_STATUSES,
  amountSchema,
  uuid,
} from "../schemas";

const STUDENT_COLUMNS =
  "id, name, subject, phone, days_per_week, status, lesson_price, lesson_currency, created_at";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listStudents = defineTool({
  name: "list_students",
  title: "List students",
  description: "List the signed-in teacher's students, optionally filtered by status.",
  inputSchema: {
    status: z.enum(STUDENT_STATUSES).optional().describe("Filter by student status"),
  },
  annotations: READ,
  handler: async ({ status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("students")
      .select(STUDENT_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return dbError("list_students", error);
    return ok({ students: data ?? [] });
  },
});

export const getStudent = defineTool({
  name: "get_student",
  title: "Get student",
  description: "Get one student with their schedule slots and recent lessons.",
  inputSchema: { student_id: uuid.describe("Student ID") },
  annotations: READ,
  handler: async ({ student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const { data: student, error } = await supabase
      .from("students")
      .select(STUDENT_COLUMNS)
      .eq("id", student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("get_student", error);
    if (!student) return fail("Ученик не найден.");
    const { data: slots } = await supabase
      .from("schedule_slots")
      .select("id, day_of_week, start_time, duration_min")
      .eq("student_id", student_id)
      .is("deleted_at", null);
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, scheduled_date, scheduled_time, duration_min, status")
      .eq("student_id", student_id)
      .is("deleted_at", null)
      .order("scheduled_date", { ascending: false })
      .limit(20);
    return ok({ student, slots: slots ?? [], recent_lessons: lessons ?? [] });
  },
});

export const createStudent = defineTool({
  name: "create_student",
  title: "Create student",
  description: "Create a new student for the signed-in teacher.",
  inputSchema: {
    name: nameSchema.describe("Student name"),
    subject: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(40).optional(),
    days_per_week: z.number().int().min(0).max(7).optional(),
    lesson_price: amountSchema.optional(),
    lesson_currency: currencySchema.optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data, error } = await caller.supabase
      .from("students")
      .insert({ ...compact(input), owner_id: caller.userId })
      .select(STUDENT_COLUMNS)
      .maybeSingle();
    if (error) return dbError("create_student", error);
    return ok({ student: data });
  },
});

export const updateStudent = defineTool({
  name: "update_student",
  title: "Update student",
  description: "Update fields of an existing student owned by the signed-in teacher.",
  inputSchema: {
    student_id: uuid,
    name: nameSchema.optional(),
    subject: z.string().trim().max(100).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    days_per_week: z.number().int().min(0).max(7).optional(),
    lesson_price: amountSchema.nullable().optional(),
    lesson_currency: currencySchema.nullable().optional(),
  },
  annotations: WRITE,
  handler: async ({ student_id, ...patch }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const fields = compact(patch);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("students")
      .update(fields)
      .eq("id", student_id)
      .is("deleted_at", null)
      .select(STUDENT_COLUMNS)
      .maybeSingle();
    if (error) return dbError("update_student", error);
    if (!data) return fail("Ученик не найден.");
    return ok({ student: data });
  },
});

export const setStudentStatus = defineTool({
  name: "set_student_status",
  title: "Set student status",
  description:
    "Pause, resume (active), complete or archive a student. Repeating the call is safe.",
  inputSchema: {
    student_id: uuid,
    status: z.enum(STUDENT_STATUSES).describe("active = resume, paused = pause"),
  },
  annotations: WRITE,
  handler: async ({ student_id, status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data, error } = await caller.supabase
      .from("students")
      .update({ status })
      .eq("id", student_id)
      .is("deleted_at", null)
      .select("id, name, status")
      .maybeSingle();
    if (error) return dbError("set_student_status", error);
    if (!data) return fail("Ученик не найден.");
    return ok({ student: data });
  },
});

export default [listStudents, getStudent, createStudent, updateStudent, setStudentStatus];

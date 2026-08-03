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
  ATTENDANCE_STATUSES,
  DELETABLE_TABLES,
  HOMEWORK_STATUSES,
  LESSON_STATUSES,
  STUDENT_STATUSES,
  amountSchema,
  compact,
  currencySchema,
  dateStr,
  dayOfWeekSchema,
  durationSchema,
  nameSchema,
  noteSchema,
  settingsPatchSchema,
  taskSchema,
  timeStr,
  uuid,
} from "../schemas";
import { defineOp, type Op } from "../registry";

const STUDENT_COLUMNS =
  "id, name, subject, phone, days_per_week, status, lesson_price, lesson_currency, created_at";
const SLOT_COLUMNS = "id, student_id, day_of_week, start_time, duration_min, created_at";
const LESSON_COLUMNS =
  "id, student_id, scheduled_date, scheduled_time, duration_min, status, notes, source_slot_id, moved_from_id";
const FINANCE_COLUMNS =
  "id, student_id, amount, currency, is_paid, pay_date, entry_type, cycle_number, created_at";
const HW_COLUMNS = "id, student_id, task, assigned_date, due_date, status, note, created_at";
const SETTINGS_COLUMNS =
  "default_currency, default_lesson_duration, default_lesson_price, week_starts_on, remind_before_min, locale, remind_lessons, remind_payments, remind_homework, theme, onboarding_completed";

const tableSchema = z.enum(DELETABLE_TABLES).describe("Record type to act on");

export const createStudent = defineOp({
  operation: "student.create",
  summary: "Create a new student.",
  shape: {
    name: nameSchema,
    subject: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(40).optional(),
    days_per_week: z.number().int().min(0).max(7).optional(),
    lesson_price: amountSchema.optional(),
    lesson_currency: currencySchema.optional(),
  },
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
    if (error) return dbError("student.create", error);
    return ok({ student: data });
  },
});

export const updateStudent = defineOp({
  operation: "student.update",
  summary: "Update fields of an existing student.",
  shape: {
    student_id: uuid,
    name: nameSchema.optional(),
    subject: z.string().trim().max(100).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    days_per_week: z.number().int().min(0).max(7).optional(),
    lesson_price: amountSchema.nullable().optional(),
    lesson_currency: currencySchema.nullable().optional(),
  },
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
    if (error) return dbError("student.update", error);
    if (!data) return fail("Ученик не найден.");
    return ok({ student: data });
  },
});

export const setStudentStatus = defineOp({
  operation: "student.set_status",
  summary: "Set a student's status: active (resume), paused, completed or archived.",
  shape: { student_id: uuid, status: z.enum(STUDENT_STATUSES) },
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
    if (error) return dbError("student.set_status", error);
    if (!data) return fail("Ученик не найден.");
    return ok({ student: data });
  },
});

export const createSlot = defineOp({
  operation: "schedule_slot.create",
  summary: "Add a recurring weekly slot for a student.",
  shape: {
    student_id: uuid,
    day_of_week: dayOfWeekSchema,
    start_time: timeStr,
    duration_min: durationSchema.optional(),
  },
  handler: async ({ student_id, day_of_week, start_time, duration_min }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("schedule_slots")
      .insert(
        compact({ student_id, day_of_week, start_time, duration_min, owner_id: caller.userId }),
      )
      .select(SLOT_COLUMNS)
      .maybeSingle();
    if (error) return dbError("schedule_slot.create", error);
    return ok({ slot: data });
  },
});

async function patchSlot(
  ctx: Parameters<typeof requireCaller>[0],
  slotId: string,
  patch: Record<string, unknown>,
  tag: string,
) {
  const caller = await requireCaller(ctx);
  if (isToolResult(caller)) return caller;
  const limited = await guardWrite(caller.userId);
  if (limited) return limited;
  const fields = compact(patch);
  if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
  const { data, error } = await caller.supabase
    .from("schedule_slots")
    .update(fields)
    .eq("id", slotId)
    .is("deleted_at", null)
    .select(SLOT_COLUMNS)
    .maybeSingle();
  if (error) return dbError(tag, error);
  if (!data) return fail("Слот не найден.");
  return ok({ slot: data });
}

export const updateSlot = defineOp({
  operation: "schedule_slot.update",
  summary: "Change the start time and/or duration of a recurring slot.",
  shape: { slot_id: uuid, start_time: timeStr.optional(), duration_min: durationSchema.optional() },
  handler: ({ slot_id, ...patch }, ctx) => patchSlot(ctx, slot_id, patch, "schedule_slot.update"),
});

export const moveSlot = defineOp({
  operation: "schedule_slot.move",
  summary: "Move a recurring slot to another weekday and time.",
  shape: { slot_id: uuid, day_of_week: dayOfWeekSchema, start_time: timeStr },
  handler: ({ slot_id, ...patch }, ctx) => patchSlot(ctx, slot_id, patch, "schedule_slot.move"),
});

export const createLesson = defineOp({
  operation: "lesson.create",
  summary: "Create a single lesson for a student.",
  shape: {
    student_id: uuid,
    scheduled_date: dateStr,
    scheduled_time: timeStr,
    duration_min: durationSchema.optional(),
    notes: noteSchema.optional(),
  },
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
      return dbError("lesson.create", error);
    }
    return ok({ lesson: data });
  },
});

export const moveLesson = defineOp({
  operation: "lesson.move",
  summary: "Reschedule an existing lesson to another date and time.",
  shape: { lesson_id: uuid, scheduled_date: dateStr, scheduled_time: timeStr },
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
      return dbError("lesson.move", error);
    }
    if (!data) return fail("Урок не найден.");
    return ok({ lesson: data });
  },
});

export const updateLesson = defineOp({
  operation: "lesson.update",
  summary: "Update the notes and/or duration of a lesson.",
  shape: {
    lesson_id: uuid,
    notes: noteSchema.nullable().optional(),
    duration_min: durationSchema.optional(),
  },
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
    if (error) return dbError("lesson.update", error);
    if (!data) return fail("Урок не найден.");
    return ok({ lesson: data });
  },
});

export const setLessonStatus = defineOp({
  operation: "lesson.set_status",
  summary: "Set a lesson's status and keep attendance in sync (idempotent).",
  shape: { lesson_id: uuid, status: z.enum(LESSON_STATUSES) },
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
    if (error) return dbError("lesson.set_status", error);
    if (!data) return fail("Урок не найден или недоступен.");
    return ok({ lesson: data });
  },
});

export const markAttendance = defineOp({
  operation: "attendance.mark",
  summary:
    "Set attendance for a student on a date; repeating the call updates the same record instead of duplicating it.",
  shape: {
    student_id: uuid,
    date: dateStr,
    status: z.enum(ATTENDANCE_STATUSES),
    note: noteSchema.optional(),
  },
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
    if (error) return dbError("attendance.mark", error);
    if (!data) return fail("Ученик не найден.");
    return ok({ attendance: data });
  },
});

export const createFinanceEntry = defineOp({
  operation: "finance.create",
  summary: "Create a manual payment/charge record for a student.",
  shape: {
    student_id: uuid,
    amount: amountSchema,
    currency: currencySchema,
    is_paid: z.boolean().optional(),
    pay_date: dateStr.optional(),
  },
  handler: async ({ student_id, ...rest }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("finance")
      .insert(compact({ student_id, owner_id: caller.userId, entry_type: "manual", ...rest }))
      .select(FINANCE_COLUMNS)
      .maybeSingle();
    if (error) return dbError("finance.create", error);
    return ok({ entry: data });
  },
});

export const updateFinanceEntry = defineOp({
  operation: "finance.update",
  summary: "Update the amount, currency or payment date of a finance record.",
  shape: {
    finance_id: uuid,
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    pay_date: dateStr.nullable().optional(),
  },
  handler: async ({ finance_id, ...patch }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const fields = compact(patch);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("finance")
      .update(fields)
      .eq("id", finance_id)
      .is("deleted_at", null)
      .select(FINANCE_COLUMNS)
      .maybeSingle();
    if (error) return dbError("finance.update", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ entry: data });
  },
});

export const setFinancePaid = defineOp({
  operation: "finance.set_paid",
  summary: "Mark a finance record as paid or unpaid (idempotent).",
  shape: { finance_id: uuid, is_paid: z.boolean(), pay_date: dateStr.optional() },
  handler: async ({ finance_id, is_paid, pay_date }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const patch = is_paid
      ? { is_paid: true, pay_date: pay_date ?? new Date().toISOString().slice(0, 10) }
      : { is_paid: false, pay_date: null };
    const { data, error } = await caller.supabase
      .from("finance")
      .update(patch)
      .eq("id", finance_id)
      .is("deleted_at", null)
      .select(FINANCE_COLUMNS)
      .maybeSingle();
    if (error) return dbError("finance.set_paid", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ entry: data });
  },
});

export const createHomework = defineOp({
  operation: "homework.create",
  summary: "Assign homework to a student.",
  shape: {
    student_id: uuid,
    task: taskSchema,
    assigned_date: dateStr.optional(),
    due_date: dateStr.optional(),
    note: noteSchema.optional(),
  },
  handler: async ({ student_id, ...rest }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("homework")
      .insert(compact({ student_id, owner_id: caller.userId, ...rest }))
      .select(HW_COLUMNS)
      .maybeSingle();
    if (error) return dbError("homework.create", error);
    return ok({ homework: data });
  },
});

export const updateHomework = defineOp({
  operation: "homework.update",
  summary: "Update the task text, due date, status or note of a homework entry.",
  shape: {
    homework_id: uuid,
    task: taskSchema.optional(),
    due_date: dateStr.nullable().optional(),
    status: z.enum(HOMEWORK_STATUSES).optional(),
    note: noteSchema.nullable().optional(),
  },
  handler: async ({ homework_id, ...patch }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const fields = compact(patch);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("homework")
      .update(fields)
      .eq("id", homework_id)
      .is("deleted_at", null)
      .select(HW_COLUMNS)
      .maybeSingle();
    if (error) return dbError("homework.update", error);
    if (!data) return fail("Задание не найдено.");
    return ok({ homework: data });
  },
});

export const updateSettings = defineOp({
  operation: "settings.update",
  summary: "Update safe app preferences (defaults, reminders, locale). Secrets are never writable.",
  shape: settingsPatchSchema.shape,
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const parsed = settingsPatchSchema.safeParse(input);
    if (!parsed.success) return fail("Некорректные значения настроек.");
    const fields = compact(parsed.data);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("user_settings")
      .upsert({ user_id: caller.userId, ...fields }, { onConflict: "user_id" })
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    if (error) return dbError("settings.update", error);
    return ok({ settings: data });
  },
});

export const softDeleteRecord = defineOp({
  operation: "record.soft_delete",
  summary:
    "Move a record to trash (reversible). Trashing a student also trashes their slots, lessons, attendance and homework.",
  shape: { table: tableSchema, record_id: uuid },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (table === "students") {
      const { data, error } = await caller.supabase.rpc("set_student_deleted_state", {
        p_deleted: true,
        p_student_id: record_id,
      });
      if (error) return dbError("record.soft_delete", error);
      if (!data) return fail("Ученик не найден.");
      return ok({ deleted: { table, id: record_id } });
    }
    const { data, error } = await caller.supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", record_id)
      .select("id")
      .maybeSingle();
    if (error) return dbError("record.soft_delete", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ deleted: { table, id: record_id } });
  },
});

export const restoreRecord = defineOp({
  operation: "record.restore",
  summary: "Restore a soft-deleted record from trash.",
  shape: { table: tableSchema, record_id: uuid },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (table === "students") {
      const { data, error } = await caller.supabase.rpc("set_student_deleted_state", {
        p_deleted: false,
        p_student_id: record_id,
      });
      if (error) return dbError("record.restore", error);
      if (!data) return fail("Ученик не найден.");
      return ok({ restored: { table, id: record_id } });
    }
    const { data, error } = await caller.supabase
      .from(table)
      .update({ deleted_at: null })
      .eq("id", record_id)
      .select("id")
      .maybeSingle();
    if (error) return dbError("record.restore", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ restored: { table, id: record_id } });
  },
});

export const preparePermanentDelete = defineOp({
  operation: "record.prepare_permanent_delete",
  summary:
    "Step 1 of 2 of irreversible deletion: returns a confirmation token valid 5 minutes. Ask the user explicitly before step 2.",
  shape: { table: tableSchema, record_id: uuid },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data: target, error: targetError } = await caller.supabase
      .from(table)
      .select("id")
      .eq("id", record_id)
      .maybeSingle();
    if (targetError) return dbError("record.prepare_permanent_delete", targetError);
    if (!target) return fail("Запись не найдена.");
    const { data, error } = await caller.supabase
      .from("mcp_pending_deletes")
      .insert({ owner_id: caller.userId, target_table: table, target_id: record_id })
      .select("id, expires_at")
      .maybeSingle();
    if (error) return dbError("record.prepare_permanent_delete", error);
    return ok({
      confirmation_token: data?.id,
      expires_at: data?.expires_at,
      warning:
        "Необратимое удаление. Подтвердите у пользователя перед record.confirm_permanent_delete.",
    });
  },
});

export const confirmPermanentDelete = defineOp({
  operation: "record.confirm_permanent_delete",
  summary:
    "Step 2 of 2: permanently delete the record behind a confirmation token. Irreversible; requires explicit user confirmation.",
  shape: { confirmation_token: uuid },
  handler: async ({ confirmation_token }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data: pending, error } = await caller.supabase
      .from("mcp_pending_deletes")
      .select("id, target_table, target_id, expires_at")
      .eq("id", confirmation_token)
      .maybeSingle();
    if (error) return dbError("record.confirm_permanent_delete", error);
    if (!pending) return fail("Подтверждение не найдено. Запросите новое.");
    // Single-use: drop the token before acting on it.
    await caller.supabase.from("mcp_pending_deletes").delete().eq("id", pending.id);
    if (new Date(pending.expires_at as string).getTime() < Date.now()) {
      return fail("Срок подтверждения истёк. Запросите новое.");
    }
    const table = pending.target_table as (typeof DELETABLE_TABLES)[number];
    const { data: removed, error: deleteError } = await caller.supabase
      .from(table)
      .delete()
      .eq("id", pending.target_id)
      .select("id")
      .maybeSingle();
    if (deleteError) return dbError("record.confirm_permanent_delete", deleteError);
    if (!removed) return fail("Запись не найдена.");
    return ok({ permanently_deleted: { table, id: pending.target_id } });
  },
});

export const MUTATE_OPS: readonly Op[] = [
  createStudent,
  updateStudent,
  setStudentStatus,
  createSlot,
  updateSlot,
  moveSlot,
  createLesson,
  moveLesson,
  updateLesson,
  setLessonStatus,
  markAttendance,
  createFinanceEntry,
  updateFinanceEntry,
  setFinancePaid,
  createHomework,
  updateHomework,
  updateSettings,
  softDeleteRecord,
  restoreRecord,
  preparePermanentDelete,
  confirmPermanentDelete,
];

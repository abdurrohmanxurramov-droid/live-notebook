import { z } from "zod";
import { dbError, fail, isToolResult, ok, requireCaller } from "../supabase";
import {
  ATTENDANCE_STATUSES,
  DELETABLE_TABLES,
  HOMEWORK_STATUSES,
  LESSON_STATUSES,
  STUDENT_STATUSES,
  dateStr,
  dayOfWeekSchema,
  limitSchema,
  uuid,
  validRange,
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

const TRASH_COLUMNS: Record<(typeof DELETABLE_TABLES)[number], string> = {
  students: "id, name, subject, deleted_at",
  lessons: "id, student_id, scheduled_date, scheduled_time, status, deleted_at",
  attendance: "id, student_id, date, status, deleted_at",
  finance: "id, student_id, amount, currency, is_paid, deleted_at",
  homework: "id, student_id, task, status, deleted_at",
  schedule_slots: "id, student_id, day_of_week, start_time, deleted_at",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const listStudents = defineOp({
  operation: "students.list",
  summary: "List the teacher's students, optionally filtered by status.",
  shape: { status: z.enum(STUDENT_STATUSES).optional() },
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
    if (error) return dbError("students.list", error);
    return ok({ students: data ?? [] });
  },
});

const getStudent = defineOp({
  operation: "students.get",
  summary: "Get one student with their weekly slots and 20 most recent lessons.",
  shape: { student_id: uuid },
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
    if (error) return dbError("students.get", error);
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

const listSlots = defineOp({
  operation: "schedule_slots.list",
  summary: "List recurring weekly slots, optionally by student or weekday (0=Sunday).",
  shape: { student_id: uuid.optional(), day_of_week: dayOfWeekSchema.optional() },
  handler: async ({ student_id, day_of_week }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("schedule_slots")
      .select(SLOT_COLUMNS)
      .is("deleted_at", null)
      .order("day_of_week")
      .order("start_time");
    if (student_id) query = query.eq("student_id", student_id);
    if (day_of_week !== undefined) query = query.eq("day_of_week", day_of_week);
    const { data, error } = await query;
    if (error) return dbError("schedule_slots.list", error);
    return ok({ slots: data ?? [] });
  },
});

const getSlot = defineOp({
  operation: "schedule_slots.get",
  summary: "Get one recurring weekly slot by ID.",
  shape: { slot_id: uuid },
  handler: async ({ slot_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("schedule_slots")
      .select(SLOT_COLUMNS)
      .eq("id", slot_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("schedule_slots.get", error);
    if (!data) return fail("Слот не найден.");
    return ok({ slot: data });
  },
});

const listLessons = defineOp({
  operation: "lessons.list",
  summary: "List lessons in a date range (max 1 year), optionally by student or status.",
  shape: {
    from: dateStr,
    to: dateStr,
    student_id: uuid.optional(),
    status: z.enum(LESSON_STATUSES).optional(),
  },
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
    if (error) return dbError("lessons.list", error);
    return ok({ lessons: data ?? [] });
  },
});

const getLesson = defineOp({
  operation: "lessons.get",
  summary: "Get one lesson by ID.",
  shape: { lesson_id: uuid },
  handler: async ({ lesson_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("lessons")
      .select(LESSON_COLUMNS)
      .eq("id", lesson_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("lessons.get", error);
    if (!data) return fail("Урок не найден.");
    return ok({ lesson: data });
  },
});

const todayLessons = defineOp({
  operation: "lessons.today",
  summary: "List lessons for today (or a given date) including student names.",
  shape: { date: dateStr.optional() },
  handler: async ({ date }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const day = date ?? today();
    const { data, error } = await caller.supabase
      .from("lessons")
      .select("id, student_id, scheduled_time, duration_min, status, students(name)")
      .is("deleted_at", null)
      .eq("scheduled_date", day)
      .order("scheduled_time");
    if (error) return dbError("lessons.today", error);
    return ok({ date: day, lessons: data ?? [] });
  },
});

const listAttendance = defineOp({
  operation: "attendance.list",
  summary: "List attendance records in a date range, optionally for one student.",
  shape: {
    from: dateStr,
    to: dateStr,
    student_id: uuid.optional(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
  },
  handler: async ({ from, to, student_id, status }, ctx) => {
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
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return dbError("attendance.list", error);
    return ok({ attendance: data ?? [] });
  },
});

const listFinance = defineOp({
  operation: "finance.list",
  summary: "List finance records, optionally filtered by student or paid state.",
  shape: {
    student_id: uuid.optional(),
    is_paid: z.boolean().optional(),
    limit: limitSchema.optional(),
  },
  handler: async ({ student_id, is_paid, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("finance")
      .select(FINANCE_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 100);
    if (student_id) query = query.eq("student_id", student_id);
    if (is_paid !== undefined) query = query.eq("is_paid", is_paid);
    const { data, error } = await query;
    if (error) return dbError("finance.list", error);
    return ok({ finance: data ?? [] });
  },
});

const listDebts = defineOp({
  operation: "finance.debts",
  summary: "List unpaid finance records with totals per currency.",
  shape: {},
  handler: async (_input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("finance")
      .select("id, student_id, amount, currency, created_at")
      .is("deleted_at", null)
      .eq("is_paid", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return dbError("finance.debts", error);
    const totals: Record<string, number> = {};
    for (const row of data ?? []) {
      const key = String(row.currency);
      totals[key] = (totals[key] ?? 0) + Number(row.amount ?? 0);
    }
    return ok({ unpaid: data ?? [], totals_by_currency: totals });
  },
});

const unpaidStudents = defineOp({
  operation: "finance.unpaid_students",
  summary: "Summarise students who currently owe money, grouped per student and currency.",
  shape: {},
  handler: async (_input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("finance")
      .select("student_id, amount, currency, students(name)")
      .is("deleted_at", null)
      .eq("is_paid", false)
      .limit(200);
    if (error) return dbError("finance.unpaid_students", error);
    const map = new Map<
      string,
      { student_id: string; name: string | null; totals: Record<string, number> }
    >();
    for (const row of data ?? []) {
      const id = String(row.student_id);
      const student = row.students as { name?: string } | null;
      const entry = map.get(id) ?? { student_id: id, name: student?.name ?? null, totals: {} };
      const cur = String(row.currency);
      entry.totals[cur] = (entry.totals[cur] ?? 0) + Number(row.amount ?? 0);
      map.set(id, entry);
    }
    return ok({ students: [...map.values()] });
  },
});

const listHomework = defineOp({
  operation: "homework.list",
  summary: "List homework entries, optionally filtered by student or status.",
  shape: {
    student_id: uuid.optional(),
    status: z.enum(HOMEWORK_STATUSES).optional(),
    limit: limitSchema.optional(),
  },
  handler: async ({ student_id, status, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("homework")
      .select(HW_COLUMNS)
      .is("deleted_at", null)
      .order("assigned_date", { ascending: false })
      .limit(limit ?? 100);
    if (student_id) query = query.eq("student_id", student_id);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return dbError("homework.list", error);
    return ok({ homework: data ?? [] });
  },
});

const getHomework = defineOp({
  operation: "homework.get",
  summary: "Get one homework entry by ID.",
  shape: { homework_id: uuid },
  handler: async ({ homework_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("homework")
      .select(HW_COLUMNS)
      .eq("id", homework_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("homework.get", error);
    if (!data) return fail("Задание не найдено.");
    return ok({ homework: data });
  },
});

const upcomingHomework = defineOp({
  operation: "homework.upcoming",
  summary: "List open homework due within the next N days (default 7).",
  shape: { days: z.number().int().min(1).max(60).optional() },
  handler: async ({ days }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const from = today();
    const to = addDays(from, days ?? 7);
    const { data, error } = await caller.supabase
      .from("homework")
      .select("id, student_id, task, due_date, status, students(name)")
      .is("deleted_at", null)
      .in("status", ["assigned", "partial", "not_done"])
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date");
    if (error) return dbError("homework.upcoming", error);
    return ok({ from, to, homework: data ?? [] });
  },
});

const getSettings = defineOp({
  operation: "settings.get",
  summary: "Read the teacher's app settings (defaults, reminders, locale).",
  shape: {},
  handler: async (_input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    if (error) return dbError("settings.get", error);
    return ok({ settings: data ?? null });
  },
});

const periodSummary = defineOp({
  operation: "reports.period_summary",
  summary:
    "Aggregate a date range: lessons by status, attendance by status, paid/unpaid totals per currency.",
  shape: { from: dateStr, to: dateStr },
  handler: async ({ from, to }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const { supabase } = caller;
    const [lessonsRes, attendanceRes, financeRes] = await Promise.all([
      supabase
        .from("lessons")
        .select("status")
        .is("deleted_at", null)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to),
      supabase
        .from("attendance")
        .select("status")
        .is("deleted_at", null)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("finance")
        .select("amount, currency, is_paid, pay_date, created_at")
        .is("deleted_at", null)
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`),
    ]);
    const anyError = lessonsRes.error ?? attendanceRes.error ?? financeRes.error;
    if (anyError) return dbError("reports.period_summary", anyError);

    const count = (rows: Array<{ status: string }> | null) => {
      const out: Record<string, number> = {};
      for (const r of rows ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
      return out;
    };
    const paid: Record<string, number> = {};
    const unpaid: Record<string, number> = {};
    for (const row of financeRes.data ?? []) {
      const bucket = row.is_paid ? paid : unpaid;
      const cur = String(row.currency);
      bucket[cur] = (bucket[cur] ?? 0) + Number(row.amount ?? 0);
    }
    return ok({
      from,
      to,
      lessons_by_status: count(lessonsRes.data as Array<{ status: string }>),
      attendance_by_status: count(attendanceRes.data as Array<{ status: string }>),
      paid_totals: paid,
      unpaid_totals: unpaid,
    });
  },
});

const listTrash = defineOp({
  operation: "trash.list",
  summary: "List soft-deleted records that can still be restored.",
  shape: { table: z.enum(DELETABLE_TABLES).optional() },
  handler: async ({ table }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const tables = table ? [table] : [...DELETABLE_TABLES];
    const out: Record<string, unknown[]> = {};
    for (const t of tables) {
      const { data, error } = await caller.supabase
        .from(t)
        .select(TRASH_COLUMNS[t])
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(100);
      if (error) return dbError("trash.list", error);
      out[t] = data ?? [];
    }
    return ok({ trash: out });
  },
});

export const QUERY_OPS: readonly Op[] = [
  listStudents,
  getStudent,
  listSlots,
  getSlot,
  listLessons,
  getLesson,
  todayLessons,
  listAttendance,
  listFinance,
  listDebts,
  unpaidStudents,
  listHomework,
  getHomework,
  upcomingHomework,
  getSettings,
  periodSummary,
  listTrash,
];

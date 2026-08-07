import { z } from "zod";
import { dbError, fail, isToolResult, ok, requireCaller } from "../supabase";
import {
  DELETABLE_TABLES,
  STUDENT_STATUSES,
  addDaysIso,
  dateStr,
  durationSchema,
  fromMinutes,
  limitSchema,
  overlaps,
  sanitizeSearch,
  searchTermSchema,
  timeStr,
  toMinutes,
  todayIso,
  uuid,
  validRange,
} from "../schemas";
import { defineOp, type Op } from "../registry";

const STUDENT_COLUMNS =
  "id, name, subject, phone, days_per_week, status, lesson_price, lesson_currency, created_at";

const TRASH_COLUMNS: Record<(typeof DELETABLE_TABLES)[number], string> = {
  students: "id, name, subject, deleted_at",
  lessons: "id, student_id, scheduled_date, scheduled_time, status, deleted_at",
  attendance: "id, student_id, date, status, deleted_at",
  finance: "id, student_id, amount, currency, is_paid, deleted_at",
  homework: "id, student_id, task, status, deleted_at",
  schedule_slots: "id, student_id, day_of_week, start_time, deleted_at",
};

const OPEN_HOMEWORK = ["assigned", "partial", "not_done"] as const;

type Counter = Record<string, number>;

function bump(map: Counter, key: string, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

function studentName(row: { students?: unknown }): string | null {
  const s = row.students as { name?: string } | null | undefined;
  return s?.name ?? null;
}

/* ------------------------------------------------------------------ reads */

const searchStudents = defineOp({
  operation: "students.search",
  summary: "Search students by name, phone or subject; optional status filter and limit.",
  shape: {
    query: searchTermSchema,
    status: z.enum(STUDENT_STATUSES).optional(),
    limit: limitSchema.optional(),
  },
  handler: async ({ query, status, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const term = sanitizeSearch(query);
    if (!term) return fail("Пустой поисковый запрос.");
    let q = caller.supabase
      .from("students")
      .select(STUDENT_COLUMNS)
      .is("deleted_at", null)
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%,subject.ilike.%${term}%`)
      .order("name")
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return dbError("students.search", error);
    return ok({ query: term, students: data ?? [] });
  },
});

const studentsSummary = defineOp({
  operation: "students.summary",
  summary: "Counts of students per status, plus how many were added inside an optional period.",
  shape: { from: dateStr.optional(), to: dateStr.optional() },
  handler: async ({ from, to }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (from && to && !validRange(from, to)) {
      return fail("Некорректный диапазон дат (максимум 1 год).");
    }
    const { data, error } = await caller.supabase
      .from("students")
      .select("id, status, created_at")
      .is("deleted_at", null);
    if (error) return dbError("students.summary", error);
    const byStatus: Counter = {};
    let newInPeriod = 0;
    for (const row of data ?? []) {
      bump(byStatus, String(row.status));
      const created = String(row.created_at ?? "").slice(0, 10);
      if (from && to && created >= from && created <= to) newInPeriod += 1;
    }
    return ok({
      total: data?.length ?? 0,
      by_status: byStatus,
      active: byStatus["active"] ?? 0,
      ...(from && to ? { from, to, new_in_period: newInPeriod } : {}),
    });
  },
});

const scheduleWeek = defineOp({
  operation: "schedule.week",
  summary: "Lessons for the 7 days starting at week_start, with student names and weekly slots.",
  shape: { week_start: dateStr, student_id: uuid.optional() },
  handler: async ({ week_start, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const week_end = addDaysIso(week_start, 6);
    let lessonQuery = caller.supabase
      .from("lessons")
      .select(
        "id, student_id, scheduled_date, scheduled_time, duration_min, status, students(name)",
      )
      .is("deleted_at", null)
      .gte("scheduled_date", week_start)
      .lte("scheduled_date", week_end)
      .order("scheduled_date")
      .order("scheduled_time");
    let slotQuery = caller.supabase
      .from("schedule_slots")
      .select("id, student_id, day_of_week, start_time, duration_min, students(name)")
      .is("deleted_at", null)
      .order("day_of_week")
      .order("start_time");
    if (student_id) {
      lessonQuery = lessonQuery.eq("student_id", student_id);
      slotQuery = slotQuery.eq("student_id", student_id);
    }
    const [lessons, slots] = await Promise.all([lessonQuery, slotQuery]);
    const anyError = lessons.error ?? slots.error;
    if (anyError) return dbError("schedule.week", anyError);

    const days: Record<string, unknown[]> = {};
    for (let i = 0; i < 7; i += 1) days[addDaysIso(week_start, i)] = [];
    for (const row of lessons.data ?? []) {
      const key = String(row.scheduled_date);
      (days[key] ??= []).push({
        id: row.id,
        student_id: row.student_id,
        student_name: studentName(row),
        scheduled_time: row.scheduled_time,
        duration_min: row.duration_min,
        status: row.status,
      });
    }
    return ok({
      week_start,
      week_end,
      days,
      slots: (slots.data ?? []).map((s) => ({
        id: s.id,
        student_id: s.student_id,
        student_name: studentName(s),
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        duration_min: s.duration_min,
      })),
    });
  },
});

const freeSlots = defineOp({
  operation: "schedule.free_slots",
  summary:
    "Find free windows of duration_min inside working hours across a date range, based on existing lessons only.",
  shape: {
    from: dateStr,
    to: dateStr,
    duration_min: durationSchema,
    work_start: timeStr.optional(),
    work_end: timeStr.optional(),
    step_min: z.number().int().min(5).max(120).optional(),
  },
  handler: async ({ from, to, duration_min, work_start, work_end, step_min }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const dayCount = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    if (dayCount > 31) return fail("Диапазон поиска окон — максимум 31 день.");
    const startMin = toMinutes(work_start ?? "09:00");
    const endMin = toMinutes(work_end ?? "21:00");
    if (endMin - startMin < duration_min) return fail("Рабочий интервал короче требуемого урока.");
    const step = step_min ?? 30;

    const { data, error } = await caller.supabase
      .from("lessons")
      .select("scheduled_date, scheduled_time, duration_min, status")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to);
    if (error) return dbError("schedule.free_slots", error);

    const busy = new Map<string, Array<[number, number]>>();
    for (const row of data ?? []) {
      const key = String(row.scheduled_date);
      const list = busy.get(key) ?? [];
      list.push([toMinutes(String(row.scheduled_time)), Number(row.duration_min ?? 60)]);
      busy.set(key, list);
    }

    const out: Array<{ date: string; free: string[] }> = [];
    for (let i = 0; i < dayCount; i += 1) {
      const date = addDaysIso(from, i);
      const taken = busy.get(date) ?? [];
      const free: string[] = [];
      for (let t = startMin; t + duration_min <= endMin; t += step) {
        if (!taken.some(([s, d]) => overlaps(t, duration_min, s, d))) free.push(fromMinutes(t));
      }
      out.push({ date, free });
    }
    return ok({
      from,
      to,
      duration_min,
      work_start: fromMinutes(startMin),
      work_end: fromMinutes(endMin),
      step_min: step,
      days: out,
    });
  },
});

const scheduleConflicts = defineOp({
  operation: "schedule.conflicts",
  summary: "List pairs of non-cancelled lessons whose times overlap inside a date range.",
  shape: { from: dateStr, to: dateStr },
  handler: async ({ from, to }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const { data, error } = await caller.supabase
      .from("lessons")
      .select(
        "id, student_id, scheduled_date, scheduled_time, duration_min, status, students(name)",
      )
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date")
      .order("scheduled_time");
    if (error) return dbError("schedule.conflicts", error);

    const byDate = new Map<string, typeof data>();
    for (const row of data ?? []) {
      const key = String(row.scheduled_date);
      byDate.set(key, [...(byDate.get(key) ?? []), row]);
    }
    const conflicts: unknown[] = [];
    for (const [date, rows] of byDate) {
      for (let i = 0; i < (rows?.length ?? 0); i += 1) {
        for (let j = i + 1; j < (rows?.length ?? 0); j += 1) {
          const a = rows![i]!;
          const b = rows![j]!;
          if (
            overlaps(
              toMinutes(String(a.scheduled_time)),
              Number(a.duration_min ?? 60),
              toMinutes(String(b.scheduled_time)),
              Number(b.duration_min ?? 60),
            )
          ) {
            conflicts.push({
              date,
              a: { id: a.id, student_name: studentName(a), time: a.scheduled_time },
              b: { id: b.id, student_name: studentName(b), time: b.scheduled_time },
            });
          }
        }
      }
    }
    return ok({ from, to, conflict_count: conflicts.length, conflicts });
  },
});

const lessonsStats = defineOp({
  operation: "lessons.stats",
  summary: "Aggregate lessons in a period by status and by student.",
  shape: { from: dateStr, to: dateStr, student_id: uuid.optional() },
  handler: async ({ from, to, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    let q = caller.supabase
      .from("lessons")
      .select("student_id, status, duration_min, students(name)")
      .is("deleted_at", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to);
    if (student_id) q = q.eq("student_id", student_id);
    const { data, error } = await q;
    if (error) return dbError("lessons.stats", error);

    const byStatus: Counter = {};
    const perStudent = new Map<
      string,
      {
        student_id: string;
        name: string | null;
        total: number;
        by_status: Counter;
        minutes: number;
      }
    >();
    for (const row of data ?? []) {
      bump(byStatus, String(row.status));
      const id = String(row.student_id);
      const entry = perStudent.get(id) ?? {
        student_id: id,
        name: studentName(row),
        total: 0,
        by_status: {},
        minutes: 0,
      };
      entry.total += 1;
      bump(entry.by_status, String(row.status));
      if (row.status === "completed") entry.minutes += Number(row.duration_min ?? 0);
      perStudent.set(id, entry);
    }
    return ok({
      from,
      to,
      total: data?.length ?? 0,
      by_status: byStatus,
      by_student: [...perStudent.values()],
    });
  },
});

const attendanceStats = defineOp({
  operation: "attendance.stats",
  summary:
    "Attendance counts per status and per student for a period, with attendance percentage (present ÷ present+absent).",
  shape: { from: dateStr, to: dateStr, student_id: uuid.optional() },
  handler: async ({ from, to, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    let q = caller.supabase
      .from("attendance")
      .select("student_id, status, students(name)")
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", to);
    if (student_id) q = q.eq("student_id", student_id);
    const { data, error } = await q;
    if (error) return dbError("attendance.stats", error);

    const byStatus: Counter = {};
    const perStudent = new Map<
      string,
      { student_id: string; name: string | null; by_status: Counter; total: number }
    >();
    for (const row of data ?? []) {
      bump(byStatus, String(row.status));
      const id = String(row.student_id);
      const entry = perStudent.get(id) ?? {
        student_id: id,
        name: studentName(row),
        by_status: {},
        total: 0,
      };
      entry.total += 1;
      bump(entry.by_status, String(row.status));
      perStudent.set(id, entry);
    }
    const pct = (c: Counter) => {
      const base = (c["present"] ?? 0) + (c["absent"] ?? 0);
      return base === 0 ? null : Math.round(((c["present"] ?? 0) / base) * 100);
    };
    return ok({
      from,
      to,
      total: data?.length ?? 0,
      by_status: byStatus,
      attendance_percent: pct(byStatus),
      by_student: [...perStudent.values()].map((e) => ({
        ...e,
        attendance_percent: pct(e.by_status),
      })),
    });
  },
});

const financePeriodSummary = defineOp({
  operation: "finance.period_summary",
  summary:
    "Money for a period: paid totals are matched on pay_date, unpaid totals on created_at (unpaid rows have no pay_date).",
  shape: { from: dateStr, to: dateStr, student_id: uuid.optional() },
  handler: async ({ from, to, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const base = () => {
      let q = caller.supabase
        .from("finance")
        .select("id, student_id, amount, currency, is_paid, pay_date, created_at")
        .is("deleted_at", null);
      if (student_id) q = q.eq("student_id", student_id);
      return q;
    };
    const [paidRes, unpaidRes] = await Promise.all([
      base().eq("is_paid", true).gte("pay_date", from).lte("pay_date", to),
      base()
        .eq("is_paid", false)
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`),
    ]);
    const anyError = paidRes.error ?? unpaidRes.error;
    if (anyError) return dbError("finance.period_summary", anyError);

    const sum = (rows: Array<{ amount: unknown; currency: unknown }> | null) => {
      const out: Counter = {};
      for (const r of rows ?? []) bump(out, String(r.currency), Number(r.amount ?? 0));
      return out;
    };
    return ok({
      from,
      to,
      basis: {
        paid: "finance.pay_date within [from, to]",
        unpaid: "finance.created_at within [from, to] (unpaid rows have no pay_date)",
      },
      paid_totals: sum(paidRes.data),
      unpaid_totals: sum(unpaidRes.data),
      paid_count: paidRes.data?.length ?? 0,
      unpaid_count: unpaidRes.data?.length ?? 0,
    });
  },
});

const studentBalance = defineOp({
  operation: "finance.student_balance",
  summary: "Per-currency paid / unpaid totals and outstanding balance for one student.",
  shape: { student_id: uuid },
  handler: async ({ student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("finance")
      .select("id, amount, currency, is_paid, pay_date, created_at")
      .is("deleted_at", null)
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return dbError("finance.student_balance", error);
    const paid: Counter = {};
    const unpaid: Counter = {};
    for (const row of data ?? []) {
      bump(row.is_paid ? paid : unpaid, String(row.currency), Number(row.amount ?? 0));
    }
    const currencies = [...new Set([...Object.keys(paid), ...Object.keys(unpaid)])];
    return ok({
      student_id,
      paid_totals: paid,
      unpaid_totals: unpaid,
      outstanding_by_currency: Object.fromEntries(currencies.map((c) => [c, unpaid[c] ?? 0])),
      entries: data ?? [],
    });
  },
});

const homeworkStats = defineOp({
  operation: "homework.stats",
  summary: "Homework counts by status and by student, plus how many open tasks are overdue.",
  shape: { from: dateStr.optional(), to: dateStr.optional(), student_id: uuid.optional() },
  handler: async ({ from, to, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (from && to && !validRange(from, to)) {
      return fail("Некорректный диапазон дат (максимум 1 год).");
    }
    let q = caller.supabase
      .from("homework")
      .select("id, student_id, status, due_date, assigned_date, students(name)")
      .is("deleted_at", null)
      .limit(200);
    if (student_id) q = q.eq("student_id", student_id);
    if (from) q = q.gte("assigned_date", from);
    if (to) q = q.lte("assigned_date", to);
    const { data, error } = await q;
    if (error) return dbError("homework.stats", error);

    const day = todayIso();
    const byStatus: Counter = {};
    const perStudent = new Map<
      string,
      { student_id: string; name: string | null; by_status: Counter; overdue: number }
    >();
    let overdue = 0;
    for (const row of data ?? []) {
      const status = String(row.status);
      bump(byStatus, status);
      const id = String(row.student_id);
      const entry = perStudent.get(id) ?? {
        student_id: id,
        name: studentName(row),
        by_status: {},
        overdue: 0,
      };
      bump(entry.by_status, status);
      const isOverdue =
        (OPEN_HOMEWORK as readonly string[]).includes(status) &&
        Boolean(row.due_date) &&
        String(row.due_date) < day;
      if (isOverdue) {
        overdue += 1;
        entry.overdue += 1;
      }
      perStudent.set(id, entry);
    }
    return ok({
      total: data?.length ?? 0,
      by_status: byStatus,
      overdue_count: overdue,
      by_student: [...perStudent.values()],
    });
  },
});

const dashboardSummary = defineOp({
  operation: "dashboard.summary",
  summary:
    "One snapshot: active students, today's and upcoming lessons, unpaid totals, overdue homework and recent attendance.",
  shape: { upcoming_days: z.number().int().min(1).max(30).optional() },
  handler: async ({ upcoming_days }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const day = todayIso();
    const horizon = addDaysIso(day, upcoming_days ?? 7);
    const attendanceFrom = addDaysIso(day, -30);

    const [students, todayLessons, upcoming, finance, homework, attendance] = await Promise.all([
      supabase.from("students").select("id, status").is("deleted_at", null),
      supabase
        .from("lessons")
        .select("id, student_id, scheduled_time, status, students(name)")
        .is("deleted_at", null)
        .eq("scheduled_date", day)
        .order("scheduled_time"),
      supabase
        .from("lessons")
        .select("id, scheduled_date, status")
        .is("deleted_at", null)
        .gt("scheduled_date", day)
        .lte("scheduled_date", horizon),
      supabase
        .from("finance")
        .select("amount, currency")
        .is("deleted_at", null)
        .eq("is_paid", false)
        .limit(200),
      supabase
        .from("homework")
        .select("id, due_date, status")
        .is("deleted_at", null)
        .in("status", [...OPEN_HOMEWORK])
        .limit(200),
      supabase
        .from("attendance")
        .select("status")
        .is("deleted_at", null)
        .gte("date", attendanceFrom)
        .lte("date", day),
    ]);
    const anyError =
      students.error ??
      todayLessons.error ??
      upcoming.error ??
      finance.error ??
      homework.error ??
      attendance.error;
    if (anyError) return dbError("dashboard.summary", anyError);

    const byStatus: Counter = {};
    for (const s of students.data ?? []) bump(byStatus, String(s.status));
    const unpaid: Counter = {};
    for (const f of finance.data ?? []) bump(unpaid, String(f.currency), Number(f.amount ?? 0));
    const attendanceCounts: Counter = {};
    for (const a of attendance.data ?? []) bump(attendanceCounts, String(a.status));
    const attBase = (attendanceCounts["present"] ?? 0) + (attendanceCounts["absent"] ?? 0);

    return ok({
      date: day,
      students: { total: students.data?.length ?? 0, by_status: byStatus },
      today_lessons: todayLessons.data ?? [],
      upcoming: { until: horizon, count: upcoming.data?.length ?? 0 },
      unpaid_totals: unpaid,
      homework: {
        open: homework.data?.length ?? 0,
        overdue: (homework.data ?? []).filter((h) => h.due_date && String(h.due_date) < day).length,
      },
      attendance_last_30_days: {
        by_status: attendanceCounts,
        attendance_percent:
          attBase === 0 ? null : Math.round(((attendanceCounts["present"] ?? 0) / attBase) * 100),
      },
    });
  },
});

const studentReport = defineOp({
  operation: "reports.student_summary",
  summary: "One student over a period: lessons, attendance, finance and homework in a single read.",
  shape: { student_id: uuid, from: dateStr, to: dateStr },
  handler: async ({ student_id, from, to }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const { supabase } = caller;
    const { data: student, error } = await supabase
      .from("students")
      .select(STUDENT_COLUMNS)
      .eq("id", student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("reports.student_summary", error);
    if (!student) return fail("Ученик не найден.");

    const [lessons, attendance, finance, homework] = await Promise.all([
      supabase
        .from("lessons")
        .select("id, scheduled_date, scheduled_time, status")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to),
      supabase
        .from("attendance")
        .select("status")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("finance")
        .select("id, amount, currency, is_paid, pay_date, created_at")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .limit(200),
      supabase
        .from("homework")
        .select("id, task, status, assigned_date, due_date")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .gte("assigned_date", from)
        .lte("assigned_date", to),
    ]);
    const anyError = lessons.error ?? attendance.error ?? finance.error ?? homework.error;
    if (anyError) return dbError("reports.student_summary", anyError);

    const lessonStatus: Counter = {};
    for (const l of lessons.data ?? []) bump(lessonStatus, String(l.status));
    const attStatus: Counter = {};
    for (const a of attendance.data ?? []) bump(attStatus, String(a.status));
    const paid: Counter = {};
    const unpaid: Counter = {};
    for (const f of finance.data ?? []) {
      bump(f.is_paid ? paid : unpaid, String(f.currency), Number(f.amount ?? 0));
    }
    const hwStatus: Counter = {};
    for (const h of homework.data ?? []) bump(hwStatus, String(h.status));
    const base = (attStatus["present"] ?? 0) + (attStatus["absent"] ?? 0);

    return ok({
      from,
      to,
      student,
      lessons: { total: lessons.data?.length ?? 0, by_status: lessonStatus },
      attendance: {
        by_status: attStatus,
        attendance_percent:
          base === 0 ? null : Math.round(((attStatus["present"] ?? 0) / base) * 100),
      },
      finance: { paid_totals: paid, unpaid_totals: unpaid },
      homework: {
        total: homework.data?.length ?? 0,
        by_status: hwStatus,
        items: homework.data ?? [],
      },
    });
  },
});

const globalSearch = defineOp({
  operation: "search.global",
  summary:
    "Search across students, lessons (by notes), homework (by task) and finance (by currency); returns type/id/summary rows owned by the caller only.",
  shape: { query: searchTermSchema, limit: limitSchema.optional() },
  handler: async ({ query, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const term = sanitizeSearch(query);
    if (!term) return fail("Пустой поисковый запрос.");
    const cap = Math.min(limit ?? 20, 50);
    const { supabase } = caller;

    const [students, lessons, homework, finance] = await Promise.all([
      supabase
        .from("students")
        .select("id, name, subject, status")
        .is("deleted_at", null)
        .or(`name.ilike.%${term}%,subject.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(cap),
      supabase
        .from("lessons")
        .select("id, scheduled_date, scheduled_time, status, notes, students(name)")
        .is("deleted_at", null)
        .ilike("notes", `%${term}%`)
        .limit(cap),
      supabase
        .from("homework")
        .select("id, task, status, due_date, students(name)")
        .is("deleted_at", null)
        .ilike("task", `%${term}%`)
        .limit(cap),
      supabase
        .from("finance")
        .select("id, amount, currency, is_paid, pay_date, students(name)")
        .is("deleted_at", null)
        .ilike("currency", `%${term}%`)
        .limit(cap),
    ]);
    const anyError = students.error ?? lessons.error ?? homework.error ?? finance.error;
    if (anyError) return dbError("search.global", anyError);

    const results = [
      ...(students.data ?? []).map((r) => ({
        type: "student",
        id: r.id,
        summary: `${r.name}${r.subject ? ` — ${r.subject}` : ""} (${r.status})`,
      })),
      ...(lessons.data ?? []).map((r) => ({
        type: "lesson",
        id: r.id,
        summary: `${studentName(r) ?? "—"} ${r.scheduled_date} ${String(r.scheduled_time).slice(0, 5)} (${r.status})`,
      })),
      ...(homework.data ?? []).map((r) => ({
        type: "homework",
        id: r.id,
        summary: `${studentName(r) ?? "—"}: ${String(r.task).slice(0, 120)} (${r.status})`,
      })),
      ...(finance.data ?? []).map((r) => ({
        type: "finance",
        id: r.id,
        summary: `${studentName(r) ?? "—"}: ${r.amount} ${r.currency} ${r.is_paid ? "оплачено" : "не оплачено"}`,
      })),
    ].slice(0, cap);

    return ok({ query: term, count: results.length, results });
  },
});

const getTrashRecord = defineOp({
  operation: "trash.get",
  summary: "Get one soft-deleted record from trash by table and id.",
  shape: { table: z.enum(DELETABLE_TABLES), record_id: uuid },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from(table)
      .select(TRASH_COLUMNS[table])
      .eq("id", record_id)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (error) return dbError("trash.get", error);
    if (!data) return fail("Запись в корзине не найдена.");
    return ok({ table, record: data });
  },
});

export const ANALYTICS_QUERY_OPS: readonly Op[] = [
  searchStudents,
  studentsSummary,
  scheduleWeek,
  freeSlots,
  scheduleConflicts,
  lessonsStats,
  attendanceStats,
  financePeriodSummary,
  studentBalance,
  homeworkStats,
  dashboardSummary,
  studentReport,
  globalSearch,
  getTrashRecord,
];

export { studentReport, studentBalance, dashboardSummary };

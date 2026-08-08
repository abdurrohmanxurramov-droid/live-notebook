import { z } from "zod";
import { dbError, fail, isToolResult, ok, requireCaller } from "../supabase";
import {
  LESSON_STATUSES,
  STUDENT_STATUSES,
  addDaysIso,
  dateStr,
  dayOfWeekSchema,
  durationSchema,
  fromMinutes,
  limitSchema,
  offsetSchema,
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
const LESSON_COLUMNS =
  "id, student_id, scheduled_date, scheduled_time, duration_min, status, notes";
const FINANCE_COLUMNS =
  "id, student_id, amount, currency, is_paid, pay_date, entry_type, cycle_number, created_at";

const OPEN_HOMEWORK = ["assigned", "partial", "not_done"] as const;

type Totals = Record<string, number>;

function addTo(map: Totals, key: string, value: number) {
  map[key] = Math.round(((map[key] ?? 0) + value) * 100) / 100;
}

function page(limit: number | undefined, offset: number | undefined) {
  const take = limit ?? 50;
  const skip = offset ?? 0;
  return { take, skip, range: [skip, skip + take - 1] as const };
}

/* ------------------------------------------------------- paginated reads */

const studentsPage = defineOp({
  operation: "students.page",
  summary:
    "Paginated student list with optional status filter and free-text search; returns total_count, limit, offset and has_more.",
  shape: {
    status: z.enum(STUDENT_STATUSES).optional(),
    query: searchTermSchema.optional(),
    limit: limitSchema.optional(),
    offset: offsetSchema.optional(),
  },
  handler: async ({ status, query, limit, offset }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { take, skip, range } = page(limit, offset);
    let q = caller.supabase
      .from("students")
      .select(STUDENT_COLUMNS, { count: "exact" })
      .is("deleted_at", null)
      .order("name")
      .range(range[0], range[1]);
    if (status) q = q.eq("status", status);
    if (query) {
      const term = sanitizeSearch(query);
      if (!term) return fail("Пустой поисковый запрос.");
      q = q.or(`name.ilike.%${term}%,subject.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    const { data, error, count } = await q;
    if (error) return dbError("students.page", error);
    const total = count ?? 0;
    return ok({
      students: data ?? [],
      total_count: total,
      limit: take,
      offset: skip,
      has_more: skip + (data?.length ?? 0) < total,
    });
  },
});

const lessonsPage = defineOp({
  operation: "lessons.page",
  summary:
    "Paginated lessons inside a date range (max 1 year) with optional student/status filters; returns total_count and has_more.",
  shape: {
    from: dateStr,
    to: dateStr,
    student_id: uuid.optional(),
    status: z.enum(LESSON_STATUSES).optional(),
    limit: limitSchema.optional(),
    offset: offsetSchema.optional(),
  },
  handler: async ({ from, to, student_id, status, limit, offset }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const { take, skip, range } = page(limit, offset);
    let q = caller.supabase
      .from("lessons")
      .select(`${LESSON_COLUMNS}, students(name)`, { count: "exact" })
      .is("deleted_at", null)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date")
      .order("scheduled_time")
      .range(range[0], range[1]);
    if (student_id) q = q.eq("student_id", student_id);
    if (status) q = q.eq("status", status);
    const { data, error, count } = await q;
    if (error) return dbError("lessons.page", error);
    const total = count ?? 0;
    return ok({
      from,
      to,
      lessons: data ?? [],
      total_count: total,
      limit: take,
      offset: skip,
      has_more: skip + (data?.length ?? 0) < total,
    });
  },
});

const financePage = defineOp({
  operation: "finance.page",
  summary:
    "Paginated finance records with optional student, paid state, entry type and created-at date range; returns total_count and has_more.",
  shape: {
    student_id: uuid.optional(),
    is_paid: z.boolean().optional(),
    entry_type: z.string().trim().min(1).max(40).optional(),
    from: dateStr.optional(),
    to: dateStr.optional(),
    limit: limitSchema.optional(),
    offset: offsetSchema.optional(),
  },
  handler: async ({ student_id, is_paid, entry_type, from, to, limit, offset }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (from && to && !validRange(from, to)) {
      return fail("Некорректный диапазон дат (максимум 1 год).");
    }
    const { take, skip, range } = page(limit, offset);
    let q = caller.supabase
      .from("finance")
      .select(`${FINANCE_COLUMNS}, students(name)`, { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(range[0], range[1]);
    if (student_id) q = q.eq("student_id", student_id);
    if (is_paid !== undefined) q = q.eq("is_paid", is_paid);
    if (entry_type) q = q.eq("entry_type", entry_type);
    if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
    if (to) q = q.lte("created_at", `${to}T23:59:59Z`);
    const { data, error, count } = await q;
    if (error) return dbError("finance.page", error);
    const total = count ?? 0;
    return ok({
      records: data ?? [],
      total_count: total,
      limit: take,
      offset: skip,
      has_more: skip + (data?.length ?? 0) < total,
    });
  },
});

/* ------------------------------------------------- intelligent scheduling */

const suggestSlot = defineOp({
  operation: "schedule.suggest_slot",
  summary:
    "Suggest the best free windows for a lesson: scans a date range, respects working hours, avoids conflicts and ranks options that sit next to existing lessons (fewer gaps) and match the student's usual weekdays.",
  shape: {
    duration_min: durationSchema,
    from: dateStr.optional(),
    to: dateStr.optional(),
    student_id: uuid.optional(),
    days_of_week: z.array(dayOfWeekSchema).min(1).max(7).optional(),
    work_start: timeStr.optional(),
    work_end: timeStr.optional(),
    step_min: z.number().int().min(5).max(120).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const from = input.from ?? todayIso();
    const to = input.to ?? addDaysIso(from, 13);
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const dayCount = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    if (dayCount > 31) return fail("Диапазон поиска окон — максимум 31 день.");
    const startMin = toMinutes(input.work_start ?? "09:00");
    const endMin = toMinutes(input.work_end ?? "21:00");
    if (endMin - startMin < input.duration_min) {
      return fail("Рабочий интервал короче требуемого урока.");
    }
    const step = input.step_min ?? 30;

    const [{ data: lessons, error }, slotsRes] = await Promise.all([
      supabase
        .from("lessons")
        .select("student_id, scheduled_date, scheduled_time, duration_min")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to),
      input.student_id
        ? supabase
            .from("schedule_slots")
            .select("day_of_week, start_time")
            .is("deleted_at", null)
            .eq("student_id", input.student_id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (error) return dbError("schedule.suggest_slot", error);
    if (slotsRes.error) return dbError("schedule.suggest_slot", slotsRes.error);

    const busy = new Map<string, Array<[number, number]>>();
    for (const row of lessons ?? []) {
      const key = String(row.scheduled_date);
      busy.set(key, [
        ...(busy.get(key) ?? []),
        [toMinutes(String(row.scheduled_time)), Number(row.duration_min ?? 60)],
      ]);
    }
    const preferredDays = new Set(
      input.days_of_week ?? (slotsRes.data ?? []).map((s) => Number(s.day_of_week)),
    );
    const preferredTimes = new Set(
      (slotsRes.data ?? []).map((s) => toMinutes(String(s.start_time))),
    );

    type Suggestion = {
      date: string;
      time: string;
      day_of_week: number;
      score: number;
      reasons: string[];
    };
    const suggestions: Suggestion[] = [];
    for (let i = 0; i < dayCount; i += 1) {
      const date = addDaysIso(from, i);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (input.days_of_week && !preferredDays.has(dow)) continue;
      const taken = busy.get(date) ?? [];
      for (let t = startMin; t + input.duration_min <= endMin; t += step) {
        if (taken.some(([s, d]) => overlaps(t, input.duration_min, s, d))) continue;
        const reasons: string[] = [];
        let score = 100 - i * 2;
        if (preferredDays.size && preferredDays.has(dow)) {
          score += 25;
          reasons.push("обычный день ученика");
        }
        if (preferredTimes.has(t)) {
          score += 15;
          reasons.push("привычное время");
        }
        const adjacent = taken.some(([s, d]) => s + d === t || t + input.duration_min === s);
        if (adjacent) {
          score += 20;
          reasons.push("вплотную к другому уроку — без окна");
        }
        if (t >= toMinutes("12:00") && t <= toMinutes("19:00")) {
          score += 5;
          reasons.push("удобное время дня");
        }
        suggestions.push({ date, time: fromMinutes(t), day_of_week: dow, score, reasons });
      }
    }
    suggestions.sort(
      (a, b) =>
        b.score - a.score ||
        (a.date === b.date ? (a.time < b.time ? -1 : 1) : a.date < b.date ? -1 : 1),
    );
    const take = input.limit ?? 10;
    return ok({
      from,
      to,
      duration_min: input.duration_min,
      work_start: fromMinutes(startMin),
      work_end: fromMinutes(endMin),
      considered: suggestions.length,
      suggestions: suggestions.slice(0, take),
      next_step: 'Чтобы поставить урок, вызовите mutate "lesson.create" с выбранными date и time.',
    });
  },
});

const checkAvailability = defineOp({
  operation: "schedule.check_availability",
  summary:
    "Check whether a specific date/time window is free, and (with student_id) whether that student is available then. Read-only conflict check before creating or moving a lesson.",
  shape: {
    date: dateStr,
    time: timeStr,
    duration_min: durationSchema,
    student_id: uuid.optional(),
    exclude_lesson_id: uuid.optional(),
  },
  handler: async ({ date, time, duration_min, student_id, exclude_lesson_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("lessons")
      .select("id, student_id, scheduled_time, duration_min, status, students(name)")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("scheduled_date", date)
      .order("scheduled_time");
    if (error) return dbError("schedule.check_availability", error);

    const start = toMinutes(time);
    if (start + duration_min > 24 * 60) return fail("Урок выходит за пределы суток.");
    const rows = (data ?? []).filter((r) => String(r.id) !== exclude_lesson_id);
    const conflicts = rows
      .filter((r) =>
        overlaps(
          start,
          duration_min,
          toMinutes(String(r.scheduled_time)),
          Number(r.duration_min ?? 60),
        ),
      )
      .map((r) => ({
        lesson_id: String(r.id),
        student_id: String(r.student_id),
        student_name: (r.students as { name?: string } | null)?.name ?? null,
        time: r.scheduled_time,
        duration_min: r.duration_min,
        status: r.status,
      }));

    const studentConflicts = student_id ? conflicts.filter((c) => c.student_id === student_id) : [];
    const studentBusyElsewhere = student_id
      ? rows.filter((r) => String(r.student_id) === student_id).length
      : 0;

    return ok({
      date,
      time,
      duration_min,
      available: conflicts.length === 0,
      student_available: student_id ? studentConflicts.length === 0 : null,
      student_lessons_that_day: student_id ? studentBusyElsewhere : null,
      conflicts,
    });
  },
});

/* --------------------------------------------------- finance analytics */

const financeOverdue = defineOp({
  operation: "finance.overdue",
  summary:
    "Debt / overdue summary: unpaid records older than a threshold, grouped by student with aging buckets (0-7, 8-30, 31+ days) and totals per currency.",
  shape: {
    as_of: dateStr.optional(),
    min_days: z.number().int().min(0).max(365).optional(),
    currency: z.string().trim().length(3).optional(),
    limit: limitSchema.optional(),
  },
  handler: async ({ as_of, min_days, currency, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const asOf = as_of ?? todayIso();
    const threshold = min_days ?? 0;
    let q = caller.supabase
      .from("finance")
      .select("id, student_id, amount, currency, created_at, entry_type, students(name)")
      .is("deleted_at", null)
      .eq("is_paid", false)
      .order("created_at")
      .limit(1000);
    if (currency) q = q.eq("currency", currency.toUpperCase());
    const { data, error } = await q;
    if (error) return dbError("finance.overdue", error);

    const asOfMs = Date.parse(`${asOf}T23:59:59Z`);
    const perStudent = new Map<
      string,
      {
        student_id: string;
        student_name: string | null;
        totals: Totals;
        buckets: { d0_7: Totals; d8_30: Totals; d31_plus: Totals };
        oldest_days: number;
        records: number;
      }
    >();
    const grand: Totals = {};

    for (const row of data ?? []) {
      const days = Math.max(
        0,
        Math.floor((asOfMs - Date.parse(String(row.created_at))) / 86_400_000),
      );
      if (days < threshold) continue;
      const id = String(row.student_id);
      const entry = perStudent.get(id) ?? {
        student_id: id,
        student_name: (row.students as { name?: string } | null)?.name ?? null,
        totals: {} as Totals,
        buckets: { d0_7: {} as Totals, d8_30: {} as Totals, d31_plus: {} as Totals },
        oldest_days: 0,
        records: 0,
      };
      const cur = String(row.currency ?? "RUB");
      const value = Number(row.amount ?? 0);
      addTo(entry.totals, cur, value);
      addTo(grand, cur, value);
      const bucket =
        days <= 7 ? entry.buckets.d0_7 : days <= 30 ? entry.buckets.d8_30 : entry.buckets.d31_plus;
      addTo(bucket, cur, value);
      entry.oldest_days = Math.max(entry.oldest_days, days);
      entry.records += 1;
      perStudent.set(id, entry);
    }

    const students = [...perStudent.values()].sort((a, b) => b.oldest_days - a.oldest_days);
    return ok({
      as_of: asOf,
      min_days: threshold,
      student_count: students.length,
      outstanding_totals: grand,
      students: students.slice(0, limit ?? 100),
    });
  },
});

const financeCashflow = defineOp({
  operation: "finance.cashflow",
  summary:
    "Cash-flow over a period bucketed by day, week or month: paid vs unpaid amounts per currency, plus period totals.",
  shape: {
    from: dateStr,
    to: dateStr,
    granularity: z.enum(["day", "week", "month"]).optional(),
    student_id: uuid.optional(),
  },
  handler: async ({ from, to, granularity, student_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!validRange(from, to)) return fail("Некорректный диапазон дат (максимум 1 год).");
    const grain = granularity ?? "month";
    let q = caller.supabase
      .from("finance")
      .select("amount, currency, is_paid, pay_date, created_at")
      .is("deleted_at", null)
      .gte("created_at", `${from}T00:00:00Z`)
      .lte("created_at", `${to}T23:59:59Z`)
      .order("created_at")
      .limit(2000);
    if (student_id) q = q.eq("student_id", student_id);
    const { data, error } = await q;
    if (error) return dbError("finance.cashflow", error);

    function bucketKey(iso: string): string {
      const date = iso.slice(0, 10);
      if (grain === "day") return date;
      if (grain === "month") return date.slice(0, 7);
      const d = new Date(`${date}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7; // Monday-based week
      d.setUTCDate(d.getUTCDate() - dow);
      return d.toISOString().slice(0, 10);
    }

    const buckets = new Map<string, { paid: Totals; unpaid: Totals; records: number }>();
    const paidTotals: Totals = {};
    const unpaidTotals: Totals = {};
    for (const row of data ?? []) {
      const source = row.is_paid ? (row.pay_date ?? row.created_at) : row.created_at;
      const key = bucketKey(String(source));
      const entry = buckets.get(key) ?? { paid: {}, unpaid: {}, records: 0 };
      const cur = String(row.currency ?? "RUB");
      const value = Number(row.amount ?? 0);
      if (row.is_paid) {
        addTo(entry.paid, cur, value);
        addTo(paidTotals, cur, value);
      } else {
        addTo(entry.unpaid, cur, value);
        addTo(unpaidTotals, cur, value);
      }
      entry.records += 1;
      buckets.set(key, entry);
    }

    return ok({
      from,
      to,
      granularity: grain,
      paid_totals: paidTotals,
      unpaid_totals: unpaidTotals,
      buckets: [...buckets.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([bucket, value]) => ({ bucket, ...value })),
    });
  },
});

const paymentHistory = defineOp({
  operation: "finance.student_payment_history",
  summary:
    "Chronological payment history for one student: paid and unpaid records, running totals per currency, last payment date and average payment.",
  shape: { student_id: uuid, limit: limitSchema.optional(), offset: offsetSchema.optional() },
  handler: async ({ student_id, limit, offset }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { take, skip, range } = page(limit, offset);
    const { data, error, count } = await caller.supabase
      .from("finance")
      .select(FINANCE_COLUMNS, { count: "exact" })
      .is("deleted_at", null)
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .range(range[0], range[1]);
    if (error) return dbError("finance.student_payment_history", error);

    const paidTotals: Totals = {};
    const unpaidTotals: Totals = {};
    let lastPayment: string | null = null;
    let paidCount = 0;
    for (const row of data ?? []) {
      const cur = String(row.currency ?? "RUB");
      const value = Number(row.amount ?? 0);
      if (row.is_paid) {
        addTo(paidTotals, cur, value);
        paidCount += 1;
        const when = String(row.pay_date ?? row.created_at).slice(0, 10);
        if (!lastPayment || when > lastPayment) lastPayment = when;
      } else {
        addTo(unpaidTotals, cur, value);
      }
    }
    const averages: Totals = {};
    for (const [cur, total] of Object.entries(paidTotals)) {
      averages[cur] = paidCount ? Math.round((total / paidCount) * 100) / 100 : 0;
    }
    const total = count ?? 0;
    return ok({
      student_id,
      records: data ?? [],
      paid_totals: paidTotals,
      unpaid_totals: unpaidTotals,
      paid_count: paidCount,
      average_payment: averages,
      last_payment_date: lastPayment,
      total_count: total,
      limit: take,
      offset: skip,
      has_more: skip + (data?.length ?? 0) < total,
    });
  },
});

/* ---------------------------------------------------- student insights */

const studentInsights = defineOp({
  operation: "students.insights",
  summary:
    "One read bundle per student: activity (last/next lesson), attendance rate, outstanding debt, open homework and a short list of flags an assistant should mention.",
  shape: { student_id: uuid, days: z.number().int().min(7).max(365).optional() },
  handler: async ({ student_id, days }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const today = todayIso();
    const window = days ?? 30;
    const since = addDaysIso(today, -window);

    const [studentRes, pastRes, nextRes, attendanceRes, financeRes, homeworkRes] =
      await Promise.all([
        supabase
          .from("students")
          .select(STUDENT_COLUMNS)
          .eq("id", student_id)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("lessons")
          .select("id, scheduled_date, scheduled_time, status")
          .is("deleted_at", null)
          .eq("student_id", student_id)
          .lte("scheduled_date", today)
          .gte("scheduled_date", since)
          .order("scheduled_date", { ascending: false })
          .limit(200),
        supabase
          .from("lessons")
          .select("id, scheduled_date, scheduled_time, duration_min, status")
          .is("deleted_at", null)
          .eq("student_id", student_id)
          .gte("scheduled_date", today)
          .in("status", ["planned", "moved"])
          .order("scheduled_date")
          .order("scheduled_time")
          .limit(1),
        supabase
          .from("attendance")
          .select("status, date")
          .is("deleted_at", null)
          .eq("student_id", student_id)
          .gte("date", since)
          .lte("date", today)
          .limit(500),
        supabase
          .from("finance")
          .select("amount, currency, is_paid, pay_date, created_at")
          .is("deleted_at", null)
          .eq("student_id", student_id)
          .limit(500),
        supabase
          .from("homework")
          .select("id, task, status, due_date")
          .is("deleted_at", null)
          .eq("student_id", student_id)
          .in("status", [...OPEN_HOMEWORK])
          .order("due_date")
          .limit(50),
      ]);
    if (studentRes.error) return dbError("students.insights", studentRes.error);
    if (!studentRes.data) return fail("Ученик не найден.");
    const anyError =
      pastRes.error ??
      nextRes.error ??
      attendanceRes.error ??
      financeRes.error ??
      homeworkRes.error;
    if (anyError) return dbError("students.insights", anyError);

    const lessonsByStatus: Record<string, number> = {};
    for (const row of pastRes.data ?? []) {
      const key = String(row.status);
      lessonsByStatus[key] = (lessonsByStatus[key] ?? 0) + 1;
    }
    const lastCompleted = (pastRes.data ?? []).find((r) => r.status === "completed") ?? null;

    const attendanceCounts: Record<string, number> = {};
    for (const row of attendanceRes.data ?? []) {
      const key = String(row.status);
      attendanceCounts[key] = (attendanceCounts[key] ?? 0) + 1;
    }
    const attendanceTotal = (attendanceRes.data ?? []).length;
    const presentRate = attendanceTotal
      ? Math.round(((attendanceCounts["present"] ?? 0) / attendanceTotal) * 100)
      : null;

    const unpaidTotals: Totals = {};
    const paidTotals: Totals = {};
    let lastPayment: string | null = null;
    for (const row of financeRes.data ?? []) {
      const cur = String(row.currency ?? "RUB");
      const value = Number(row.amount ?? 0);
      if (row.is_paid) {
        addTo(paidTotals, cur, value);
        const when = String(row.pay_date ?? row.created_at).slice(0, 10);
        if (!lastPayment || when > lastPayment) lastPayment = when;
      } else {
        addTo(unpaidTotals, cur, value);
      }
    }

    const nextLesson = (nextRes.data ?? [])[0] ?? null;
    const overdueHomework = (homeworkRes.data ?? []).filter(
      (h) => h.due_date && String(h.due_date) < today,
    );

    const flags: string[] = [];
    if (Object.keys(unpaidTotals).length) flags.push("есть задолженность");
    if (presentRate !== null && presentRate < 70) flags.push("низкая посещаемость");
    if (!nextLesson) flags.push("нет запланированных уроков");
    if (overdueHomework.length) flags.push("просроченное ДЗ");
    if (!lastCompleted) flags.push(`нет проведённых уроков за ${window} дн.`);

    return ok({
      student: studentRes.data,
      period: { from: since, to: today, days: window },
      activity: {
        lessons_by_status: lessonsByStatus,
        last_completed_lesson: lastCompleted,
        next_lesson: nextLesson,
      },
      attendance: {
        total: attendanceTotal,
        by_status: attendanceCounts,
        present_rate: presentRate,
      },
      finance: {
        unpaid_totals: unpaidTotals,
        paid_totals: paidTotals,
        last_payment_date: lastPayment,
      },
      homework: { open: homeworkRes.data ?? [], overdue_count: overdueHomework.length },
      flags,
    });
  },
});

const studentsAtRisk = defineOp({
  operation: "students.at_risk",
  summary:
    "Rank active students that need attention: unpaid balance, missed lessons, no upcoming lesson or no activity in the period. Read-only triage list.",
  shape: {
    days: z.number().int().min(7).max(180).optional(),
    limit: limitSchema.optional(),
  },
  handler: async ({ days, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const today = todayIso();
    const window = days ?? 30;
    const since = addDaysIso(today, -window);

    const [studentsRes, lessonsRes, financeRes, attendanceRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, name, status")
        .is("deleted_at", null)
        .in("status", ["active", "paused"]),
      supabase
        .from("lessons")
        .select("student_id, scheduled_date, status")
        .is("deleted_at", null)
        .gte("scheduled_date", since)
        .limit(3000),
      supabase
        .from("finance")
        .select("student_id, amount, currency, is_paid")
        .is("deleted_at", null)
        .eq("is_paid", false)
        .limit(1000),
      supabase
        .from("attendance")
        .select("student_id, status")
        .is("deleted_at", null)
        .gte("date", since)
        .lte("date", today)
        .limit(3000),
    ]);
    const anyError =
      studentsRes.error ?? lessonsRes.error ?? financeRes.error ?? attendanceRes.error;
    if (anyError) return dbError("students.at_risk", anyError);

    const debts = new Map<string, Totals>();
    for (const row of financeRes.data ?? []) {
      const id = String(row.student_id);
      const totals = debts.get(id) ?? {};
      addTo(totals, String(row.currency ?? "RUB"), Number(row.amount ?? 0));
      debts.set(id, totals);
    }
    const upcoming = new Set<string>();
    const completed = new Map<string, number>();
    for (const row of lessonsRes.data ?? []) {
      const id = String(row.student_id);
      if (
        String(row.scheduled_date) >= today &&
        ["planned", "moved"].includes(String(row.status))
      ) {
        upcoming.add(id);
      }
      if (row.status === "completed") completed.set(id, (completed.get(id) ?? 0) + 1);
    }
    const attend = new Map<string, { total: number; absent: number }>();
    for (const row of attendanceRes.data ?? []) {
      const id = String(row.student_id);
      const entry = attend.get(id) ?? { total: 0, absent: 0 };
      entry.total += 1;
      if (row.status === "absent") entry.absent += 1;
      attend.set(id, entry);
    }

    const rows = (studentsRes.data ?? []).map((s) => {
      const id = String(s.id);
      const debt = debts.get(id);
      const a = attend.get(id) ?? { total: 0, absent: 0 };
      const absentRate = a.total ? Math.round((a.absent / a.total) * 100) : 0;
      const reasons: string[] = [];
      let risk = 0;
      if (debt) {
        risk += 40;
        reasons.push("есть неоплаченные записи");
      }
      if (!upcoming.has(id)) {
        risk += 30;
        reasons.push("нет предстоящих уроков");
      }
      if (!completed.get(id)) {
        risk += 20;
        reasons.push(`нет проведённых уроков за ${window} дн.`);
      }
      if (absentRate >= 30) {
        risk += 25;
        reasons.push(`пропуски ${absentRate}%`);
      }
      return {
        student_id: id,
        student_name: s.name,
        status: s.status,
        risk_score: risk,
        unpaid_totals: debt ?? {},
        has_upcoming_lesson: upcoming.has(id),
        completed_lessons: completed.get(id) ?? 0,
        absent_rate: absentRate,
        reasons,
      };
    });

    const atRisk = rows.filter((r) => r.risk_score > 0).sort((a, b) => b.risk_score - a.risk_score);
    return ok({
      period: { from: since, to: today, days: window },
      considered: rows.length,
      at_risk_count: atRisk.length,
      students: atRisk.slice(0, limit ?? 20),
    });
  },
});

export const INSIGHT_QUERY_OPS: readonly Op[] = [
  studentsPage,
  lessonsPage,
  financePage,
  suggestSlot,
  checkAvailability,
  financeOverdue,
  financeCashflow,
  paymentHistory,
  studentInsights,
  studentsAtRisk,
];

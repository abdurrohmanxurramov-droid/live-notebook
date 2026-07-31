import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, fail, isToolResult, ok, requireCaller } from "../supabase";
import { dateStr, validRange } from "../schemas";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayLessons = defineTool({
  name: "today_lessons",
  title: "Today's lessons",
  description: "List the teacher's lessons for today (or a given date) with student names.",
  inputSchema: { date: dateStr.optional().describe("Defaults to today") },
  annotations: READ,
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
    if (error) return dbError("today_lessons", error);
    return ok({ date: day, lessons: data ?? [] });
  },
});

export const upcomingHomework = defineTool({
  name: "upcoming_homework",
  title: "Upcoming homework",
  description: "List homework that is still open and due within the next N days (default 7).",
  inputSchema: { days: z.number().int().min(1).max(60).optional() },
  annotations: READ,
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
    if (error) return dbError("upcoming_homework", error);
    return ok({ from, to, homework: data ?? [] });
  },
});

export const unpaidStudents = defineTool({
  name: "unpaid_students",
  title: "Students with unpaid balances",
  description: "Summarise students who currently have unpaid finance records.",
  inputSchema: {},
  annotations: READ,
  handler: async (_input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("finance")
      .select("student_id, amount, currency, students(name)")
      .is("deleted_at", null)
      .eq("is_paid", false)
      .limit(200);
    if (error) return dbError("unpaid_students", error);
    const map = new Map<string, { student_id: string; name: string | null; totals: Record<string, number> }>();
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

export const periodSummary = defineTool({
  name: "period_summary",
  title: "Period summary",
  description:
    "Aggregate counts for a date range: lessons by status, attendance by status, and paid/unpaid totals per currency.",
  inputSchema: { from: dateStr, to: dateStr },
  annotations: READ,
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
    if (anyError) return dbError("period_summary", anyError);

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

export default [todayLessons, upcomingHomework, unpaidStudents, periodSummary];

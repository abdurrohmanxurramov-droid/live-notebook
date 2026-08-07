import { z } from "zod";
import { dbError, fail, isToolResult, ok, requireCaller } from "../supabase";
import {
  LESSON_STATUSES,
  amountSchema,
  currencySchema,
  dateStr,
  overlaps,
  toMinutes,
  uuid,
} from "../schemas";
import { defineOp, type Op } from "../registry";
import { bulkLessonMove } from "./bulk";
import { dashboardSummary, studentBalance, studentReport } from "./analytics";

/** Move every matching lesson from one day to another; previews conflicts unless confirm=true. */
const rescheduleDay = defineOp({
  operation: "schedule.reschedule_day",
  summary:
    "Move all matching lessons from one day to another (optionally shifting the time). Without confirm=true it only previews the plan and conflicts; nothing is written.",
  shape: {
    from_date: dateStr,
    to_date: dateStr,
    shift_minutes: z.number().int().min(-720).max(720).optional(),
    statuses: z.array(z.enum(LESSON_STATUSES)).min(1).max(4).optional(),
    student_id: uuid.optional(),
    confirm: z.boolean().optional(),
  },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const statuses = input.statuses ?? (["planned", "moved"] as const);

    let q = supabase
      .from("lessons")
      .select("id, student_id, scheduled_time, duration_min, status, students(name)")
      .is("deleted_at", null)
      .eq("scheduled_date", input.from_date)
      .in("status", [...statuses])
      .order("scheduled_time");
    if (input.student_id) q = q.eq("student_id", input.student_id);
    const { data: source, error } = await q;
    if (error) return dbError("schedule.reschedule_day", error);
    if (!source?.length) return ok({ moved: 0, plan: [], note: "Подходящих уроков нет." });

    const { data: target, error: targetError } = await supabase
      .from("lessons")
      .select("id, scheduled_time, duration_min, status")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("scheduled_date", input.to_date);
    if (targetError) return dbError("schedule.reschedule_day", targetError);

    const moving = new Set(source.map((r) => String(r.id)));
    const busy = (target ?? [])
      .filter((r) => !moving.has(String(r.id)))
      .map((r) => ({ start: toMinutes(String(r.scheduled_time)), dur: Number(r.duration_min ?? 60) }));

    const shift = input.shift_minutes ?? 0;
    const plan = source.map((row) => {
      const dur = Number(row.duration_min ?? 60);
      const start = toMinutes(String(row.scheduled_time)) + shift;
      const valid = start >= 0 && start + dur <= 24 * 60;
      const conflict = !valid || busy.some((b) => overlaps(start, dur, b.start, b.dur));
      if (!conflict) busy.push({ start, dur });
      const hh = String(Math.floor(start / 60)).padStart(2, "0");
      const mm = String(start % 60).padStart(2, "0");
      return {
        lesson_id: String(row.id),
        student_name: (row.students as { name?: string } | null)?.name ?? null,
        from_time: row.scheduled_time,
        to_time: valid ? `${hh}:${mm}` : null,
        conflict,
      };
    });

    const movable = plan.filter((p) => !p.conflict && p.to_time);
    if (!input.confirm) {
      return ok({
        executed: false,
        from_date: input.from_date,
        to_date: input.to_date,
        movable: movable.length,
        conflicts: plan.length - movable.length,
        plan,
        next_step: "Повторите вызов с confirm=true, чтобы применить перенос.",
      });
    }
    if (!movable.length) return fail("Все уроки конфликтуют — перенос не выполнен.");

    const moveResult = await bulkLessonMove.handler(
      {
        moves: movable.map((p) => ({
          lesson_id: p.lesson_id,
          scheduled_date: input.to_date,
          scheduled_time: p.to_time as string,
        })),
      },
      ctx,
    );
    if (moveResult.isError) return moveResult;
    return ok({
      executed: true,
      from_date: input.from_date,
      to_date: input.to_date,
      skipped_conflicts: plan.filter((p) => p.conflict),
      ...(moveResult.structuredContent ?? {}),
    });
  },
});

/** Read-only bundle describing everything relevant about one student right now. */
const fullProfile = defineOp({
  operation: "student.full_profile",
  summary:
    "Read-only bundle for one student: profile, weekly slots, upcoming lessons, attendance stats, unpaid finance and open homework.",
  shape: { student_id: uuid, from: dateStr.optional(), to: dateStr.optional() },
  handler: async ({ student_id, from, to }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 30);
    const periodFrom = from ?? start.toISOString().slice(0, 10);
    const periodTo = to ?? today;

    const [report, balance, slots, upcoming, homework] = await Promise.all([
      studentReport.handler({ student_id, from: periodFrom, to: periodTo }, ctx),
      studentBalance.handler({ student_id }, ctx),
      supabase
        .from("schedule_slots")
        .select("id, day_of_week, start_time, duration_min")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .order("day_of_week"),
      supabase
        .from("lessons")
        .select("id, scheduled_date, scheduled_time, duration_min, status")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .gte("scheduled_date", today)
        .order("scheduled_date")
        .limit(20),
      supabase
        .from("homework")
        .select("id, task, status, assigned_date, due_date")
        .is("deleted_at", null)
        .eq("student_id", student_id)
        .in("status", ["assigned", "partial", "not_done"])
        .order("due_date")
        .limit(50),
    ]);
    if (report.isError) return report;
    if (balance.isError) return balance;
    const anyError = slots.error ?? upcoming.error ?? homework.error;
    if (anyError) return dbError("student.full_profile", anyError);

    const reportData = report.structuredContent as Record<string, unknown>;
    const balanceData = balance.structuredContent as Record<string, unknown>;
    return ok({
      student_id,
      period: { from: periodFrom, to: periodTo },
      student: reportData?.["student"] ?? null,
      slots: slots.data ?? [],
      upcoming_lessons: upcoming.data ?? [],
      lessons: reportData?.["lessons"] ?? null,
      attendance: reportData?.["attendance"] ?? null,
      finance: {
        paid_totals: balanceData?.["paid_totals"] ?? {},
        unpaid_totals: balanceData?.["unpaid_totals"] ?? {},
      },
      open_homework: homework.data ?? [],
    });
  },
});

/** Analysis only: proposes which unpaid rows a payment would cover. Never writes. */
const reconcileStudent = defineOp({
  operation: "finance.reconcile_student",
  summary:
    "Preview only: match a proposed payment against a student's unpaid records and suggest which ones it would cover. Never marks anything paid and never deletes.",
  shape: { student_id: uuid, amount: amountSchema, currency: currencySchema },
  handler: async ({ student_id, amount, currency }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("finance")
      .select("id, amount, currency, created_at")
      .is("deleted_at", null)
      .eq("student_id", student_id)
      .eq("is_paid", false)
      .eq("currency", currency)
      .order("created_at")
      .limit(100);
    if (error) return dbError("finance.reconcile_student", error);

    let remaining = amount;
    const covers: unknown[] = [];
    const leftover: unknown[] = [];
    for (const row of data ?? []) {
      const value = Number(row.amount ?? 0);
      if (value <= remaining + 0.001) {
        remaining -= value;
        covers.push({ finance_id: row.id, amount: value, currency });
      } else {
        leftover.push({ finance_id: row.id, amount: value, currency });
      }
    }
    const outstanding = (data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    return ok({
      executed: false,
      student_id,
      currency,
      payment: amount,
      outstanding_total: outstanding,
      would_cover: covers,
      still_unpaid: leftover,
      unallocated: Math.round(remaining * 100) / 100,
      next_step:
        'Это только анализ. Чтобы применить, вызовите workflow "record_payment" или mutate "finance.bulk_set_paid" с подтверждением пользователя.',
    });
  },
});

export const EXTRA_WORKFLOW_OPS: readonly Op[] = [rescheduleDay, fullProfile, reconcileStudent];

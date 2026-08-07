import { z } from "zod";
import { dbError, fail, guardWrite, isToolResult, ok, requireCaller } from "../supabase";
import {
  ATTENDANCE_STATUSES,
  BULK_MAX,
  HOMEWORK_STATUSES,
  LESSON_STATUSES,
  STUDENT_STATUSES,
  bulkIdsSchema,
  dateStr,
  noteSchema,
  overlaps,
  timeStr,
  toMinutes,
  uuid,
} from "../schemas";
import { defineOp, type Op } from "../registry";

type ItemResult = { id: string; ok: boolean; error?: string; result?: unknown };

function summarise(results: ItemResult[]) {
  return {
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

const bulkStudentStatus = defineOp({
  operation: "students.bulk_update_status",
  summary: `Set the same status on up to ${BULK_MAX} students; returns a per-student result.`,
  shape: { student_ids: bulkIdsSchema, status: z.enum(STUDENT_STATUSES) },
  handler: async ({ student_ids, status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const ids = [...new Set(student_ids)];
    const { data, error } = await caller.supabase
      .from("students")
      .update({ status })
      .in("id", ids)
      .is("deleted_at", null)
      .select("id, name, status");
    if (error) return dbError("students.bulk_update_status", error);
    const updated = new Set((data ?? []).map((r) => String(r.id)));
    const results: ItemResult[] = ids.map((id) =>
      updated.has(id)
        ? { id, ok: true, result: { status } }
        : { id, ok: false, error: "Ученик не найден." },
    );
    return ok({ status, ...summarise(results) });
  },
});

const bulkAttendance = defineOp({
  operation: "attendance.bulk_mark",
  summary: `Mark attendance for up to ${BULK_MAX} student/date pairs. Idempotent: repeating a call updates the same records instead of duplicating them.`,
  shape: {
    entries: z
      .array(
        z
          .object({
            student_id: uuid,
            date: dateStr,
            status: z.enum(ATTENDANCE_STATUSES),
            note: noteSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(BULK_MAX),
  },
  handler: async ({ entries }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const results: ItemResult[] = [];
    for (const entry of entries) {
      const { data, error } = await caller.supabase.rpc("upsert_attendance_entry", {
        p_student_id: entry.student_id,
        p_date: entry.date,
        p_status: entry.status,
        p_note: entry.note ?? "",
        p_update_note: entry.note !== undefined,
      });
      const id = `${entry.student_id}:${entry.date}`;
      if (error) results.push({ id, ok: false, error: "Не удалось записать посещаемость." });
      else if (!data) results.push({ id, ok: false, error: "Ученик не найден." });
      else results.push({ id, ok: true, result: data });
    }
    return ok(summarise(results));
  },
});

const bulkFinancePaid = defineOp({
  operation: "finance.bulk_set_paid",
  summary: `Mark up to ${BULK_MAX} finance records paid or unpaid. Idempotent.`,
  shape: { finance_ids: bulkIdsSchema, is_paid: z.boolean(), pay_date: dateStr.optional() },
  handler: async ({ finance_ids, is_paid, pay_date }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const ids = [...new Set(finance_ids)];
    const patch = is_paid
      ? { is_paid: true, pay_date: pay_date ?? new Date().toISOString().slice(0, 10) }
      : { is_paid: false, pay_date: null };
    const { data, error } = await caller.supabase
      .from("finance")
      .update(patch)
      .in("id", ids)
      .is("deleted_at", null)
      .select("id, amount, currency, is_paid, pay_date");
    if (error) return dbError("finance.bulk_set_paid", error);
    const byId = new Map((data ?? []).map((r) => [String(r.id), r]));
    const results: ItemResult[] = ids.map((id) =>
      byId.has(id)
        ? { id, ok: true, result: byId.get(id) }
        : { id, ok: false, error: "Запись не найдена." },
    );
    return ok({ is_paid, ...summarise(results) });
  },
});

const bulkLessonStatus = defineOp({
  operation: "lessons.bulk_set_status",
  summary: `Set the status of up to ${BULK_MAX} lessons, keeping attendance in sync for each one. Idempotent.`,
  shape: { lesson_ids: bulkIdsSchema, status: z.enum(LESSON_STATUSES) },
  handler: async ({ lesson_ids, status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const results: ItemResult[] = [];
    for (const id of [...new Set(lesson_ids)]) {
      const { data, error } = await caller.supabase.rpc("set_lesson_status_with_attendance", {
        p_lesson_id: id,
        p_notes: "",
        p_status: status,
        p_update_notes: false,
      });
      if (error) results.push({ id, ok: false, error: "Не удалось изменить статус." });
      else if (!data) results.push({ id, ok: false, error: "Урок не найден." });
      else results.push({ id, ok: true, result: data });
    }
    return ok({ status, ...summarise(results) });
  },
});

const bulkLessonMove = defineOp({
  operation: "lessons.bulk_move",
  summary: `Move up to ${BULK_MAX} lessons to new dates/times. Conflicts are detected before writing; conflicting moves are refused and reported instead of applied.`,
  shape: {
    moves: z
      .array(
        z.object({ lesson_id: uuid, scheduled_date: dateStr, scheduled_time: timeStr }).strict(),
      )
      .min(1)
      .max(BULK_MAX),
  },
  handler: async ({ moves }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { supabase } = caller;
    const ids = moves.map((m) => m.lesson_id);

    const { data: targets, error } = await supabase
      .from("lessons")
      .select("id, student_id, scheduled_date, scheduled_time, duration_min")
      .in("id", ids)
      .is("deleted_at", null);
    if (error) return dbError("lessons.bulk_move", error);
    const known = new Map((targets ?? []).map((r) => [String(r.id), r]));

    const dates = [...new Set(moves.map((m) => m.scheduled_date))].sort();
    const { data: existing, error: existingError } = await supabase
      .from("lessons")
      .select("id, scheduled_date, scheduled_time, duration_min, status")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .gte("scheduled_date", dates[0]!)
      .lte("scheduled_date", dates[dates.length - 1]!);
    if (existingError) return dbError("lessons.bulk_move", existingError);

    // Occupancy excludes the lessons being moved; planned moves are added as they are accepted.
    const moving = new Set(ids);
    const busy: Array<{ date: string; start: number; dur: number }> = (existing ?? [])
      .filter((r) => !moving.has(String(r.id)))
      .map((r) => ({
        date: String(r.scheduled_date),
        start: toMinutes(String(r.scheduled_time)),
        dur: Number(r.duration_min ?? 60),
      }));

    const results: ItemResult[] = [];
    for (const move of moves) {
      const target = known.get(move.lesson_id);
      if (!target) {
        results.push({ id: move.lesson_id, ok: false, error: "Урок не найден." });
        continue;
      }
      const start = toMinutes(move.scheduled_time);
      const dur = Number(target.duration_min ?? 60);
      const clash = busy.find(
        (b) => b.date === move.scheduled_date && overlaps(start, dur, b.start, b.dur),
      );
      if (clash) {
        results.push({
          id: move.lesson_id,
          ok: false,
          error: `Конфликт: на ${move.scheduled_date} ${move.scheduled_time} уже занято.`,
        });
        continue;
      }
      const { data, error: moveError } = await supabase
        .from("lessons")
        .update({
          scheduled_date: move.scheduled_date,
          scheduled_time: move.scheduled_time,
          status: "planned",
        })
        .eq("id", move.lesson_id)
        .is("deleted_at", null)
        .select("id, student_id, scheduled_date, scheduled_time, status")
        .maybeSingle();
      if (moveError || !data) {
        results.push({
          id: move.lesson_id,
          ok: false,
          error: moveError?.code === "23505" ? "Конфликт времени." : "Не удалось перенести урок.",
        });
        continue;
      }
      busy.push({ date: move.scheduled_date, start, dur });
      results.push({ id: move.lesson_id, ok: true, result: data });
    }
    return ok(summarise(results));
  },
});

const bulkHomeworkStatus = defineOp({
  operation: "homework.bulk_update_status",
  summary: `Set the same status on up to ${BULK_MAX} homework entries. Idempotent.`,
  shape: { homework_ids: bulkIdsSchema, status: z.enum(HOMEWORK_STATUSES) },
  handler: async ({ homework_ids, status }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const ids = [...new Set(homework_ids)];
    const { data, error } = await caller.supabase
      .from("homework")
      .update({ status })
      .in("id", ids)
      .is("deleted_at", null)
      .select("id, status");
    if (error) return dbError("homework.bulk_update_status", error);
    const updated = new Set((data ?? []).map((r) => String(r.id)));
    const results: ItemResult[] = ids.map((id) =>
      updated.has(id)
        ? { id, ok: true, result: { status } }
        : { id, ok: false, error: "Задание не найдено." },
    );
    return ok({ status, ...summarise(results) });
  },
});

export const BULK_OPS: readonly Op[] = [
  bulkStudentStatus,
  bulkAttendance,
  bulkFinancePaid,
  bulkLessonStatus,
  bulkLessonMove,
  bulkHomeworkStatus,
];

export { bulkLessonMove, summarise };
export type { ItemResult };

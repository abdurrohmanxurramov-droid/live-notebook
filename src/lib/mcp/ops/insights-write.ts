import { z } from "zod";
import { dbError, fail, guardWrite, isToolResult, ok, requireCaller } from "../supabase";
import { BULK_MAX, bulkIdsSchema, dateStr, noteSchema, taskSchema, todayIso } from "../schemas";
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

/** Assign the same homework task to a batch of students in one call. */
const bulkAssignHomework = defineOp({
  operation: "homework.bulk_assign",
  summary: `Assign the same homework task to up to ${BULK_MAX} students at once; returns a per-student result.`,
  shape: {
    student_ids: bulkIdsSchema,
    task: taskSchema,
    assigned_date: dateStr.optional(),
    due_date: dateStr.optional(),
    note: noteSchema.optional(),
  },
  handler: async ({ student_ids, task, assigned_date, due_date, note }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const ids = [...new Set(student_ids)];
    const assigned = assigned_date ?? todayIso();
    if (due_date && due_date < assigned) return fail("Срок сдачи раньше даты выдачи.");

    const { data: owned, error: ownError } = await caller.supabase
      .from("students")
      .select("id")
      .in("id", ids)
      .is("deleted_at", null);
    if (ownError) return dbError("homework.bulk_assign", ownError);
    const ownedIds = new Set((owned ?? []).map((r) => String(r.id)));
    const insertable = ids.filter((id) => ownedIds.has(id));

    let created: Array<{ id: unknown; student_id: unknown }> = [];
    if (insertable.length) {
      const { data, error } = await caller.supabase
        .from("homework")
        .insert(
          insertable.map((student_id) => ({
            student_id,
            task,
            assigned_date: assigned,
            due_date: due_date ?? null,
            note: note ?? null,
            status: "assigned",
          })),
        )
        .select("id, student_id");
      if (error) return dbError("homework.bulk_assign", error);
      created = data ?? [];
    }
    const byStudent = new Map(created.map((r) => [String(r.student_id), String(r.id)]));
    const results: ItemResult[] = ids.map((id) =>
      byStudent.has(id)
        ? { id, ok: true, result: { homework_id: byStudent.get(id) } }
        : { id, ok: false, error: "Ученик не найден." },
    );
    return ok({ task, assigned_date: assigned, due_date: due_date ?? null, ...summarise(results) });
  },
});

/** Cancel every active lesson of a day; previews unless confirm=true. */
const cancelDay = defineOp({
  operation: "schedule.cancel_day",
  summary:
    "Cancel all planned/moved lessons on one date (optionally for one student), keeping attendance in sync. Without confirm=true it only previews what would be cancelled; nothing is written. Reversible: cancelled lessons can be set back with mutate lesson.set_status.",
  shape: {
    date: dateStr,
    student_id: z.string().uuid().optional(),
    reason: noteSchema.optional(),
    confirm: z.boolean().optional(),
  },
  handler: async ({ date, student_id, reason, confirm }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { supabase } = caller;

    let q = supabase
      .from("lessons")
      .select("id, student_id, scheduled_time, duration_min, status, students(name)")
      .is("deleted_at", null)
      .eq("scheduled_date", date)
      .in("status", ["planned", "moved"])
      .order("scheduled_time");
    if (student_id) q = q.eq("student_id", student_id);
    const { data, error } = await q;
    if (error) return dbError("schedule.cancel_day", error);

    const plan = (data ?? []).map((row) => ({
      lesson_id: String(row.id),
      student_id: String(row.student_id),
      student_name: (row.students as { name?: string } | null)?.name ?? null,
      time: row.scheduled_time,
      status: row.status,
    }));
    if (!plan.length)
      return ok({
        executed: false,
        date,
        cancelled: 0,
        plan: [],
        note: "Активных уроков на эту дату нет.",
      });

    if (!confirm) {
      return ok({
        executed: false,
        date,
        would_cancel: plan.length,
        plan,
        next_step: "Повторите вызов с confirm=true, чтобы отменить эти уроки.",
      });
    }

    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const results: ItemResult[] = [];
    for (const item of plan) {
      const { data: updated, error: rpcError } = await supabase.rpc(
        "set_lesson_status_with_attendance",
        {
          p_lesson_id: item.lesson_id,
          p_status: "cancelled",
          p_notes: reason ?? "",
          p_update_notes: Boolean(reason),
        },
      );
      if (rpcError || !updated) {
        results.push({ id: item.lesson_id, ok: false, error: "Не удалось отменить урок." });
      } else {
        results.push({ id: item.lesson_id, ok: true, result: { status: "cancelled" } });
      }
    }
    return ok({ executed: true, date, reason: reason ?? null, ...summarise(results) });
  },
});

export const INSIGHT_MUTATE_OPS: readonly Op[] = [bulkAssignHomework];
export const INSIGHT_WORKFLOW_OPS: readonly Op[] = [cancelDay];

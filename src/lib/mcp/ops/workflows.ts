import { z } from "zod";
import {
  assertOwnStudent,
  dbError,
  fail,
  guardWrite,
  isToolResult,
  ok,
  requireCaller,
  type ToolResult,
} from "../supabase";
import {
  amountSchema,
  currencySchema,
  dateStr,
  dayOfWeekSchema,
  durationSchema,
  nameSchema,
  noteSchema,
  taskSchema,
  timeStr,
  uuid,
} from "../schemas";
import { defineOp, type Op } from "../registry";
import { EXTRA_WORKFLOW_OPS } from "./workflows-extra";
import {
  createFinanceEntry,
  createHomework,
  createSlot,
  createStudent,
  markAttendance,
  moveLesson,
  preparePermanentDelete,
  setFinancePaid,
  setLessonStatus,
  setStudentStatus,
} from "./mutations";

type Step = { step: string; ok: boolean; result: unknown };

function stepResult(name: string, result: ToolResult): Step {
  return {
    step: name,
    ok: !result.isError,
    result: result.structuredContent ?? result.content[0]?.text ?? null,
  };
}

const onboardStudent = defineOp({
  operation: "onboard_student",
  summary:
    "Create a student and, optionally, their recurring weekly slots in one reversible sequence.",
  shape: {
    name: nameSchema,
    subject: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(40).optional(),
    lesson_price: amountSchema.optional(),
    lesson_currency: currencySchema.optional(),
    slots: z
      .array(
        z
          .object({
            day_of_week: dayOfWeekSchema,
            start_time: timeStr,
            duration_min: durationSchema.optional(),
          })
          .strict(),
      )
      .max(7)
      .optional(),
  },
  handler: async ({ slots, ...student }, ctx) => {
    const steps: Step[] = [];
    const created = await createStudent.handler({ ...student, days_per_week: slots?.length }, ctx);
    steps.push(stepResult("student.create", created));
    if (created.isError) return { ...created, structuredContent: { steps } };
    const studentId = (created.structuredContent as { student?: { id?: string } } | undefined)
      ?.student?.id;
    if (!studentId) return fail("Ученик создан, но идентификатор не получен.");
    for (const slot of slots ?? []) {
      const slotResult = await createSlot.handler({ student_id: studentId, ...slot }, ctx);
      steps.push(stepResult("schedule_slot.create", slotResult));
      if (slotResult.isError) break;
    }
    return ok({ student_id: studentId, steps });
  },
});

const completeLesson = defineOp({
  operation: "complete_lesson",
  summary:
    "Close out a lesson: set its status to completed, mark attendance, and optionally assign homework.",
  shape: {
    lesson_id: uuid,
    attendance_status: z.enum(["present", "absent", "excused"]).optional(),
    attendance_note: noteSchema.optional(),
    lesson_notes: noteSchema.optional(),
    homework_task: taskSchema.optional(),
    homework_due_date: dateStr.optional(),
  },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data: lesson, error } = await caller.supabase
      .from("lessons")
      .select("id, student_id, scheduled_date")
      .eq("id", input.lesson_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("complete_lesson", error);
    if (!lesson) return fail("Урок не найден.");

    const steps: Step[] = [];
    const statusResult = await setLessonStatus.handler(
      { lesson_id: input.lesson_id, status: "completed" },
      ctx,
    );
    steps.push(stepResult("lesson.set_status", statusResult));
    if (statusResult.isError) return { ...statusResult, structuredContent: { steps } };

    if (input.lesson_notes !== undefined) {
      const limited = await guardWrite(caller.userId);
      if (limited) return limited;
      const { data, error: notesError } = await caller.supabase
        .from("lessons")
        .update({ notes: input.lesson_notes })
        .eq("id", input.lesson_id)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      steps.push({
        step: "lesson.update",
        ok: !notesError && Boolean(data),
        result: notesError ? "error" : (data ?? null),
      });
    }

    const attendance = await markAttendance.handler(
      {
        student_id: lesson.student_id as string,
        date: lesson.scheduled_date as string,
        status: input.attendance_status ?? "present",
        note: input.attendance_note,
      },
      ctx,
    );
    steps.push(stepResult("attendance.mark", attendance));

    if (input.homework_task) {
      const homework = await createHomework.handler(
        {
          student_id: lesson.student_id as string,
          task: input.homework_task,
          assigned_date: lesson.scheduled_date as string,
          due_date: input.homework_due_date,
        },
        ctx,
      );
      steps.push(stepResult("homework.create", homework));
    }
    return ok({ lesson_id: input.lesson_id, steps });
  },
});

const rescheduleLesson = defineOp({
  operation: "reschedule_lesson",
  summary:
    "Move a lesson to a new date/time and optionally record that the teacher rescheduled it in attendance.",
  shape: {
    lesson_id: uuid,
    scheduled_date: dateStr,
    scheduled_time: timeStr,
    mark_rescheduled_by_teacher: z.boolean().optional(),
    note: noteSchema.optional(),
  },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data: lesson, error } = await caller.supabase
      .from("lessons")
      .select("id, student_id, scheduled_date")
      .eq("id", input.lesson_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("reschedule_lesson", error);
    if (!lesson) return fail("Урок не найден.");

    const steps: Step[] = [];
    const moved = await moveLesson.handler(
      {
        lesson_id: input.lesson_id,
        scheduled_date: input.scheduled_date,
        scheduled_time: input.scheduled_time,
      },
      ctx,
    );
    steps.push(stepResult("lesson.move", moved));
    if (moved.isError) return { ...moved, structuredContent: { steps } };

    if (input.mark_rescheduled_by_teacher) {
      const attendance = await markAttendance.handler(
        {
          student_id: lesson.student_id as string,
          date: lesson.scheduled_date as string,
          status: "rescheduled_by_teacher",
          note: input.note,
        },
        ctx,
      );
      steps.push(stepResult("attendance.mark", attendance));
    }
    return ok({ lesson_id: input.lesson_id, steps });
  },
});

const recordPayment = defineOp({
  operation: "record_payment",
  summary:
    "Record money received: either mark existing unpaid records paid, or create a new paid entry.",
  shape: {
    student_id: uuid,
    finance_ids: z.array(uuid).max(20).optional(),
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    pay_date: dateStr.optional(),
  },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!(await assertOwnStudent(caller.supabase, input.student_id)))
      return fail("Ученик не найден.");
    const steps: Step[] = [];
    if (input.finance_ids?.length) {
      for (const id of input.finance_ids) {
        const paid = await setFinancePaid.handler(
          { finance_id: id, is_paid: true, pay_date: input.pay_date },
          ctx,
        );
        steps.push(stepResult("finance.set_paid", paid));
      }
      return ok({ student_id: input.student_id, steps });
    }
    if (input.amount === undefined || !input.currency) {
      return fail("Укажите finance_ids либо amount и currency.");
    }
    const created = await createFinanceEntry.handler(
      {
        student_id: input.student_id,
        amount: input.amount,
        currency: input.currency,
        is_paid: true,
        pay_date: input.pay_date ?? new Date().toISOString().slice(0, 10),
      },
      ctx,
    );
    steps.push(stepResult("finance.create", created));
    return created.isError ? { ...created, structuredContent: { steps } } : ok({ steps });
  },
});

const archiveStudent = defineOp({
  operation: "archive_student",
  summary:
    "Archive a student: set status to archived, trash their weekly slots, and trash today's and future planned/moved lessons. Fully reversible from trash; history is untouched.",
  shape: { student_id: uuid, from_date: dateStr.optional() },
  handler: async ({ student_id, from_date }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const cutoff = from_date ?? new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const steps: Step[] = [];

    const status = await setStudentStatus.handler({ student_id, status: "archived" }, ctx);
    steps.push(stepResult("student.set_status", status));
    if (status.isError) return { ...status, structuredContent: { steps } };

    const { data: slots, error: slotError } = await caller.supabase
      .from("schedule_slots")
      .update({ deleted_at: now })
      .eq("student_id", student_id)
      .is("deleted_at", null)
      .select("id");
    if (slotError) return dbError("archive_student", slotError);
    steps.push({ step: "schedule_slots.trashed", ok: true, result: { count: slots?.length ?? 0 } });

    const { data: lessons, error: lessonError } = await caller.supabase
      .from("lessons")
      .update({ deleted_at: now })
      .eq("student_id", student_id)
      .is("deleted_at", null)
      .gte("scheduled_date", cutoff)
      .in("status", ["planned", "moved"])
      .select("id");
    if (lessonError) return dbError("archive_student", lessonError);
    steps.push({ step: "lessons.trashed", ok: true, result: { count: lessons?.length ?? 0 } });

    return ok({ student_id, from_date: cutoff, reversible: true, steps });
  },
});

const requestPermanentDelete = defineOp({
  operation: "request_permanent_delete",
  summary:
    "Prepare an irreversible deletion: returns a confirmation token only. This workflow NEVER deletes; the user must confirm and then mutate/record.confirm_permanent_delete is called.",
  shape: preparePermanentDelete.shape,
  handler: async (input, ctx) => {
    const prepared = await preparePermanentDelete.handler(input, ctx);
    if (prepared.isError) return prepared;
    return ok({
      ...(prepared.structuredContent ?? {}),
      next_step:
        'Покажите запись пользователю, получите явное подтверждение, затем вызовите mutate с operation "record.confirm_permanent_delete".',
      executed: false,
    });
  },
});

export const WORKFLOW_OPS: readonly Op[] = [
  onboardStudent,
  completeLesson,
  rescheduleLesson,
  recordPayment,
  archiveStudent,
  requestPermanentDelete,
  ...EXTRA_WORKFLOW_OPS,
];

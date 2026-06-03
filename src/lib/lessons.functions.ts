import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LESSON_STATUSES = ["planned", "completed", "cancelled", "moved"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

// Generation window
const PAST_MONTHS = 3;
const FUTURE_MONTHS = 1;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function jsDayToMon(jsDay: number) {
  return (jsDay + 6) % 7;
}

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dateRangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("lessons")
      .select("id, student_id, scheduled_date, scheduled_time, duration_min, status, notes, moved_from_id")
      .is("deleted_at", null)
      .gte("scheduled_date", data.from)
      .lte("scheduled_date", data.to)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });
    if (error) throw new Error(error.message);
    return { lessons: rows ?? [] };
  });

const setStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LESSON_STATUSES),
  notes: z.string().max(1000).optional(),
});

export const setLessonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { status: LessonStatus; notes?: string } = { status: data.status };
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase.from("lessons").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const moveSchema = z.object({
  id: z.string().uuid(),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  new_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

export const moveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => moveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: orig, error: e1 } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1 || !orig) throw new Error(e1?.message ?? "Урок не найден");

    const newTime = data.new_time.length === 5 ? `${data.new_time}:00` : data.new_time;

    // Mark original as moved
    const { error: e2 } = await supabase
      .from("lessons")
      .update({ status: "moved" })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);

    // Create new lesson at the new slot
    const { error: e3 } = await supabase.from("lessons").insert({
      owner_id: userId,
      student_id: orig.student_id,
      scheduled_date: data.new_date,
      scheduled_time: newTime,
      duration_min: orig.duration_min,
      status: "planned",
      moved_from_id: data.id,
      source_slot_id: orig.source_slot_id,
    });
    if (e3) {
      // rollback original
      await supabase.from("lessons").update({ status: orig.status }).eq("id", data.id);
      throw new Error(e3.message);
    }
    return { ok: true };
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lessons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setMonth(from.getMonth() - PAST_MONTHS);
    const to = new Date(today);
    to.setMonth(to.getMonth() + FUTURE_MONTHS);
    const fromStr = isoDate(from);
    const toStr = isoDate(to);

    const [{ data: slots, error: eSlots }, { data: existing, error: eEx }, { data: attendance, error: eAtt }] =
      await Promise.all([
        supabase.from("schedule_slots").select("id, student_id, day_of_week, start_time, duration_min"),
        supabase
          .from("lessons")
          .select("student_id, scheduled_date, scheduled_time, status")
          .gte("scheduled_date", fromStr)
          .lte("scheduled_date", toStr),
        supabase.from("attendance").select("student_id, date, status").gte("date", fromStr).lte("date", toStr),
      ]);
    if (eSlots) throw new Error(eSlots.message);
    if (eEx) throw new Error(eEx.message);
    if (eAtt) throw new Error(eAtt.message);

    const existKey = new Set(
      (existing ?? []).map((l) => `${l.student_id}|${l.scheduled_date}|${l.scheduled_time}`),
    );
    const attMap = new Map<string, string>();
    (attendance ?? []).forEach((a) => attMap.set(`${a.student_id}|${a.date}`, a.status));

    const todayIso = isoDate(today);
    type Insert = {
      owner_id: string;
      student_id: string;
      scheduled_date: string;
      scheduled_time: string;
      duration_min: number;
      status: LessonStatus;
      source_slot_id: string;
    };
    const toInsert: Insert[] = [];

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dow = jsDayToMon(d.getDay());
      const dateStr = isoDate(d);
      for (const s of slots ?? []) {
        if (s.day_of_week !== dow) continue;
        const time = String(s.start_time).length === 5 ? `${s.start_time}:00` : s.start_time;
        const key = `${s.student_id}|${dateStr}|${time}`;
        if (existKey.has(key)) continue;

        let status: LessonStatus;
        const att = attMap.get(`${s.student_id}|${dateStr}`);
        if (dateStr < todayIso) {
          if (att === "absent") status = "cancelled";
          else status = "completed";
        } else {
          status = "planned";
        }

        toInsert.push({
          owner_id: userId,
          student_id: s.student_id,
          scheduled_date: dateStr,
          scheduled_time: time,
          duration_min: s.duration_min ?? 60,
          status,
          source_slot_id: s.id,
        });
      }
    }

    let inserted = 0;
    // Insert in chunks of 500
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from("lessons").insert(chunk);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }

    return { inserted, window: { from: fromStr, to: toStr } };
  });

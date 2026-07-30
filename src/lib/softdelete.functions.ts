import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SOFT_DELETE_TABLES } from "./schemas";

const targetSchema = z.object({
  table: z.enum(SOFT_DELETE_TABLES),
  id: z.string().uuid(),
});

export const softDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from(data.table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) {
      console.error("[soft-delete]", data.table, error.code);
      throw new Error("Не удалось переместить запись в корзину.");
    }
    return { ok: true };
  });

export const restoreItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from(data.table)
      .update({ deleted_at: null })
      .eq("id", data.id);
    if (error) {
      console.error("[restore-item]", data.table, error.code);
      throw new Error("Не удалось восстановить запись.");
    }
    return { ok: true };
  });

export const hardDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from(data.table).delete().eq("id", data.id);
    if (error) {
      console.error("[hard-delete]", data.table, error.code);
      throw new Error("Не удалось удалить запись.");
    }
    return { ok: true };
  });

export const softDeleteStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: updated, error } = await supabase.rpc("set_student_deleted_state", {
      p_deleted: true,
      p_student_id: data.id,
    });
    if (error) {
      console.error("[soft-delete-student]", error.code);
      throw new Error("Не удалось переместить ученика в корзину.");
    }
    if (!updated) throw new Error("Ученик не найден или недоступен.");
    return { ok: true };
  });

export const restoreStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: updated, error } = await supabase.rpc("set_student_deleted_state", {
      p_deleted: false,
      p_student_id: data.id,
    });
    if (error) {
      console.error("[restore-student]", error.code);
      throw new Error("Не удалось восстановить ученика.");
    }
    if (!updated) throw new Error("Ученик не найден или недоступен.");
    return { ok: true };
  });

const trashColumns: Record<(typeof SOFT_DELETE_TABLES)[number], string> = {
  students: "id, name, subject, deleted_at",
  lessons: "id, student_id, scheduled_date, scheduled_time, status, deleted_at",
  attendance: "id, student_id, date, status, deleted_at",
  finance: "id, student_id, amount, currency, is_paid, pay_date, deleted_at",
  homework: "id, student_id, task, status, deleted_at",
  schedule_slots: "id, student_id, day_of_week, start_time, deleted_at",
};

export type TrashRow = Record<string, string | number | boolean | null>;

export const listTrash = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const out: Record<string, TrashRow[]> = {};
    for (const t of SOFT_DELETE_TABLES) {
      const { data, error } = await supabase
        .from(t)
        .select(trashColumns[t])
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[trash-list]", t, error.code);
        throw new Error("Не удалось загрузить корзину.");
      }
      out[t] = (data ?? []) as unknown as TrashRow[];
    }
    return out;
  });

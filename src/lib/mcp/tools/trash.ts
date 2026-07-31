import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError, fail, guardWrite, isToolResult, ok, requireCaller } from "../supabase";
import { DELETABLE_TABLES, uuid } from "../schemas";

const TRASH_COLUMNS: Record<(typeof DELETABLE_TABLES)[number], string> = {
  students: "id, name, subject, deleted_at",
  lessons: "id, student_id, scheduled_date, scheduled_time, status, deleted_at",
  attendance: "id, student_id, date, status, deleted_at",
  finance: "id, student_id, amount, currency, is_paid, deleted_at",
  homework: "id, student_id, task, status, deleted_at",
  schedule_slots: "id, student_id, day_of_week, start_time, deleted_at",
};

const tableSchema = z.enum(DELETABLE_TABLES).describe("Which record type to act on");

export const listTrash = defineTool({
  name: "list_trash",
  title: "List trash",
  description: "List soft-deleted records that can still be restored.",
  inputSchema: { table: tableSchema.optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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
      if (error) return dbError("list_trash", error);
      out[t] = data ?? [];
    }
    return ok({ trash: out });
  },
});

export const softDeleteRecord = defineTool({
  name: "soft_delete_record",
  title: "Move record to trash",
  description:
    "Soft-delete a record (moves it to trash; it can be restored). Deleting a student also trashes their slots, lessons, attendance and homework.",
  inputSchema: { table: tableSchema, record_id: uuid },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (table === "students") {
      const { data, error } = await caller.supabase.rpc("set_student_deleted_state", {
        p_deleted: true,
        p_student_id: record_id,
      });
      if (error) return dbError("soft_delete_student", error);
      if (!data) return fail("Ученик не найден.");
      return ok({ deleted: { table, id: record_id } });
    }
    const { data, error } = await caller.supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", record_id)
      .select("id")
      .maybeSingle();
    if (error) return dbError("soft_delete_record", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ deleted: { table, id: record_id } });
  },
});

export const restoreRecord = defineTool({
  name: "restore_record",
  title: "Restore record from trash",
  description: "Restore a soft-deleted record. Restoring a student also restores their related data.",
  inputSchema: { table: tableSchema, record_id: uuid },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (table === "students") {
      const { data, error } = await caller.supabase.rpc("set_student_deleted_state", {
        p_deleted: false,
        p_student_id: record_id,
      });
      if (error) return dbError("restore_student", error);
      if (!data) return fail("Ученик не найден.");
      return ok({ restored: { table, id: record_id } });
    }
    const { data, error } = await caller.supabase
      .from(table)
      .update({ deleted_at: null })
      .eq("id", record_id)
      .select("id")
      .maybeSingle();
    if (error) return dbError("restore_record", error);
    if (!data) return fail("Запись не найдена.");
    return ok({ restored: { table, id: record_id } });
  },
});

export const preparePermanentDelete = defineTool({
  name: "prepare_permanent_delete",
  title: "Prepare permanent delete",
  description:
    "Step 1 of 2 for irreversible deletion: returns a confirmation token valid for 5 minutes. Show the record to the user and ask for explicit confirmation before calling confirm_permanent_delete.",
  inputSchema: { table: tableSchema, record_id: uuid },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ table, record_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data: target, error: targetError } = await caller.supabase
      .from(table)
      .select("id")
      .eq("id", record_id)
      .maybeSingle();
    if (targetError) return dbError("prepare_permanent_delete", targetError);
    if (!target) return fail("Запись не найдена.");
    const { data, error } = await caller.supabase
      .from("mcp_pending_deletes")
      .insert({ owner_id: caller.userId, target_table: table, target_id: record_id })
      .select("id, expires_at")
      .maybeSingle();
    if (error) return dbError("prepare_permanent_delete", error);
    return ok({
      confirmation_token: data?.id,
      expires_at: data?.expires_at,
      warning: "Необратимое удаление. Подтвердите у пользователя перед confirm_permanent_delete.",
    });
  },
});

export const confirmPermanentDelete = defineTool({
  name: "confirm_permanent_delete",
  title: "Confirm permanent delete",
  description:
    "Step 2 of 2: permanently delete the record referenced by a confirmation token from prepare_permanent_delete. This cannot be undone.",
  inputSchema: {
    confirmation_token: uuid.describe("Token returned by prepare_permanent_delete"),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ confirmation_token }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const { data: pending, error } = await caller.supabase
      .from("mcp_pending_deletes")
      .select("id, target_table, target_id, expires_at")
      .eq("id", confirmation_token)
      .maybeSingle();
    if (error) return dbError("confirm_permanent_delete", error);
    if (!pending) return fail("Подтверждение не найдено. Запросите новое.");
    // Single-use: drop the token before acting on it.
    await caller.supabase.from("mcp_pending_deletes").delete().eq("id", pending.id);
    if (new Date(pending.expires_at as string).getTime() < Date.now()) {
      return fail("Срок подтверждения истёк. Запросите новое.");
    }
    const table = pending.target_table as (typeof DELETABLE_TABLES)[number];
    const { data: removed, error: deleteError } = await caller.supabase
      .from(table)
      .delete()
      .eq("id", pending.target_id)
      .select("id")
      .maybeSingle();
    if (deleteError) return dbError("confirm_permanent_delete", deleteError);
    if (!removed) return fail("Запись не найдена.");
    return ok({ permanently_deleted: { table, id: pending.target_id } });
  },
});

export default [
  listTrash,
  softDeleteRecord,
  restoreRecord,
  preparePermanentDelete,
  confirmPermanentDelete,
];

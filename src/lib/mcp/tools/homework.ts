import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  assertOwnStudent,
  dbError,
  fail,
  guardWrite,
  isToolResult,
  ok,
  requireCaller,
} from "../supabase";
import { compact, dateStr, HOMEWORK_STATUSES, noteSchema, taskSchema, uuid } from "../schemas";

const HW_COLUMNS = "id, student_id, task, assigned_date, due_date, status, note, created_at";
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listHomework = defineTool({
  name: "list_homework",
  title: "List homework",
  description: "List homework entries, optionally filtered by student or status.",
  inputSchema: {
    student_id: uuid.optional(),
    status: z.enum(HOMEWORK_STATUSES).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: READ,
  handler: async ({ student_id, status, limit }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("homework")
      .select(HW_COLUMNS)
      .is("deleted_at", null)
      .order("assigned_date", { ascending: false })
      .limit(limit ?? 100);
    if (student_id) query = query.eq("student_id", student_id);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return dbError("list_homework", error);
    return ok({ homework: data ?? [] });
  },
});

export const getHomework = defineTool({
  name: "get_homework",
  title: "Get homework",
  description: "Get one homework entry by ID.",
  inputSchema: { homework_id: uuid },
  annotations: READ,
  handler: async ({ homework_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("homework")
      .select(HW_COLUMNS)
      .eq("id", homework_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("get_homework", error);
    if (!data) return fail("Задание не найдено.");
    return ok({ homework: data });
  },
});

export const createHomework = defineTool({
  name: "create_homework",
  title: "Create homework",
  description: "Assign homework to one of the teacher's students.",
  inputSchema: {
    student_id: uuid,
    task: taskSchema,
    assigned_date: dateStr.optional(),
    due_date: dateStr.optional(),
    note: noteSchema.optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ student_id, ...rest }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("homework")
      .insert(compact({ student_id, owner_id: caller.userId, ...rest }))
      .select(HW_COLUMNS)
      .maybeSingle();
    if (error) return dbError("create_homework", error);
    return ok({ homework: data });
  },
});

export const updateHomework = defineTool({
  name: "update_homework",
  title: "Update homework",
  description: "Update the task text, due date, status or note of an existing homework entry.",
  inputSchema: {
    homework_id: uuid,
    task: taskSchema.optional(),
    due_date: dateStr.nullable().optional(),
    status: z.enum(HOMEWORK_STATUSES).optional(),
    note: noteSchema.nullable().optional(),
  },
  annotations: WRITE,
  handler: async ({ homework_id, ...patch }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const fields = compact(patch);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("homework")
      .update(fields)
      .eq("id", homework_id)
      .is("deleted_at", null)
      .select(HW_COLUMNS)
      .maybeSingle();
    if (error) return dbError("update_homework", error);
    if (!data) return fail("Задание не найдено.");
    return ok({ homework: data });
  },
});

export default [listHomework, getHomework, createHomework, updateHomework];

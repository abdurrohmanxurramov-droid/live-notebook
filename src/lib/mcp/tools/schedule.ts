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
import { compact, dayOfWeekSchema, durationSchema, timeStr, uuid } from "../schemas";

const SLOT_COLUMNS = "id, student_id, day_of_week, start_time, duration_min, created_at";
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listScheduleSlots = defineTool({
  name: "list_schedule_slots",
  title: "List schedule slots",
  description: "List recurring weekly schedule slots, optionally filtered by student or weekday.",
  inputSchema: {
    student_id: uuid.optional(),
    day_of_week: dayOfWeekSchema.optional().describe("0 = Sunday … 6 = Saturday"),
  },
  annotations: READ,
  handler: async ({ student_id, day_of_week }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    let query = caller.supabase
      .from("schedule_slots")
      .select(SLOT_COLUMNS)
      .is("deleted_at", null)
      .order("day_of_week")
      .order("start_time");
    if (student_id) query = query.eq("student_id", student_id);
    if (day_of_week !== undefined) query = query.eq("day_of_week", day_of_week);
    const { data, error } = await query;
    if (error) return dbError("list_schedule_slots", error);
    return ok({ slots: data ?? [] });
  },
});

export const getScheduleSlot = defineTool({
  name: "get_schedule_slot",
  title: "Get schedule slot",
  description: "Get one recurring schedule slot by ID.",
  inputSchema: { slot_id: uuid },
  annotations: READ,
  handler: async ({ slot_id }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("schedule_slots")
      .select(SLOT_COLUMNS)
      .eq("id", slot_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return dbError("get_schedule_slot", error);
    if (!data) return fail("Слот не найден.");
    return ok({ slot: data });
  },
});

export const createScheduleSlot = defineTool({
  name: "create_schedule_slot",
  title: "Create schedule slot",
  description: "Add a recurring weekly slot for one of the teacher's students.",
  inputSchema: {
    student_id: uuid,
    day_of_week: dayOfWeekSchema,
    start_time: timeStr,
    duration_min: durationSchema.optional(),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ student_id, day_of_week, start_time, duration_min }, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    if (!(await assertOwnStudent(caller.supabase, student_id))) return fail("Ученик не найден.");
    const { data, error } = await caller.supabase
      .from("schedule_slots")
      .insert(
        compact({
          student_id,
          day_of_week,
          start_time,
          duration_min,
          owner_id: caller.userId,
        }),
      )
      .select(SLOT_COLUMNS)
      .maybeSingle();
    if (error) return dbError("create_schedule_slot", error);
    return ok({ slot: data });
  },
});

async function patchSlot(
  ctx: Parameters<typeof requireCaller>[0],
  slotId: string,
  patch: Record<string, unknown>,
  tag: string,
) {
  const caller = await requireCaller(ctx);
  if (isToolResult(caller)) return caller;
  const limited = await guardWrite(caller.userId);
  if (limited) return limited;
  const fields = compact(patch);
  if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
  const { data, error } = await caller.supabase
    .from("schedule_slots")
    .update(fields)
    .eq("id", slotId)
    .is("deleted_at", null)
    .select(SLOT_COLUMNS)
    .maybeSingle();
  if (error) return dbError(tag, error);
  if (!data) return fail("Слот не найден.");
  return ok({ slot: data });
}

export const updateScheduleSlot = defineTool({
  name: "update_schedule_slot",
  title: "Update schedule slot",
  description: "Change the duration or start time of an existing recurring slot.",
  inputSchema: {
    slot_id: uuid,
    start_time: timeStr.optional(),
    duration_min: durationSchema.optional(),
  },
  annotations: WRITE,
  handler: ({ slot_id, ...patch }, ctx) => patchSlot(ctx, slot_id, patch, "update_schedule_slot"),
});

export const moveScheduleSlot = defineTool({
  name: "move_schedule_slot",
  title: "Move schedule slot",
  description: "Move a recurring slot to another weekday and/or time.",
  inputSchema: {
    slot_id: uuid,
    day_of_week: dayOfWeekSchema,
    start_time: timeStr,
  },
  annotations: WRITE,
  handler: ({ slot_id, ...patch }, ctx) => patchSlot(ctx, slot_id, patch, "move_schedule_slot"),
});

export default [
  listScheduleSlots,
  getScheduleSlot,
  createScheduleSlot,
  updateScheduleSlot,
  moveScheduleSlot,
];

export const _internal = { z };

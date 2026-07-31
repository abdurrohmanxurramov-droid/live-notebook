import { defineTool } from "@lovable.dev/mcp-js";
import { dbError, fail, guardWrite, isToolResult, ok, requireCaller } from "../supabase";
import { compact, settingsPatchSchema } from "../schemas";

const SETTINGS_COLUMNS =
  "default_currency, default_lesson_duration, default_lesson_price, week_starts_on, remind_before_min, locale, remind_lessons, remind_payments, remind_homework, theme, onboarding_completed";

export const getSettings = defineTool({
  name: "get_settings",
  title: "Get settings",
  description: "Read the signed-in teacher's app settings (defaults, reminders, locale).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const { data, error } = await caller.supabase
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    if (error) return dbError("get_settings", error);
    return ok({ settings: data ?? null });
  },
});

export const updateSettings = defineTool({
  name: "update_settings",
  title: "Update settings",
  description:
    "Update safe app preferences: default currency, lesson duration and price, week start, reminder options and locale.",
  inputSchema: settingsPatchSchema.shape,
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const caller = await requireCaller(ctx);
    if (isToolResult(caller)) return caller;
    const limited = await guardWrite(caller.userId);
    if (limited) return limited;
    const parsed = settingsPatchSchema.safeParse(input);
    if (!parsed.success) return fail("Некорректные значения настроек.");
    const fields = compact(parsed.data);
    if (Object.keys(fields).length === 0) return fail("Нечего обновлять.");
    const { data, error } = await caller.supabase
      .from("user_settings")
      .upsert({ user_id: caller.userId, ...fields }, { onConflict: "user_id" })
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    if (error) return dbError("update_settings", error);
    return ok({ settings: data });
  },
});

export default [getSettings, updateSettings];

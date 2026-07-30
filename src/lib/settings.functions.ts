import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userSettingsSchema } from "./schemas";

const DEFAULTS = {
  default_currency: "RUB" as const,
  default_lesson_duration: 60,
  default_lesson_price: 0,
  week_starts_on: 1,
  remind_before_min: 60,
  locale: "ru" as const,
  remind_lessons: true,
  remind_payments: true,
  remind_homework: true,
};

const SETTINGS_SELECT =
  "user_id, default_currency, default_lesson_duration, default_lesson_price, week_starts_on, remind_before_min, locale, remind_lessons, remind_payments, remind_homework, gender, theme, onboarding_completed, created_at, updated_at";

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_settings")
      .select(SETTINGS_SELECT)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[settings-read]", error.code);
      throw new Error("Не удалось загрузить настройки.");
    }
    if (data) return data;
    const { data: created, error: e2 } = await supabase
      .from("user_settings")
      .insert({ user_id: userId, ...DEFAULTS })
      .select(SETTINGS_SELECT)
      .single();
    if (e2) {
      console.error("[settings-create]", e2.code);
      throw new Error("Не удалось создать настройки.");
    }
    return created;
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => userSettingsSchema.partial().parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, ...DEFAULTS, ...data }, { onConflict: "user_id" })
      .select(SETTINGS_SELECT)
      .single();
    if (error) {
      console.error("[settings-update]", error.code);
      throw new Error("Не удалось сохранить настройки.");
    }
    return updated;
  });

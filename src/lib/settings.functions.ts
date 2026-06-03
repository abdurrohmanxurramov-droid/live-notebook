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
};

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    const { data: created, error: e2 } = await supabase
      .from("user_settings")
      .insert({ user_id: userId, ...DEFAULTS })
      .select()
      .single();
    if (e2) throw new Error(e2.message);
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
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

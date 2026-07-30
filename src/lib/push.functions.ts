import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit";

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        endpoint: z.string().url().max(2000),
        p256dh: z.string().min(1).max(500),
        auth: z.string().min(1).max(500),
        user_agent: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        owner_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.user_agent ?? null,
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("[push-save]", error.code);
      throw new Error("Не удалось сохранить подписку.");
    }
    return { ok: true, ownerId: userId };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ endpoint: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);
    if (error) {
      console.error("[push-remove]", error.code);
      throw new Error("Не удалось удалить подписку.");
    }
    return { ok: true };
  });

export const ownsPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ endpoint: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: subscription, error } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    if (error) {
      console.error("[push-owner-check]", error.code);
      throw new Error("Не удалось проверить подписку.");
    }
    return subscription !== null;
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ endpoint: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context.supabase, "push_test");
    const { sendPushTo } = await import("./push.server");
    const { data: sub, error } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    if (error) {
      console.error("[push-test-select]", error.code);
      throw new Error("Не удалось проверить подписку.");
    }
    if (!sub) throw new Error("Подписка не найдена");
    const result = await sendPushTo(sub, {
      title: "Живой Блокнот",
      body: "Тестовое уведомление работает ✨",
      url: "/",
      tag: "test",
    });
    if (!result.ok) throw new Error("Не удалось отправить тестовое уведомление.");
    return { ok: true };
  });

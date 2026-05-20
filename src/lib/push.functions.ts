import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const savePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        endpoint: z.string().url().max(2000),
        p256dh: z.string().min(1).max(500),
        auth: z.string().min(1).max(500),
        user_agent: z.string().max(500).optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.user_agent ?? null,
        },
        { onConflict: "endpoint" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ endpoint: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ endpoint: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { sendPushTo } = await import("./push.server");
    const { data: sub } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    if (!sub) throw new Error("Подписка не найдена");
    await sendPushTo(sub, {
      title: "Живой Блокнот",
      body: "Тестовое уведомление работает ✨",
      url: "/",
      tag: "test",
    });
    return { ok: true };
  });

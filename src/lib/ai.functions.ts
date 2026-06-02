import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "user" | "assistant" | "system"; content: string };

export const chatWithAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: Msg[] }) => input)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY не настроен");

    const { supabase, userId } = context;

    // Собираем контекст: ученики, ближайшие финансы, посещаемость
    const [{ data: students }, { data: slots }, { data: payments }] = await Promise.all([
      supabase.from("students").select("id, name, price_per_lesson, lessons_paid, lessons_used").eq("user_id", userId),
      supabase.from("schedule_slots").select("student_id, day_of_week, start_time, duration_min"),
      supabase.from("payments").select("student_id, amount, created_at").order("created_at", { ascending: false }).limit(20),
    ]);

    const ctxText = [
      `Текущая дата: ${new Date().toISOString().slice(0, 10)}.`,
      `Учеников: ${students?.length ?? 0}.`,
      students?.length
        ? "Ученики: " +
          students
            .map(
              (s: any) =>
                `${s.name} (цена ${s.price_per_lesson ?? "?"}, оплачено ${s.lessons_paid ?? 0}, проведено ${s.lessons_used ?? 0})`,
            )
            .join("; ")
        : "",
      slots?.length ? `Слотов в расписании: ${slots.length}.` : "",
      payments?.length ? `Последних платежей: ${payments.length}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const system: Msg = {
      role: "system",
      content:
        "Ты — дружелюбный ИИ-помощник преподавателя в приложении «Живой Блокнот». Отвечай кратко, по-русски, по делу. Помогай планировать уроки, считать оплаты, давать советы по обучению. Используй данные ниже как контекст:\n\n" +
        ctxText,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [system, ...data.messages],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("Слишком много запросов, попробуйте позже.");
      if (res.status === 402) throw new Error("Закончились кредиты ИИ. Пополните в Settings → Workspace → Usage.");
      throw new Error(`AI ошибка: ${res.status}`);
    }

    const json = await res.json();
    const reply: string = json.choices?.[0]?.message?.content ?? "";
    return { reply };
  });

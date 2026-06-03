import { createServerFn } from "@tanstack/react-start";

type Msg = { role: "user" | "assistant" | "system"; content: string };

export const chatWithAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: Msg[] }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY не настроен");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Собираем контекст: ученики, расписание, финансы, проведённые уроки
    const [{ data: students }, { data: slots }, { data: finance }, { data: lessons }] = await Promise.all([
      supabaseAdmin.from("students").select("id, name, subject, days_per_week"),
      supabaseAdmin.from("schedule_slots").select("student_id, day_of_week, start_time, duration_min"),
      supabaseAdmin.from("finance").select("student_id, amount, currency, is_paid, pay_date").order("created_at", { ascending: false }).limit(30),
      supabaseAdmin.from("lessons_conducted").select("student_id, lessons_done"),
    ]);

    const lessonsByStudent = new Map<string, number>();
    (lessons ?? []).forEach((l: any) => lessonsByStudent.set(l.student_id, (lessonsByStudent.get(l.student_id) ?? 0) + (l.lessons_done ?? 0)));

    const ctxText = [
      `Текущая дата: ${new Date().toISOString().slice(0, 10)}.`,
      `Учеников: ${students?.length ?? 0}.`,
      students?.length
        ? "Ученики: " +
          students
            .map((s: any) => `${s.name} (${s.subject ?? "?"}, ${s.days_per_week ?? 0} р/нед, проведено ${lessonsByStudent.get(s.id) ?? 0})`)
            .join("; ")
        : "",
      slots?.length ? `Слотов в расписании: ${slots.length}.` : "",
      finance?.length
        ? "Финансы: " +
          finance
            .map((f: any) => `${f.amount}${f.currency} ${f.is_paid ? "оплачено" : "не оплачено"}${f.pay_date ? ` к ${f.pay_date}` : ""}`)
            .join("; ")
        : "",
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

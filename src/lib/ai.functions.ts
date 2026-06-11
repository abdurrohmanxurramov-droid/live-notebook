import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getErrorMessage } from "@/lib/utils";

type ToolCall = {
  id: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

const chatInputSchema = z.object({
  userText: z
    .string()
    .trim()
    .min(1, "Сообщение не может быть пустым")
    .max(4000, "Слишком длинное сообщение"),
});

type Msg = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type ActionLog = {
  tool: string;
  args: JsonValue;
  result: JsonValue;
  ok: boolean;
};

// ---------- Tool definitions for the model ----------
const tools = [
  {
    type: "function",
    function: {
      name: "list_students",
      description: "Получить список всех учеников пользователя.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_student",
      description: "Добавить нового ученика.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Имя ученика" },
          subject: { type: "string", description: "Предмет" },
          days_per_week: { type: "number", description: "Сколько раз в неделю занимается" },
          phone: { type: "string", description: "Телефон" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_student",
      description: "Изменить данные ученика по id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          subject: { type: "string" },
          days_per_week: { type: "number" },
          phone: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_student",
      description: "Удалить ученика (мягкое удаление) по id.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_schedule_slot",
      description: "Добавить регулярный слот в расписание ученика.",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          day_of_week: {
            type: "number",
            description: "День недели: 0=пн, 1=вт, 2=ср, 3=чт, 4=пт, 5=сб, 6=вс",
          },
          start_time: { type: "string", description: "Время HH:MM" },
          duration_min: { type: "number" },
        },
        required: ["student_id", "day_of_week", "start_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_schedule",
      description: "Список регулярных слотов расписания.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_schedule_slot",
      description: "Удалить слот расписания по id.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_lesson",
      description: "Добавить разовый урок.",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          scheduled_date: { type: "string", description: "YYYY-MM-DD" },
          scheduled_time: { type: "string", description: "HH:MM" },
          duration_min: { type: "number" },
          status: { type: "string", description: "planned|done|cancelled|moved" },
          notes: { type: "string" },
        },
        required: ["student_id", "scheduled_date", "scheduled_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_lessons",
      description: "Список уроков в диапазоне дат.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lesson_status",
      description: "Обновить статус урока.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, status: { type: "string" } },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_finance",
      description: "Добавить финансовую запись (оплату/начисление).",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string", description: "RUB|USD|USDT|EGP" },
          is_paid: { type: "boolean" },
          pay_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["student_id", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_finance",
      description: "Последние финансовые записи.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_attendance",
      description: "Отметить посещение ученика на дату.",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", description: "present|absent|excused|rescheduled_by_teacher" },
          note: { type: "string" },
        },
        required: ["student_id", "date", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_homework",
      description: "Назначить домашнее задание ученику.",
      parameters: {
        type: "object",
        properties: {
          student_id: { type: "string" },
          task: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", description: "assigned|done|skipped" },
          note: { type: "string" },
        },
        required: ["student_id", "task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_homework",
      description: "Список последних домашних заданий.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
  },
];

// ---------- Tool executor ----------
async function execTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  switch (name) {
    case "list_students": {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, subject, days_per_week, phone")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data;
    }
    case "add_student": {
      const { data, error } = await supabase
        .from("students")
        .insert({
          owner_id: userId,
          name: args.name,
          subject: args.subject ?? null,
          days_per_week: args.days_per_week ?? 1,
          phone: args.phone ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "update_student": {
      const { id, ...rest } = args;
      const { data, error } = await supabase
        .from("students")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "delete_student": {
      const { error } = await supabase
        .from("students")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
      return { ok: true };
    }
    case "add_schedule_slot": {
      // 0=Пн..6=Вс. Защитно нормализуем, если модель вернула 7 (Вс в 1-based).
      let dow = Number(args.day_of_week);
      if (dow === 7) dow = 6;
      if (dow < 0 || dow > 6) throw new Error("day_of_week вне диапазона 0..6");
      const { data, error } = await supabase
        .from("schedule_slots")
        .insert({
          owner_id: userId,
          student_id: args.student_id,
          day_of_week: dow,
          start_time: args.start_time,
          duration_min: args.duration_min ?? 60,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "list_schedule": {
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, student_id, day_of_week, start_time, duration_min")
        .is("deleted_at", null)
        .order("day_of_week");
      if (error) throw error;
      return data;
    }
    case "delete_schedule_slot": {
      const { error } = await supabase
        .from("schedule_slots")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
      return { ok: true };
    }
    case "add_lesson": {
      const { data, error } = await supabase
        .from("lessons")
        .insert({
          owner_id: userId,
          student_id: args.student_id,
          scheduled_date: args.scheduled_date,
          scheduled_time: args.scheduled_time,
          duration_min: args.duration_min ?? 60,
          status: args.status ?? "planned",
          notes: args.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "list_lessons": {
      let q = supabase
        .from("lessons")
        .select("id, student_id, scheduled_date, scheduled_time, duration_min, status, notes")
        .is("deleted_at", null);
      if (args.from) q = q.gte("scheduled_date", args.from);
      if (args.to) q = q.lte("scheduled_date", args.to);
      const { data, error } = await q.order("scheduled_date").limit(200);
      if (error) throw error;
      return data;
    }
    case "update_lesson_status": {
      const { data, error } = await supabase
        .from("lessons")
        .update({ status: args.status })
        .eq("id", args.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "add_finance": {
      const { data, error } = await supabase
        .from("finance")
        .insert({
          owner_id: userId,
          student_id: args.student_id,
          amount: args.amount,
          currency: args.currency ?? "RUB",
          is_paid: args.is_paid ?? false,
          pay_date: args.pay_date ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "list_finance": {
      const { data, error } = await supabase
        .from("finance")
        .select("id, student_id, amount, currency, is_paid, pay_date, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(args.limit ?? 50);
      if (error) throw error;
      return data;
    }
    case "mark_attendance": {
      const { data, error } = await supabase
        .from("attendance")
        .insert({
          owner_id: userId,
          student_id: args.student_id,
          date: args.date,
          status: args.status,
          note: args.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "add_homework": {
      const { data, error } = await supabase
        .from("homework")
        .insert({
          owner_id: userId,
          student_id: args.student_id,
          task: args.task,
          due_date: args.due_date ?? null,
          status: args.status ?? "assigned",
          note: args.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "list_homework": {
      const { data, error } = await supabase
        .from("homework")
        .select("id, student_id, task, due_date, status, assigned_date")
        .is("deleted_at", null)
        .order("assigned_date", { ascending: false })
        .limit(args.limit ?? 50);
      if (error) throw error;
      return data;
    }
    default:
      throw new Error(`Неизвестный инструмент: ${name}`);
  }
}

export const chatWithAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => chatInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY не настроен");

    const { supabase, userId } = context;

    // 1. Сохраняем сообщение пользователя
    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: data.userText,
    });

    // 2. Загружаем последние 60 сообщений (история)
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content, tool_calls, tool_call_id, name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);

    const prior = (history ?? []).reverse().map((message) => {
      const msg: Msg = {
        role: message.role as Msg["role"],
        content: message.content ?? "",
      };
      if (Array.isArray(message.tool_calls)) {
        msg.tool_calls = message.tool_calls as unknown as ToolCall[];
      }
      if (message.tool_call_id) msg.tool_call_id = message.tool_call_id;
      if (message.name) msg.name = message.name;
      return msg;
    });

    // 3. Собираем богатый контекст
    const [{ data: students }, { data: slots }, { data: settings }] = await Promise.all([
      supabase.from("students").select("id, name, subject, days_per_week").is("deleted_at", null),
      supabase
        .from("schedule_slots")
        .select("student_id, day_of_week, start_time, duration_min")
        .is("deleted_at", null),
      supabase
        .from("user_settings")
        .select("default_currency, default_lesson_price, default_lesson_duration")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekday = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][today.getDay()];
    const dayNames = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

    const studentsStr =
      (students ?? [])
        .map(
          (student) =>
            `- ${student.name} [id=${student.id}] ${student.subject ?? "?"}, ${student.days_per_week ?? 0} р/нед`,
        )
        .join("\n") || "(пока нет учеников)";

    const slotsStr =
      (slots ?? [])
        .map(
          (slot) =>
            `- ${dayNames[slot.day_of_week]} ${slot.start_time} (${slot.duration_min}мин) ученик=${slot.student_id}`,
        )
        .join("\n") || "(расписание пустое)";

    const settingsStr = settings
      ? `Валюта по умолчанию: ${settings.default_currency}, цена урока: ${settings.default_lesson_price}, длительность: ${settings.default_lesson_duration}мин`
      : "Настройки не заданы";

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const system = {
      role: "system" as const,
      content: `Ты — самостоятельный ИИ-агент-секретарь преподавателя в приложении «Живой Блокнот». Действуй как Claude/Grok: думай пошагово, проактивно выполняй задачи, используй инструменты без лишних вопросов.

ПРИНЦИПЫ:
1. ДЕЙСТВУЙ. Если пользователь просит что-то сделать — делай это через инструменты, а не описывай словами. Можно вызывать несколько инструментов подряд.
2. ПОМНИ КОНТЕКСТ. Ты видишь всю историю переписки — ссылайся на прошлые договорённости, имена, факты.
3. ПОДСТАВЛЯЙ РАЗУМНЫЕ ДЕФОЛТЫ. Длительность 60мин, валюта/цена из настроек, время не указано — ставь 18:00.
4. РАЗРЕШАЙ НЕОДНОЗНАЧНОСТЬ. "завтра"=${tomorrow}, "на этой неделе" — текущая неделя.
5. ЦЕПОЧКИ. "Добавь Машу на вт/чт 18:00 и поставь урок завтра" → add_student → add_schedule_slot ×2 → add_lesson.
6. КОРОТКО ПОДТВЕРЖДАЙ. После действий — 1-2 строки итога, без воды.
7. УЧЕНИК НЕ НАЙДЕН? Создавай через add_student сам, не спрашивай разрешения.
8. По-русски, по делу, без бюрократии.

ДНИ НЕДЕЛИ: 1=пн 2=вт 3=ср 4=чт 5=пт 6=сб 7=вс. ВРЕМЯ: HH:MM (24ч).

═══ КОНТЕКСТ ═══
Сегодня: ${todayStr} (${weekday})
${settingsStr}

УЧЕНИКИ:
${studentsStr}

РАСПИСАНИЕ (регулярные слоты):
${slotsStr}`,
    };

    const messages: Msg[] = [system, ...prior];
    const actions: ActionLog[] = [];
    const MAX_STEPS = 10;
    let finalReply = "";

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Слишком много запросов, попробуйте позже.");
        if (res.status === 402)
          throw new Error("Закончились кредиты ИИ. Пополните в Settings → Workspace → Usage.");
        const t = await res.text().catch(() => "");
        throw new Error(`AI ошибка ${res.status}: ${t.slice(0, 200)}`);
      }

      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error("Пустой ответ AI");

      messages.push(msg);

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        finalReply = msg.content ?? "";
        await supabase.from("chat_messages").insert({
          user_id: userId,
          role: "assistant",
          content: finalReply,
        });
        return { reply: finalReply, actions };
      }

      // Сохраняем сообщение ассистента с tool_calls
      await supabase.from("chat_messages").insert({
        user_id: userId,
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        const fname = tc.function?.name;
        let fargs: Record<string, unknown> = {};
        try {
          fargs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          fargs = {};
        }
        let result: unknown;
        let ok = true;
        try {
          result = await execTool(fname, fargs, supabase, userId);
        } catch (error: unknown) {
          ok = false;
          result = { error: getErrorMessage(error, String(error)) };
        }
        actions.push({ tool: fname, args: fargs as JsonValue, result: result as JsonValue, ok });
        const toolContent = JSON.stringify(result).slice(0, 4000);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolContent,
        });
        await supabase.from("chat_messages").insert({
          user_id: userId,
          role: "tool",
          content: toolContent,
          tool_call_id: tc.id,
          name: fname,
        });
      }
    }

    finalReply = "Достигнут лимит шагов. Уточните запрос.";
    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: finalReply,
    });
    return { reply: finalReply, actions };
  });

export const getChatHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data ?? []).filter((message) => message.content && message.content.trim().length > 0);
  });

export const clearChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
  name?: string;
};

type ActionLog = { tool: string; args: any; result: any; ok: boolean };

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
          day_of_week: { type: "number", description: "1=пн ... 7=вс" },
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
async function execTool(name: string, args: any, supabase: any, userId: string) {
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
      const { data, error } = await supabase.from("students").update(rest).eq("id", id).select().single();
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
      const { data, error } = await supabase
        .from("schedule_slots")
        .insert({
          owner_id: userId,
          student_id: args.student_id,
          day_of_week: args.day_of_week,
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
  .inputValidator((input: { messages: Msg[] }) => input)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY не настроен");

    const { supabase, userId } = context;

    // Build initial context: list of students with ids so model can address them
    const { data: students } = await supabase
      .from("students")
      .select("id, name, subject, days_per_week")
      .is("deleted_at", null);

    const today = new Date().toISOString().slice(0, 10);
    const studentsStr =
      (students ?? [])
        .map((s: any) => `- ${s.name} (id=${s.id}, ${s.subject ?? "?"}, ${s.days_per_week ?? 0} р/нед)`)
        .join("\n") || "(пока нет учеников)";

    const system: Msg = {
      role: "system",
      content: `Ты — умный ИИ-помощник преподавателя в приложении «Живой Блокнот». Ты можешь не только советовать, но и САМ выполнять действия через инструменты: добавлять учеников, ставить уроки в расписание, отмечать оплаты, посещения, выдавать домашки.

ПРАВИЛА:
- Отвечай по-русски, кратко, по делу.
- Если пользователь просит что-то сделать — сразу вызывай нужные инструменты, не переспрашивай каждую мелочь, если можно разумно подставить значения по умолчанию.
- Для действий с конкретным учеником сначала найди его id в списке ниже. Если ученика нет — создай его через add_student.
- Можно вызывать несколько инструментов подряд (например: добавить ученика → создать слот в расписании → выдать домашку).
- После выполнения действий коротко подтверди что сделано.
- Дни недели: 1=пн, 2=вт, 3=ср, 4=чт, 5=пт, 6=сб, 7=вс.
- Время — в формате HH:MM (24ч).

Сегодня: ${today}.
Ученики:
${studentsStr}`,
    };

    const messages: any[] = [system, ...data.messages];
    const actions: ActionLog[] = [];
    const MAX_STEPS = 8;

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Слишком много запросов, попробуйте позже.");
        if (res.status === 402) throw new Error("Закончились кредиты ИИ. Пополните в Settings → Workspace → Usage.");
        const t = await res.text().catch(() => "");
        throw new Error(`AI ошибка ${res.status}: ${t.slice(0, 200)}`);
      }

      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error("Пустой ответ AI");

      messages.push(msg);

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return { reply: msg.content ?? "", actions };
      }

      // Execute each tool call
      for (const tc of toolCalls) {
        const fname = tc.function?.name;
        let fargs: any = {};
        try {
          fargs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          fargs = {};
        }
        let result: any;
        let ok = true;
        try {
          result = await execTool(fname, fargs, supabase, userId);
        } catch (e: any) {
          ok = false;
          result = { error: e?.message ?? String(e) };
        }
        actions.push({ tool: fname, args: fargs, result, ok });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
    }

    return {
      reply: "Достигнут лимит шагов. Попробуйте уточнить запрос.",
      actions,
    };
  });

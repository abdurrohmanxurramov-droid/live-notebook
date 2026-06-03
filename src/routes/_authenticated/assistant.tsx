import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, Wrench, CheckCircle2, AlertCircle } from "lucide-react";

import { chatWithAssistant } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/assistant")({ component: AssistantPage });

type Action = { tool: string; args: any; result: any; ok: boolean };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[] };

const TOOL_LABELS: Record<string, string> = {
  list_students: "посмотрел учеников",
  add_student: "добавил ученика",
  update_student: "обновил ученика",
  delete_student: "удалил ученика",
  add_schedule_slot: "добавил слот в расписание",
  list_schedule: "посмотрел расписание",
  delete_schedule_slot: "удалил слот",
  add_lesson: "добавил урок",
  list_lessons: "посмотрел уроки",
  update_lesson_status: "изменил статус урока",
  add_finance: "добавил оплату",
  list_finance: "посмотрел финансы",
  mark_attendance: "отметил посещение",
  add_homework: "выдал ДЗ",
  list_homework: "посмотрел ДЗ",
};

function AssistantPage() {
  const chat = useServerFn(chatWithAssistant);
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Привет! Я ваш ИИ-помощник. Могу не только подсказать, но и сам делать дела: добавить ученика, поставить урок в расписание, отметить оплату, выдать ДЗ. Просто скажите что нужно.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const mut = useMutation({
    mutationFn: async (userText: string) => {
      const next: Msg[] = [...messages, { role: "user", content: userText }];
      setMessages(next);
      const payload = next.map(({ role, content }) => ({ role, content }));
      return await chat({ data: { messages: payload } });
    },
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.reply, actions: res.actions }]);
      if (res.actions?.length) {
        // Обновим все связанные кэши
        qc.invalidateQueries();
      }
    },
    onError: (e: Error) =>
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message}` }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mut.isPending]);

  const onSend = () => {
    const t = input.trim();
    if (!t || mut.isPending) return;
    setInput("");
    mut.mutate(t);
  };

  const suggestions = [
    "Добавь ученика Аню, английский, 2 раза в неделю",
    "Поставь Ане урок завтра в 18:00",
    "Кто не оплатил в этом месяце?",
  ];

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col px-4 pt-4">
      <header className="glass mb-3 flex items-center gap-2 rounded-2xl px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-base font-semibold">ИИ-помощник</h1>
          <p className="text-xs text-muted-foreground">Может сам управлять учениками и расписанием</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-accent text-accent-foreground rounded-br-md"
                  : "glass rounded-bl-md"
              }`}
            >
              {m.content}
            </div>
            {m.actions && m.actions.length > 0 && (
              <div className="mt-1 flex max-w-[85%] flex-col gap-1">
                {m.actions.map((a, j) => (
                  <div
                    key={j}
                    className="glass flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  >
                    {a.ok ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-rose-500" />
                    )}
                    <Wrench className="h-3 w-3" />
                    <span>{TOOL_LABELS[a.tool] ?? a.tool}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {mut.isPending && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl rounded-bl-md px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => mut.mutate(s)}
              className="glass rounded-full px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="glass mb-2 flex items-end gap-2 rounded-2xl p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Скажите что сделать…"
          rows={1}
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || mut.isPending}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground transition disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

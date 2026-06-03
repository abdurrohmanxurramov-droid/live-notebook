import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";

import { chatWithAssistant } from "@/lib/ai.functions";

export const Route = createFileRoute("/assistant")({ component: AssistantPage });

type Msg = { role: "user" | "assistant"; content: string };

function AssistantPage() {
  const chat = useServerFn(chatWithAssistant);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Привет! Я ваш ИИ-помощник. Спросите о расписании, оплатах, прогрессе учеников — или попросите идею для урока.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const mut = useMutation({
    mutationFn: async (userText: string) => {
      const next: Msg[] = [...messages, { role: "user", content: userText }];
      setMessages(next);
      const res = await chat({ data: { messages: next } });
      return res.reply;
    },
    onSuccess: (reply) => setMessages((m) => [...m, { role: "assistant", content: reply }]),
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
    "Сколько ученикам осталось уроков?",
    "Кто не оплатил в этом месяце?",
    "Идея для урока английского для подростка",
  ];

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col px-4 pt-4">
      <header className="glass mb-3 flex items-center gap-2 rounded-2xl px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-base font-semibold">ИИ-помощник</h1>
          <p className="text-xs text-muted-foreground">Знает ваших учеников и расписание</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-accent text-accent-foreground rounded-br-md"
                  : "glass rounded-bl-md"
              }`}
            >
              {m.content}
            </div>
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
          placeholder="Спросите что-нибудь…"
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

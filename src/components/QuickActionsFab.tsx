import { useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { Plus, GraduationCap, Wallet, CalendarCheck, BookOpen, CalendarDays } from "lucide-react";
import { Sheet } from "./Sheet";
import { QuickCreateLessonSheet } from "./calendar/QuickCreateLessonSheet";

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Hide on auth pages just in case
  if (pathname.startsWith("/auth")) return null;

  const actions = [
    { icon: GraduationCap, label: "Добавить ученика", hint: "Новая карточка", onClick: () => navigate({ to: "/students", search: { new: 1 } as any }) },
    { icon: Wallet, label: "Добавить платёж", hint: "Финансы", onClick: () => navigate({ to: "/finance" }) },
    { icon: CalendarCheck, label: "Отметить посещаемость", hint: "Журнал", onClick: () => navigate({ to: "/attendance" }) },
    { icon: BookOpen, label: "Добавить ДЗ", hint: "Домашнее задание", onClick: () => navigate({ to: "/homework", search: { new: 1 } as any }) },
    { icon: CalendarDays, label: "Запланировать урок", hint: "Быстрое создание", onClick: () => { setOpen(false); setLessonOpen(true); } },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Быстрые действия"
        className="md:hidden fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg active:scale-95 transition-transform"
        style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Быстрые действия">
        <div className="grid gap-2">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                style={{ animationDelay: `${60 + i * 55}ms` }}
                onClick={() => { a.onClick(); if (a.label !== "Запланировать урок") setOpen(false); }}
                className="stagger-item group flex items-center gap-3 rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur-xl p-3 text-left transition-all hover:bg-white/85 dark:hover:bg-white/10 active:scale-[0.98] min-h-[64px]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold text-foreground">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <QuickCreateLessonSheet open={lessonOpen} onClose={() => setLessonOpen(false)} />
    </>
  );
}

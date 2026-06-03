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
                className="stagger-item group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur-xl p-3 text-left min-h-[64px] ring-1 ring-white/40 dark:ring-white/10 shadow-[0_8px_24px_-12px_rgba(20,33,61,0.18)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/85 dark:hover:bg-white/10 hover:shadow-[0_14px_32px_-12px_rgba(20,33,61,0.28)] active:scale-[0.98]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/10"
                />
                <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="relative flex flex-col">
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

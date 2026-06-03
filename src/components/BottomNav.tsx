import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  Home,
  GraduationCap,
  CalendarCheck,
  Wallet,
  Settings,
  CalendarDays,
  BarChart3,
  BookOpen,
  Sparkles,
  MoreHorizontal,
} from "lucide-react";
import { Sheet } from "./Sheet";

const mainTabs = [
  { to: "/", label: "Главная", icon: Home },
  { to: "/schedule", label: "Распис.", icon: CalendarDays },
  { to: "/students", label: "Ученики", icon: GraduationCap },
  { to: "/finance", label: "Финансы", icon: Wallet },
] as const;

const moreTabs = [
  { to: "/attendance", label: "Журнал", icon: CalendarCheck, hint: "Посещаемость" },
  { to: "/homework", label: "Домашние задания", icon: BookOpen, hint: "Список и статусы" },
  { to: "/analytics", label: "Аналитика", icon: BarChart3, hint: "Сводка и графики" },
  { to: "/assistant", label: "ИИ-помощник", icon: Sparkles, hint: "Подсказки и расчёты" },
  { to: "/settings", label: "Настройки", icon: Settings, hint: "Тема, push, курсы" },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const moreActive = moreTabs.some((t) => t.to === pathname);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-bottom pointer-events-none">
        <nav className="glass-strong pointer-events-auto mx-auto max-w-2xl rounded-[28px]">
          <ul className="flex items-stretch justify-between px-1.5 py-1">
            {mainTabs.map((t) => {
              const active = pathname === t.to;
              const Icon = t.icon;
              return (
                <li key={t.to} className="flex-1">
                  <Link
                    to={t.to}
                    className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl transition-all ${
                      active ? "bg-white/50 dark:bg-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]" : ""
                    }`}
                  >
                    <Icon
                      className={`h-[18px] w-[18px] transition-colors ${
                        active ? "text-accent" : "text-muted-foreground"
                      }`}
                      strokeWidth={active ? 2.4 : 1.8}
                    />
                    <span
                      className={`text-[10px] font-medium tracking-wide transition-colors ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {t.label}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl transition-all ${
                  moreActive ? "bg-white/50 dark:bg-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]" : ""
                }`}
              >
                <MoreHorizontal
                  className={`h-[18px] w-[18px] transition-colors ${moreActive ? "text-accent" : "text-muted-foreground"}`}
                  strokeWidth={moreActive ? 2.4 : 1.8}
                />
                <span
                  className={`text-[10px] font-medium tracking-wide transition-colors ${
                    moreActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  Ещё
                </span>
              </button>
            </li>
          </ul>
        </nav>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Ещё">
        <div className="grid gap-2">
          {moreTabs.map((t) => {
            const Icon = t.icon;
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-2xl p-3 transition-colors ${
                  active ? "bg-accent/15" : "bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10"
                }`}
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-col text-left">
                  <span className="text-[15px] font-semibold text-foreground">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.hint}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

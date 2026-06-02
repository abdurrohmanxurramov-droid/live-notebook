import { Link, useLocation } from "@tanstack/react-router";
import { Home, GraduationCap, CalendarCheck, Wallet, Settings, CalendarDays, BarChart3, BookOpen, Sparkles } from "lucide-react";

const tabs = [
  { to: "/", label: "Главная", icon: Home },
  { to: "/schedule", label: "Распис.", icon: CalendarDays },
  { to: "/students", label: "Ученики", icon: GraduationCap },
  { to: "/attendance", label: "Журнал", icon: CalendarCheck },
  { to: "/homework", label: "ДЗ", icon: BookOpen },
  { to: "/finance", label: "Финансы", icon: Wallet },
  { to: "/analytics", label: "Анализ", icon: BarChart3 },
  { to: "/assistant", label: "ИИ", icon: Sparkles },
  { to: "/settings", label: "Ещё", icon: Settings },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-bottom pointer-events-none">
      <nav className="glass-strong pointer-events-auto mx-auto max-w-2xl rounded-[28px]">
        <ul className="flex items-stretch justify-between px-1.5 py-1">
          {tabs.map((t) => {
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
        </ul>
      </nav>
    </div>
  );
}

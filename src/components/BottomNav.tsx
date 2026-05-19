import { Link, useLocation } from "@tanstack/react-router";
import { Home, GraduationCap, CalendarCheck, Wallet, Settings, CalendarDays, BarChart3, BookOpen } from "lucide-react";

const tabs = [
  { to: "/", label: "Главная", icon: Home },
  { to: "/schedule", label: "Распис.", icon: CalendarDays },
  { to: "/students", label: "Ученики", icon: GraduationCap },
  { to: "/attendance", label: "Журнал", icon: CalendarCheck },
  { to: "/homework", label: "ДЗ", icon: BookOpen },
  { to: "/finance", label: "Финансы", icon: Wallet },
  { to: "/analytics", label: "Анализ", icon: BarChart3 },
  { to: "/settings", label: "Ещё", icon: Settings },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-xl safe-bottom">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {tabs.map((t) => {
          const active = pathname === t.to;
          const Icon = t.icon;
          return (
            <li key={t.to} className="flex-1">
              <Link
                to={t.to}
                className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl transition-colors"
              >
                <Icon
                  className={`h-5 w-5 transition-colors ${
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
  );
}

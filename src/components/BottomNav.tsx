import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  
  GraduationCap,
  CalendarCheck,
  Wallet,
  Settings,
  CalendarDays,
  BarChart3,
  BookOpen,
  Sparkles,
  MoreHorizontal,
  FileText,
} from "lucide-react";
import { Sheet } from "./Sheet";
import { sb } from "@/lib/sb";

const mainTabs = [
  
  { to: "/schedule", label: "Распис.", icon: CalendarDays },
  { to: "/students", label: "Ученики", icon: GraduationCap },
  { to: "/finance", label: "Финансы", icon: Wallet },
] as const;

const moreTabs = [
  { to: "/attendance", label: "Журнал", icon: CalendarCheck, hint: "Посещаемость" },
  { to: "/homework", label: "Домашние задания", icon: BookOpen, hint: "Список и статусы" },
  { to: "/reports", label: "Отчёты", icon: FileText, hint: "Печать и PDF" },
  { to: "/analytics", label: "Аналитика", icon: BarChart3, hint: "Сводка и графики" },
  { to: "/assistant", label: "ИИ-помощник", icon: Sparkles, hint: "Подсказки и расчёты" },
  { to: "/settings", label: "Настройки", icon: Settings, hint: "Тема, push, курсы" },
] as const;

const allKeys = [...mainTabs.map((t) => t.to), "__more__"] as const;
type Key = (typeof allKeys)[number];

export function BottomNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const moreActive = moreTabs.some((t) => t.to === pathname);
  const activeKey: Key = moreActive
    ? "__more__"
    : ((mainTabs.find((t) => t.to === pathname)?.to as Key) ?? "/");

  // Overdue indicator for Finance tab
  const { data: overdueCount = 0 } = useQuery({
    queryKey: ["finance", "overdue-count"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count, error } = await (await sb())
        .from("finance")
        .select("id", { count: "exact", head: true })
        .eq("is_paid", false)
        .is("deleted_at", null)
        .lt("pay_date", today);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<Key, HTMLLIElement>>(new Map());
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [targetKey, setTargetKey] = useState<Key>(activeKey);

  // Sync optimistic target back to actual route (back/forward, external nav)
  useEffect(() => {
    setTargetKey(activeKey);
  }, [activeKey]);

  useLayoutEffect(() => {
    const el = itemRefs.current.get(targetKey);
    if (!el) return;
    setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    const t = setTimeout(() => setReady(true), 30);
    return () => clearTimeout(t);
  }, [targetKey]);

  useEffect(() => {
    const onResize = () => {
      const el = itemRefs.current.get(targetKey);
      if (!el) return;
      setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [targetKey]);

  const setRef = (key: Key) => (node: HTMLLIElement | null) => {
    if (node) itemRefs.current.set(key, node);
    else itemRefs.current.delete(key);
  };

  const moveTo = (key: Key) => () => setTargetKey(key);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 [--safe-bottom-offset:0.75rem] safe-bottom pointer-events-none">
        <nav className="glass-strong pointer-events-auto mx-auto max-w-2xl rounded-[28px]">
          <ul ref={listRef} className="relative flex items-stretch px-1.5 py-1">
            {indicator && (
              <span
                aria-hidden
                className="liquid-pill pointer-events-none absolute top-1 bottom-1 rounded-[22px]"
                style={{
                  transform: `translateX(${indicator.x - 6}px)`,
                  width: indicator.w,
                  transition: ready
                    ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1)"
                    : "none",
                }}
              />
            )}

            {mainTabs.map((t) => {
              const active = pathname === t.to;
              const Icon = t.icon;
              return (
                <li key={t.to} ref={setRef(t.to as Key)} className="relative z-10 flex-1">
                  <Link
                    to={t.to}
                    onPointerDown={moveTo(t.to as Key)}
                    className="relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl"
                  >
                    <span className="relative">
                      <Icon
                        className={`h-[18px] w-[18px] transition-all duration-500 ${
                          active ? "text-accent scale-110" : "text-muted-foreground scale-100"
                        }`}
                        strokeWidth={active ? 2.4 : 1.8}
                      />
                      {t.to === "/finance" && overdueCount > 0 && (
                        <span
                          aria-label={`Просрочено платежей: ${overdueCount}`}
                          className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-background"
                        >
                          {overdueCount > 9 ? "9+" : overdueCount}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[10px] font-medium tracking-wide transition-colors duration-500 ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {t.label}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li ref={setRef("__more__")} className="relative z-10 flex-1">
              <button
                type="button"
                onPointerDown={moveTo("__more__")}
                onClick={() => setOpen(true)}
                className="relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl"
              >
                <MoreHorizontal
                  className={`h-[18px] w-[18px] transition-all duration-500 ${
                    moreActive ? "text-accent scale-110" : "text-muted-foreground scale-100"
                  }`}
                  strokeWidth={moreActive ? 2.4 : 1.8}
                />
                <span
                  className={`text-[10px] font-medium tracking-wide transition-colors duration-500 ${
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
          {moreTabs.map((t, i) => {
            const Icon = t.icon;
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setOpen(false)}
                style={{ animationDelay: `${60 + i * 55}ms` }}
                className={`stagger-item group relative flex items-center gap-3 overflow-hidden rounded-2xl p-3 transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.98] ${
                  active
                    ? "bg-accent/15 ring-1 ring-accent/30"
                    : "bg-white/60 dark:bg-white/5 hover:bg-white/85 dark:hover:bg-white/10 backdrop-blur-xl"
                }`}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/10"
                />
                <span
                  className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${
                    active ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="relative flex flex-col text-left">
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

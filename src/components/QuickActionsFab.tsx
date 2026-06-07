import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { Plus, GraduationCap, Wallet, CalendarCheck, BookOpen, CalendarDays } from "lucide-react";
import { Sheet } from "./Sheet";
import { QuickCreateLessonSheet } from "./calendar/QuickCreateLessonSheet";

type Pos = { x: number; y: number };

const STORAGE_KEY = "fab-position-v1";
const FAB_SIZE = 56;
const EDGE_PADDING = 12;
const BOTTOM_NAV_OFFSET = 96; // bottom nav height + breathing room

function getDefaultPos(): Pos {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const safeBottom =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sai-bottom") || "0",
    ) || 0;
  return {
    x: window.innerWidth - FAB_SIZE - 16,
    y: window.innerHeight - FAB_SIZE - BOTTOM_NAV_OFFSET - safeBottom,
  };
}

function clampPos(p: Pos): Pos {
  if (typeof window === "undefined") return p;
  const maxX = window.innerWidth - FAB_SIZE - EDGE_PADDING;
  const maxY = window.innerHeight - FAB_SIZE - EDGE_PADDING;
  return {
    x: Math.min(Math.max(EDGE_PADDING, p.x), maxX),
    y: Math.min(Math.max(EDGE_PADDING, p.y), maxY),
  };
}

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragInfo = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Init position from storage or default
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Pos;
        setPos(clampPos(saved));
        return;
      }
    } catch {
      // Ignore malformed saved positions and use the default.
    }
    setPos(getDefaultPos());
  }, []);

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (pathname.startsWith("/auth")) return null;

  const actions = [
    {
      icon: GraduationCap,
      label: "Добавить ученика",
      hint: "Новая карточка",
      onClick: () => navigate({ href: "/students?new=1" }),
    },
    {
      icon: Wallet,
      label: "Добавить платёж",
      hint: "Финансы",
      onClick: () => navigate({ to: "/finance" }),
    },
    {
      icon: CalendarCheck,
      label: "Отметить посещаемость",
      hint: "Журнал",
      onClick: () => navigate({ to: "/attendance" }),
    },
    {
      icon: BookOpen,
      label: "Добавить ДЗ",
      hint: "Домашнее задание",
      onClick: () => {
        setOpen(false);
        navigate({ href: "/homework?new=1" });
      },
    },
    {
      icon: CalendarDays,
      label: "Запланировать урок",
      hint: "Быстрое создание",
      onClick: () => {
        setOpen(false);
        setLessonOpen(true);
      },
    },
  ];

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    dragInfo.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    if (!info) return;
    const dx = e.clientX - info.startX;
    const dy = e.clientY - info.startY;
    if (!info.moved && Math.hypot(dx, dy) < 6) return;
    if (!info.moved) {
      info.moved = true;
      setDragging(true);
    }
    setPos(clampPos({ x: info.origX + dx, y: info.origY + dy }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    if (!info) return;
    try {
      (e.currentTarget as HTMLButtonElement).releasePointerCapture(info.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    const wasDrag = info.moved;
    dragInfo.current = null;
    setDragging(false);
    if (wasDrag) {
      // snap to nearest horizontal edge
      const snapped = clampPos({
        x:
          (pos?.x ?? 0) + FAB_SIZE / 2 < window.innerWidth / 2
            ? EDGE_PADDING
            : window.innerWidth - FAB_SIZE - EDGE_PADDING,
        y: pos?.y ?? 0,
      });
      setPos(snapped);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
      } catch {
        // Storage can be unavailable in private browsing contexts.
      }
    } else {
      setOpen(true);
    }
  };

  if (!pos) return null;

  return (
    <>
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Быстрые действия (можно перетаскивать)"
        className={`fixed z-40 group flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground overflow-hidden ring-1 ring-white/40 shadow-[0_12px_30px_-8px_color-mix(in_oklab,var(--accent)_55%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.45)] touch-none select-none ${
          dragging
            ? "scale-110 transition-none cursor-grabbing"
            : "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-105 active:scale-95 cursor-grab"
        }`}
        style={{ left: pos.x, top: pos.y }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/35 via-white/0 to-white/0"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-1 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100"
        />
        <Plus
          className={`relative h-6 w-6 transition-transform duration-300 ${dragging ? "" : "group-hover:rotate-90"}`}
          strokeWidth={2.5}
        />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Быстрые действия">
        <div className="grid gap-2">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                style={{ animationDelay: `${60 + i * 55}ms` }}
                onClick={() => {
                  a.onClick();
                  if (a.label !== "Запланировать урок") setOpen(false);
                }}
                className="liquid-action stagger-item group relative flex min-h-[64px] items-center gap-3 overflow-hidden rounded-2xl p-3 text-left transition-all duration-300 ease-out active:scale-[0.98]"
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

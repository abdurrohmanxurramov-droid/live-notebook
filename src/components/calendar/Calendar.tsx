import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, Badge, Button } from "@/components/ui-bits";
import { Sheet } from "@/components/Sheet";
import { useStudents } from "@/lib/db";
import { listLessons, moveLesson, setLessonStatus, deleteLesson, type LessonStatus } from "@/lib/lessons.functions";
import { QuickCreateLessonSheet } from "./QuickCreateLessonSheet";

type View = "day" | "week" | "month";

type Lesson = {
  id: string;
  student_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_min: number;
  status: LessonStatus;
  notes: string | null;
  moved_from_id: string | null;
};

const STATUS_TONE: Record<LessonStatus, "neutral" | "success" | "danger" | "gold"> = {
  planned: "neutral",
  completed: "success",
  cancelled: "danger",
  moved: "gold",
};
const STATUS_LABEL: Record<LessonStatus, string> = {
  planned: "запланирован",
  completed: "проведён",
  cancelled: "отменён",
  moved: "перенесён",
};

function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Mon
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonthGrid(d: Date) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}

// Получасовые слоты с 08:00 до 22:00 включительно
const SLOTS: { h: number; m: number }[] = (() => {
  const out: { h: number; m: number }[] = [];
  for (let h = 8; h <= 22; h++) { out.push({ h, m: 0 }); if (h < 22) out.push({ h, m: 30 }); }
  return out;
})();
const SLOT_PX = 32;
const HOUR_PX = SLOT_PX * 2;
const BASE_MIN = 8 * 60;
const slotTime = (s: { h: number; m: number }) => `${String(s.h).padStart(2,"0")}:${String(s.m).padStart(2,"0")}`;

export function Calendar() {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [createSlot, setCreateSlot] = useState<{ date: string; time: string } | null>(null);
  const [active, setActive] = useState<Lesson | null>(null);
  const [moreDay, setMoreDay] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    if (view === "day") return { from: iso(cursor), to: iso(cursor) };
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { from: iso(s), to: iso(addDays(s, 6)) };
    }
    const s = startOfMonthGrid(cursor);
    return { from: iso(s), to: iso(addDays(s, 41)) };
  }, [view, cursor]);

  const list = useServerFn(listLessons);
  const { data, isLoading } = useQuery({
    queryKey: ["lessons", from, to],
    queryFn: () => list({ data: { from, to } }),
  });
  const lessons = (data?.lessons ?? []) as Lesson[];
  const { data: students = [] } = useStudents();
  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? "—";

  const qc = useQueryClient();
  const move = useServerFn(moveLesson);
  const setStatus = useServerFn(setLessonStatus);
  const del = useServerFn(deleteLesson);

  async function handleDrop(id: string, newDate: string, newTime: string) {
    try {
      await move({ data: { id, new_date: newDate, new_time: newTime } });
      qc.invalidateQueries({ queryKey: ["lessons"] });
      toast.success("Урок перенесён");
    } catch (e: any) {
      toast.error(e?.message ?? "Ошибка переноса");
    }
  }

  const label = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions =
      view === "month" ? { month: "long", year: "numeric" }
      : view === "week" ? { day: "numeric", month: "short" }
      : { weekday: "short", day: "numeric", month: "long" };
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString("ru-RU", opts)} – ${e.toLocaleDateString("ru-RU", opts)}`;
    }
    return cursor.toLocaleDateString("ru-RU", opts);
  }, [view, cursor]);

  const step = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  return (
    <>
    <Card className="mt-4 p-3">
      <div className="mb-2 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground capitalize">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="rounded-full p-2 hover:bg-secondary" aria-label="Назад"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setCursor(new Date(new Date().setHours(0,0,0,0)))} className="rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-secondary">Сегодня</button>
          <button onClick={() => step(1)} className="rounded-full p-2 hover:bg-secondary" aria-label="Вперёд"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <CalendarViewPill view={view} setView={setView} />
      </div>


      <div className="mt-3 pb-2">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-secondary/60" />
        ) : view === "day" ? (
          <DayView date={iso(cursor)} lessons={lessons} studentName={studentName} onDrop={handleDrop} onSlot={setCreateSlot} onLesson={setActive} />
        ) : view === "week" ? (
          <WeekView start={startOfWeek(cursor)} lessons={lessons} studentName={studentName} onDrop={handleDrop} onSlot={setCreateSlot} onLesson={setActive} />
        ) : (
          <MonthView start={startOfMonthGrid(cursor)} cursor={cursor} lessons={lessons} studentName={studentName} onDrop={handleDrop} onSlot={(d) => setCreateSlot({ date: d, time: "10:00" })} onMore={setMoreDay} onLesson={setActive} />
        )}
      </div>


      <QuickCreateLessonSheet
        open={!!createSlot}
        onClose={() => setCreateSlot(null)}
        initialDate={createSlot?.date}
        initialTime={createSlot?.time}
      />

      <Sheet open={!!active} onClose={() => setActive(null)} title="Урок">
        {active && (
          <div className="grid gap-3">
            <div>
              <div className="text-base font-semibold text-foreground">{studentName(active.student_id)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {active.scheduled_date} · {active.scheduled_time.slice(0,5)} · {active.duration_min} мин
              </div>
              <div className="mt-2"><Badge tone={STATUS_TONE[active.status]}>{STATUS_LABEL[active.status]}</Badge></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["planned","completed","cancelled"] as LessonStatus[]).map((s) => (
                <Button key={s} variant={active.status===s?"gold":"outline"} onClick={async () => {
                  try { await setStatus({ data: { id: active.id, status: s } }); qc.invalidateQueries({ queryKey: ["lessons"] }); toast.success("Статус обновлён"); setActive(null); }
                  catch(e: any){ toast.error(e?.message ?? "Ошибка"); }
                }}>{STATUS_LABEL[s]}</Button>
              ))}
            </div>
            <Button variant="danger" onClick={async () => {
              try { await del({ data: { id: active.id } }); qc.invalidateQueries({ queryKey: ["lessons"] }); toast.success("Урок удалён"); setActive(null); }
              catch(e: any){ toast.error(e?.message ?? "Ошибка"); }
            }}>Удалить</Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!moreDay} onClose={() => setMoreDay(null)} title={moreDay ? `Уроки ${moreDay}` : ""}>
        <div className="grid gap-2">
          {lessons.filter((l) => l.scheduled_date === moreDay).sort((a,b)=>a.scheduled_time.localeCompare(b.scheduled_time)).map((l) => (
            <button key={l.id} onClick={() => { setActive(l); setMoreDay(null); }} className="flex items-center justify-between rounded-xl bg-secondary p-3 text-left">
              <div>
                <div className="text-sm font-semibold text-foreground">{studentName(l.student_id)}</div>
                <div className="text-[11px] text-muted-foreground">{l.scheduled_time.slice(0,5)} · {l.duration_min} мин</div>
              </div>
              <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
            </button>
          ))}
        </div>
      </Sheet>
    </Card>
    </>
  );
}


/* -------------------- VIEW SWITCH -------------------- */

const VIEW_OPTS: { key: View; label: string }[] = [
  { key: "day", label: "День" },
  { key: "week", label: "Нед." },
  { key: "month", label: "Мес." },
];

function CalendarViewPill({ view, setView }: { view: View; setView: (v: View) => void }) {
  const itemRefs = useRef<Map<View, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = itemRefs.current.get(view);
    if (!el) return;
    setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    const t = setTimeout(() => setReady(true), 30);
    return () => clearTimeout(t);
  }, [view]);

  useEffect(() => {
    const onResize = () => {
      const el = itemRefs.current.get(view);
      if (!el) return;
      setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [view]);

  return (
    <div
      className="glass-strong fixed left-1/2 z-40 inline-flex -translate-x-1/2 rounded-full p-1 text-xs"
      style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
    >

      {indicator && (
        <span
          aria-hidden
          className="liquid-pill pointer-events-none absolute top-1 bottom-1 rounded-full"
          style={{
            transform: `translateX(${indicator.x - 4}px)`,
            width: indicator.w,
            transition: ready
              ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
        />
      )}
      {VIEW_OPTS.map((v) => {
        const active = view === v.key;
        return (
          <button
            key={v.key}
            ref={(node) => {
              if (node) itemRefs.current.set(v.key, node);
              else itemRefs.current.delete(v.key);
            }}
            onClick={() => setView(v.key)}
            className={`relative z-10 rounded-full px-3.5 py-1.5 font-semibold transition-colors duration-300 ${active ? "text-foreground" : "text-muted-foreground"}`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------- DAY -------------------- */



function DayView({ date, lessons, studentName, onDrop, onSlot, onLesson }: {
  date: string;
  lessons: Lesson[];
  studentName: (id: string) => string;
  onDrop: (id: string, date: string, time: string) => void;
  onSlot: (s: { date: string; time: string }) => void;
  onLesson: (l: Lesson) => void;
}) {
  const day = lessons.filter((l) => l.scheduled_date === date);
  return (
    <div className="relative rounded-xl border border-border bg-card/40">
      {SLOTS.map((s) => {
        const t = slotTime(s);
        return (
          <SlotRow
            key={t}
            slot={s}
            onClick={() => onSlot({ date, time: t })}
            onDrop={() => { const id = window.__draggingLessonId; if (id) onDrop(id, date, t); }}
          />
        );
      })}
      <div className="pointer-events-none absolute inset-y-0 left-12 right-2">
        {day.map((l) => (
          <PositionedBlock key={l.id} lesson={l} studentName={studentName(l.student_id)} onClick={() => onLesson(l)} />
        ))}
      </div>
    </div>
  );
}

/* -------------------- WEEK -------------------- */

function WeekView({ start, lessons, studentName, onDrop, onSlot, onLesson }: {
  start: Date;
  lessons: Lesson[];
  studentName: (id: string) => string;
  onDrop: (id: string, date: string, time: string) => void;
  onSlot: (s: { date: string; time: string }) => void;
  onLesson: (l: Lesson) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = iso(new Date());

  return (
    <div className="w-full select-none">
      <div className="grid" style={{ gridTemplateColumns: "32px repeat(7, minmax(0,1fr))" }}>
        <div />
        {days.map((d) => {
          const ds = iso(d);
          return (
            <div key={ds} className={`px-0.5 pb-1 text-center text-[10px] font-semibold leading-tight ${ds===today?"text-accent":"text-muted-foreground"}`}>
              {d.toLocaleDateString("ru-RU",{weekday:"short"})}<br/>
              <span className="text-[12px] text-foreground">{d.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="relative grid rounded-xl border border-border bg-card/40" style={{ gridTemplateColumns: "32px repeat(7, minmax(0,1fr))" }}>
        <div>
          {SLOTS.map((s) => (
            <div key={slotTime(s)} className="flex items-start justify-end pr-0.5 text-[9px] text-muted-foreground" style={{ height: SLOT_PX }}>
              {s.m === 0 ? `${s.h}` : ""}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const ds = iso(d);
          const dayLessons = lessons.filter((l) => l.scheduled_date === ds);
          return (
            <div key={ds} className="relative border-l border-border">
              {SLOTS.map((s) => {
                const t = slotTime(s);
                return (
                  <SlotCell
                    key={t}
                    slot={s}
                    onClick={() => onSlot({ date: ds, time: t })}
                    onDrop={() => { const id = window.__draggingLessonId; if (id) onDrop(id, ds, t); }}
                  />
                );
              })}
              <div className="pointer-events-none absolute inset-0">
                {dayLessons.map((l) => (
                  <PositionedBlock key={l.id} lesson={l} studentName={studentName(l.student_id)} onClick={() => onLesson(l)} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------- MONTH -------------------- */

function MonthView({ start, cursor, lessons, studentName, onDrop, onSlot, onMore, onLesson }: {
  start: Date;
  cursor: Date;
  lessons: Lesson[];
  studentName: (id: string) => string;
  onDrop: (id: string, date: string, time: string) => void;
  onSlot: (date: string) => void;
  onMore: (date: string) => void;
  onLesson: (l: Lesson) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = iso(new Date());
  const month = cursor.getMonth();
  return (
    <div className="grid grid-cols-7 gap-1">
      {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => (
        <div key={d} className="pb-1 text-center text-[10px] font-semibold text-muted-foreground">{d}</div>
      ))}
      {days.map((d) => {
        const ds = iso(d);
        const inMonth = d.getMonth() === month;
        const dayLessons = lessons.filter((l) => l.scheduled_date === ds).sort((a,b)=>a.scheduled_time.localeCompare(b.scheduled_time));
        const isToday = ds === today;
        return (
          <div
            key={ds}
            onClick={() => onSlot(ds)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const id = window.__draggingLessonId; if (id) {
              // preserve time of dragged lesson
              const dragged = lessons.find((l) => l.id === id);
              const t = dragged ? dragged.scheduled_time.slice(0,5) : "10:00";
              onDrop(id, ds, t);
            }}}
            className={`group relative min-h-[68px] cursor-pointer overflow-hidden rounded-lg border p-1 text-left transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(20,33,61,0.25)] active:scale-[0.98] ${inMonth?"border-border bg-card/40 hover:bg-card/70":"border-transparent bg-secondary/30 opacity-60"} ${isToday?"ring-1 ring-accent":""}`}
          >
            <div className={`text-[11px] font-semibold ${isToday?"text-accent":"text-foreground"}`}>{d.getDate()}</div>
            <div className="mt-0.5 space-y-0.5">
              {dayLessons.slice(0, 2).map((l) => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={() => { window.__draggingLessonId = l.id; }}
                  onDragEnd={() => { window.__draggingLessonId = null; }}
                  onClick={(e) => { e.stopPropagation(); onLesson(l); }}
                  className={`truncate rounded px-1 text-[9px] font-medium ${toneBg(l.status)}`}
                  title={`${l.scheduled_time.slice(0,5)} ${studentName(l.student_id)}`}
                >
                  {l.scheduled_time.slice(0,5)} {studentName(l.student_id)}
                </div>
              ))}
              {dayLessons.length > 2 && (
                <button onClick={(e) => { e.stopPropagation(); onMore(ds); }} className="text-[9px] font-semibold text-accent">+{dayLessons.length-2} ещё</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- PARTS -------------------- */

function SlotRow({ slot, onClick, onDrop }: { slot: { h: number; m: number }; onClick: () => void; onDrop: () => void }) {
  const isHour = slot.m === 0;
  return (
    <div className={`flex ${isHour ? "border-b border-border" : "border-b border-border/40"} last:border-b-0`} style={{ height: SLOT_PX }}>
      <div className="flex w-12 shrink-0 items-start justify-end pr-1 pt-0.5 text-[10px] text-muted-foreground">
        {isHour ? `${slot.h}:00` : ""}
      </div>
      <button
        type="button"
        onClick={onClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onDrop(); }}
        className="flex-1 hover:bg-accent/5"
        aria-label="Создать урок"
      />
    </div>
  );
}

function SlotCell({ slot, onClick, onDrop }: { slot: { h: number; m: number }; onClick: () => void; onDrop: () => void }) {
  const isHour = slot.m === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={`block w-full ${isHour ? "border-b border-border" : "border-b border-border/40"} hover:bg-accent/5`}
      style={{ height: SLOT_PX }}
    />
  );
}

function PositionedBlock({ lesson, studentName, onClick, compact }: {
  lesson: Lesson;
  studentName: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const [hh, mm] = lesson.scheduled_time.slice(0,5).split(":").map(Number);
  const startMin = hh * 60 + mm;
  const top = ((startMin - BASE_MIN) / 30) * SLOT_PX;
  const height = Math.max(SLOT_PX - 2, (lesson.duration_min / 30) * SLOT_PX - 2);
  if (top < 0 || top > SLOTS.length * SLOT_PX) return null;
  return (
    <div
      draggable
      onDragStart={() => { window.__draggingLessonId = lesson.id; }}
      onDragEnd={() => { window.__draggingLessonId = null; }}
      onClick={onClick}
      style={{ top, height, left: 2, right: 2 }}
      className={`pointer-events-auto absolute cursor-grab overflow-hidden rounded-md px-1.5 py-1 text-[10px] font-semibold shadow-sm active:cursor-grabbing ${toneBg(lesson.status)}`}
    >
      <div className="truncate">{lesson.scheduled_time.slice(0,5)} {studentName}</div>
      {!compact && height > 32 && (
        <div className="mt-0.5 truncate text-[9px] opacity-80">{STATUS_LABEL[lesson.status]} · {lesson.duration_min} мин</div>
      )}
    </div>
  );
}

function toneBg(s: LessonStatus) {
  switch (s) {
    case "planned": return "bg-accent/20 text-accent-foreground border border-accent/30";
    case "completed": return "bg-[color:var(--success)]/20 text-foreground border border-[color:var(--success)]/30";
    case "cancelled": return "bg-destructive/20 text-foreground border border-destructive/30";
    case "moved": return "bg-secondary text-foreground border border-border";
  }
}

declare global {
  interface Window { __draggingLessonId: string | null; }
}

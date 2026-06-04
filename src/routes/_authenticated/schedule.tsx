import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Select, Empty, SectionTitle, Badge, Avatar } from "@/components/ui-bits";
import { Sheet } from "@/components/Sheet";
import { useStudents, useSchedule, useMut, initials, type ScheduleSlot } from "@/lib/db";
import { sb } from "@/lib/sb";
import { CalendarDays, Plus, Trash2, Clock, Check, X, ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLessons, setLessonStatus, moveLesson, type LessonStatus } from "@/lib/lessons.functions";
import { Calendar } from "@/components/calendar/Calendar";
import { SwipeableLessonCard } from "@/components/SwipeableLessonCard";

export const Route = createFileRoute("/_authenticated/schedule")({ component: SchedulePage });

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const DAYS_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"] as const;

function jsDayToMon(jsDay: number) {
  // JS: 0=Sun..6=Sat → 0=Mon..6=Sun
  return (jsDay + 6) % 7;
}

function fmtTime(t: string) {
  return t.slice(0, 5);
}

function addMinutes(t: string, mins: number) {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function SchedulePage() {
  const { data: slots = [] } = useSchedule();
  const { data: students = [] } = useStudents();
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const studentsById = useMemo(() => {
    const m = new Map<string, (typeof students)[number]>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const grouped = useMemo(() => {
    const map: Record<number, ScheduleSlot[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    slots.forEach((s) => map[s.day_of_week]?.push(s));
    return map;
  }, [slots]);

  const todayDow = jsDayToMon(new Date().getDay());

  const del = useMut(async (id: string) => {
    const { error } = await (await sb()).from("schedule_slots").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }, ["schedule"]);

  return (
    <div className="px-4 pt-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Расписание</h1>
          <p className="mt-1 text-sm text-muted-foreground">Еженедельные уроки по дням</p>
        </div>
        <Button variant="gold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Слот
        </Button>
      </header>

      <Calendar />

      <UpcomingLessons studentsById={studentsById} />




      {slots.length === 0 ? (
        <div className="mt-6">
          <Empty
            icon={<CalendarDays className="h-8 w-8" />}
            title="Расписание пусто"
            hint="Нажмите «Слот», чтобы добавить регулярный урок"
          />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {DAYS.map((_, i) => {
            const dayItems = grouped[i] ?? [];
            const isToday = todayDow === i;
            return (
              <section key={i}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[15px] font-semibold tracking-tight ${isToday ? "text-accent" : "text-foreground"}`}>
                      {DAYS_FULL[i]}
                    </span>
                    {isToday && <Badge tone="gold">сегодня</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {dayItems.length === 0 ? "—" : `${dayItems.length} ${dayItems.length === 1 ? "урок" : "урока"}`}
                  </span>
                </div>

                {dayItems.length === 0 ? (
                  <Card className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">Свободный день</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {dayItems.map((slot) => {
                      const st = studentsById.get(slot.student_id);
                      const end = addMinutes(slot.start_time, slot.duration_min);
                      return (
                        <Card key={slot.id} className="flex items-center gap-3 p-3">
                          <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-accent/10 px-2 py-2">
                            <span className="num text-base leading-tight text-accent">{fmtTime(slot.start_time)}</span>
                            <span className="text-[10px] font-medium text-muted-foreground">{end}</span>
                          </div>
                          <Avatar initials={initials(st?.name ?? "?")} />
                          <div className="min-w-0 flex-1">
                            <div className="name-italic truncate text-[14px] font-semibold text-foreground">
                              {st?.name ?? "Удалён"}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {slot.duration_min} мин
                              {st?.subject ? ` · ${st.subject}` : ""}
                            </div>
                          </div>
                          <button
                            onClick={() => setConfirmId(slot.id)}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AddSlotSheet open={open} onClose={() => setOpen(false)} />

      <Sheet open={!!confirmId} onClose={() => setConfirmId(null)} title="Удалить слот?">
        <p className="text-sm text-muted-foreground">Регулярный урок будет удалён из расписания.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmId(null)}>Отмена</Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              if (!confirmId) return;
              try {
                await del.mutateAsync(confirmId);
                toast.success("Слот удалён");
                setConfirmId(null);
              } catch (e: any) {
                toast.error(e?.message ?? "Ошибка");
              }
            }}
          >
            Удалить
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function AddSlotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: students = [] } = useStudents();
  const [studentId, setStudentId] = useState("");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState(0);
  const [time, setTime] = useState("16:00");
  const [duration, setDuration] = useState("60");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  const add = useMut(async () => {
    if (!studentId) throw new Error("Выберите ученика");
    const { error } = await (await sb()).from("schedule_slots").insert({
      student_id: studentId,
      day_of_week: day,
      start_time: `${time}:00`,
      duration_min: Math.max(15, Math.min(240, Number(duration) || 60)),
    });
    if (error) throw error;
  }, ["schedule"]);

  return (
    <Sheet open={open} onClose={onClose} title="Новый урок в расписании">
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Сначала добавьте хотя бы одного ученика во вкладке «Ученики».
        </p>
      ) : (
        <div className="space-y-3">
          <div className="stagger-item" style={{ animationDelay: "40ms" }}>
          <Field label="Ученик">
            <Input
              type="text"
              inputMode="search"
              placeholder="Поиск ученика…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="liquid-control mt-2 max-h-44 overflow-y-auto rounded-xl p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Никого не нашли</p>
              ) : (
                filtered.map((s) => {
                  const active = studentId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudentId(s.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-accent text-accent-foreground" : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      <Avatar initials={initials(s.name)} />
                      <span className="name-italic truncate font-semibold">{s.name}</span>
                      {s.subject && (
                        <span className={`ml-auto text-[11px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                          {s.subject}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </Field>
          </div>
          <div className="stagger-item" style={{ animationDelay: "95ms" }}>
          <Field label="День недели">
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => {
                const active = day === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDay(i)}
                    className={`liquid-action min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="stagger-item" style={{ animationDelay: "150ms" }}>
            <Field label="Время">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            </div>
            <div className="stagger-item" style={{ animationDelay: "205ms" }}>
            <Field label="Длительность, мин">
              <Input type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            </div>
          </div>
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="liquid-action flex-1" onClick={onClose}>Отмена</Button>
        <Button
          variant="gold"
          className="liquid-action flex-1"
          disabled={!studentId || add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              toast.success("Урок добавлен");
              setStudentId(""); setQuery(""); setDay(0); setTime("16:00"); setDuration("60");
              onClose();
            } catch (e: any) {
              toast.error(e?.message ?? "Ошибка");
            }
          }}
        >
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function statusTone(s: LessonStatus): "neutral" | "success" | "danger" | "gold" {
  if (s === "completed") return "success";
  if (s === "cancelled") return "danger";
  if (s === "moved") return "neutral";
  return "gold";
}
function statusLabel(s: LessonStatus) {
  return s === "planned" ? "Запланирован" : s === "completed" ? "Проведён" : s === "cancelled" ? "Отменён" : "Перенесён";
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function UpcomingLessons({ studentsById }: { studentsById: Map<string, { name: string; subject: string | null }> }) {
  const listFn = useServerFn(listLessons);
  const setFn = useServerFn(setLessonStatus);
  const moveFn = useServerFn(moveLesson);
  const qc = useQueryClient();
  const [moveTarget, setMoveTarget] = useState<{ id: string; date: string; time: string } | null>(null);

  const today = new Date(); today.setHours(0,0,0,0);
  const weekAhead = new Date(today); weekAhead.setDate(weekAhead.getDate() + 7);
  const from = isoDate(today);
  const to = isoDate(weekAhead);

  const { data, isLoading } = useQuery({
    queryKey: ["lessons", from, to],
    queryFn: () => listFn({ data: { from, to } }),
  });

  const lessons = (data?.lessons ?? []).filter((l) => l.status !== "moved");

  async function changeStatus(id: string, status: LessonStatus) {
    try {
      await setFn({ data: { id, status } });
      toast.success(statusLabel(status));
      qc.invalidateQueries({ queryKey: ["lessons"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function submitMove(newDate: string, newTime: string) {
    if (!moveTarget) return;
    try {
      await moveFn({ data: { id: moveTarget.id, new_date: newDate, new_time: newTime } });
      toast.success("Перенесён");
      setMoveTarget(null);
      qc.invalidateQueries({ queryKey: ["lessons"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <>
      <SectionTitle>Ближайшие уроки (7 дней)</SectionTitle>
      {isLoading ? (
        <Card className="p-4"><p className="text-xs text-muted-foreground">Загрузка…</p></Card>
      ) : lessons.length === 0 ? (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            Нет уроков. Сгенерируйте историю в Настройках или добавьте слот в расписании.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {lessons.map((l) => {
            const st = studentsById.get(l.student_id);
            const time = String(l.scheduled_time).slice(0, 5);
            const isPast = l.scheduled_date < from;
            const planned = l.status === "planned";
            const cardInner = (
              <Card className="p-3 tap-pulse">
                <div className="flex items-center gap-3">
                  <div className="flex w-20 shrink-0 flex-col items-center rounded-xl bg-accent/10 px-2 py-2">
                    <span className="num text-xs leading-tight text-accent">{l.scheduled_date.slice(5)}</span>
                    <span className="num text-base leading-tight text-foreground">{time}</span>
                  </div>
                  <Avatar initials={initials(st?.name ?? "?")} />
                  <div className="min-w-0 flex-1">
                    <div className="name-italic truncate text-[14px] font-semibold text-foreground">
                      {st?.name ?? "Удалён"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {st?.subject ?? ""}
                    </div>
                  </div>
                  <Badge tone={statusTone(l.status as LessonStatus)}>{statusLabel(l.status as LessonStatus)}</Badge>
                </div>
                {planned && (
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" className="flex-1" data-haptic="success" onClick={() => changeStatus(l.id, "completed")}>
                      <Check className="h-4 w-4" /> Провёл
                    </Button>
                    <Button variant="outline" className="flex-1" data-haptic="warning" onClick={() => changeStatus(l.id, "cancelled")}>
                      <X className="h-4 w-4" /> Отменил
                    </Button>
                    <Button variant="outline" className="flex-1" data-haptic="medium" onClick={() => setMoveTarget({ id: l.id, date: l.scheduled_date, time })} disabled={isPast}>
                      <ArrowRight className="h-4 w-4" /> Перенёс
                    </Button>
                  </div>
                )}
              </Card>
            );
            return (
              <SwipeableLessonCard
                key={l.id}
                enabled={planned}
                onComplete={() => changeStatus(l.id, "completed")}
                onCancel={() => changeStatus(l.id, "cancelled")}
                onReschedule={isPast ? undefined : () => setMoveTarget({ id: l.id, date: l.scheduled_date, time })}
              >
                {cardInner}
              </SwipeableLessonCard>
            );
          })}
        </div>
      )}

      <MoveLessonSheet
        target={moveTarget}
        onClose={() => setMoveTarget(null)}
        onSubmit={submitMove}
      />
    </>
  );
}

function MoveLessonSheet({
  target,
  onClose,
  onSubmit,
}: {
  target: { id: string; date: string; time: string } | null;
  onClose: () => void;
  onSubmit: (date: string, time: string) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Reset when target changes
  useMemo(() => {
    if (target) { setDate(target.date); setTime(target.time); }
  }, [target?.id]);

  return (
    <Sheet open={!!target} onClose={onClose} title="Перенести урок">
      <div className="space-y-3">
        <Field label="Новая дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Новое время">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
        <Button
          variant="gold"
          className="flex-1"
          disabled={!date || !time}
          onClick={() => onSubmit(date, time)}
        >
          Перенести
        </Button>
      </div>
    </Sheet>
  );
}


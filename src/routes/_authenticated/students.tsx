import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import { Sheet } from "@/components/Sheet";
import { GlassChips } from "@/components/GlassChips";
import { useStudents, useFinance, useMut, initials, STUDENT_STATUS_META, type Student, type StudentStatus } from "@/lib/db";
import { sb } from "@/lib/sb";
import { softDeleteStudent } from "@/lib/softdelete.functions";
import { regenerateLessons } from "@/lib/lessons.functions";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Plus, Search, Trash2, Phone, BookOpen, ChevronRight, Pencil, AlertCircle } from "lucide-react";


export const Route = createFileRoute("/_authenticated/students")({ component: StudentsPage });

type DebtFilter = "all" | "debt" | "paid" | "none";
type StatusFilter = "all" | StudentStatus | "trash";
type SortBy = "name_asc" | "name_desc" | "created_desc" | "created_asc" | "days_desc" | "days_asc";

function StudentsPage() {
  const { data: activeStudents = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const [q, setQ] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [debtFilter, setDebtFilter] = useState<DebtFilter>("all");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("created_desc");
  const [open, setOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") {
      setOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Soft-deleted students (Trash)
  const { data: trashStudents = [] } = useQuery({
    queryKey: ["students", "trash"],
    enabled: statusFilter === "trash",
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("students")
        .select("*")
        .not("deleted_at", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Student[];
    },
  });

  // Upcoming lessons (next 7 days) per student
  const { data: upcomingByStudent = new Map<string, number>() } = useQuery({
    queryKey: ["lessons", "upcoming-7d"],
    enabled: upcomingOnly,
    queryFn: async () => {
      const today = new Date();
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data, error } = await (await sb())
        .from("lessons")
        .select("student_id, status, scheduled_date, deleted_at")
        .eq("status", "planned")
        .is("deleted_at", null)
        .gte("scheduled_date", iso(today))
        .lte("scheduled_date", iso(in7));
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((l: { student_id: string }) => {
        map.set(l.student_id, (map.get(l.student_id) ?? 0) + 1);
      });
      return map;
    },
  });

  const baseList = statusFilter === "trash" ? trashStudents : activeStudents;

  // Stats: counts per status from active (non-deleted) students
  const statusCounts = useMemo(() => {
    const c: Record<StudentStatus, number> = { active: 0, paused: 0, completed: 0, archived: 0 };
    activeStudents.forEach((s) => { c[s.status] = (c[s.status] ?? 0) + 1; });
    return c;
  }, [activeStudents]);

  // Overdue map: student_id -> { amount, days }
  const today = new Date().toISOString().slice(0, 10);
  const overdueByStudent = useMemo(() => {
    const m = new Map<string, { amount: number; days: number }>();
    for (const f of finance) {
      if (f.is_paid || !f.pay_date || f.pay_date >= today) continue;
      const days = Math.floor((Date.parse(today) - Date.parse(f.pay_date)) / 86400000);
      const cur = m.get(f.student_id) ?? { amount: 0, days: 0 };
      cur.amount += Number(f.amount);
      cur.days = Math.max(cur.days, days);
      m.set(f.student_id, cur);
    }
    return m;
  }, [finance, today]);


  const subjects = useMemo(() => {
    const set = new Set<string>();
    activeStudents.forEach((s) => {
      if (s.subject) set.add(s.subject);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [activeStudents]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = baseList.filter((s) => {
      if (statusFilter !== "all" && statusFilter !== "trash" && s.status !== statusFilter) return false;
      if (needle && !((s.name + " " + (s.subject ?? "") + " " + (s.phone ?? "")).toLowerCase().includes(needle)))
        return false;
      if (subjectFilter && (s.subject ?? "") !== subjectFilter) return false;
      if (debtFilter !== "all") {
        const fin = finance.filter((f) => f.student_id === s.id);
        const hasUnpaid = fin.some((f) => !f.is_paid);
        if (debtFilter === "debt" && !hasUnpaid) return false;
        if (debtFilter === "paid" && (fin.length === 0 || hasUnpaid)) return false;
        if (debtFilter === "none" && fin.length !== 0) return false;
      }
      if (upcomingOnly && !(upcomingByStudent.get(s.id) ?? 0)) return false;
      return true;
    });
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return a.name.localeCompare(b.name, "ru");
        case "name_desc":
          return b.name.localeCompare(a.name, "ru");
        case "created_asc":
          return a.created_at.localeCompare(b.created_at);
        case "days_desc":
          return b.days_per_week - a.days_per_week;
        case "days_asc":
          return a.days_per_week - b.days_per_week;
        case "created_desc":
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
    return sorted;
  }, [baseList, statusFilter, q, subjectFilter, debtFilter, upcomingOnly, upcomingByStudent, finance, sortBy]);

  const softDelFn = useServerFn(softDeleteStudent);
  const del = useMut(async (id: string) => {
    await softDelFn({ data: { id } });
  }, ["students", "finance", "attendance", "schedule", "homework", "lessons"]);

  const Chip = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition-all duration-300 ease-out ${
        active
          ? "text-foreground ring-white/50 dark:ring-white/15 shadow-[0_8px_24px_-12px_rgba(20,33,61,0.25),inset_0_1px_0_0_rgba(255,255,255,0.55)]"
          : "text-muted-foreground ring-white/30 dark:ring-white/10 hover:text-foreground"
      }`}
      style={{
        background: active ? "color-mix(in oklab, var(--accent) 28%, var(--glass-bg))" : "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
        WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
      }}
    >
      {children}
    </button>

  );

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Ученики</h1>
      <p className="mt-1 text-sm text-muted-foreground">Карточки ваших подопечных</p>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Поиск ученика..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="gold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Добавить
        </Button>
      </div>

      <Card className="mt-3 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Предмет
            </span>
            <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              <option value="">Все</option>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Сортировка
            </span>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="created_desc">Сначала новые</option>
              <option value="created_asc">Сначала старые</option>
              <option value="name_asc">Имя А→Я</option>
              <option value="name_desc">Имя Я→А</option>
              <option value="days_desc">Дн/нед ↓</option>
              <option value="days_asc">Дн/нед ↑</option>
            </Select>
          </label>
        </div>
        <GlassChips<DebtFilter>
          active={debtFilter}

          onChange={(k) => setDebtFilter(k)}
          items={[
            { key: "all", label: "Все оплаты" },
            { key: "debt", label: "Должники" },
            { key: "paid", label: "Оплачено" },
            { key: "none", label: "Без платежей" },
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={upcomingOnly} onClick={() => setUpcomingOnly((v) => !v)}>
            Урок в ближайшие 7 дней
          </Chip>
        </div>

      </Card>

      {/* Status stats + filter */}
      <div className="mt-4 -mx-1 flex gap-1.5 overflow-x-auto px-1 pt-2 pb-1">
        <StatusStat label="Все" count={activeStudents.length} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        {(["active", "paused", "completed", "archived"] as StudentStatus[]).map((st) => (
          <StatusStat
            key={st}
            label={STUDENT_STATUS_META[st].label}
            count={statusCounts[st]}
            tone={STUDENT_STATUS_META[st].tone}
            active={statusFilter === st}
            onClick={() => setStatusFilter(st)}
          />
        ))}
        <StatusStat label="Корзина" count={trashStudents.length} active={statusFilter === "trash"} onClick={() => setStatusFilter("trash")} />
      </div>

      <SectionTitle>{filtered.length} {filtered.length === 1 ? "ученик" : "учеников"}</SectionTitle>

      {filtered.length === 0 ? (
        <Empty
          icon={<GraduationCap className="h-8 w-8" />}
          title={baseList.length === 0 ? "Список пуст" : "Никого не найдено"}
          hint={baseList.length === 0 ? "Нажмите «Добавить», чтобы начать" : "Попробуйте изменить фильтры"}
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {filtered.map((s, i) => {
            const fin = finance.filter((f) => f.student_id === s.id);
            const hasUnpaid = fin.some((f) => !f.is_paid);
            const overdue = overdueByStudent.get(s.id);
            const statusMeta = STUDENT_STATUS_META[s.status];
            return (
              <Card key={s.id} className={`p-4 ${overdue ? "ring-1 ring-destructive/60" : ""}`}>
                <div className="flex items-start gap-3">
                  <Link to="/students/$id" params={{ id: s.id }} className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar initials={initials(s.name)} />
                    <div className="min-w-0 flex-1">
                      <div className="name-italic flex items-center gap-1 truncate text-[15px] font-semibold text-foreground">
                        {s.name} <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.subject || "Без предмета"}
                      </div>
                    </div>
                  </Link>

                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => setEditStudent(s)}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent"
                      aria-label="Редактировать"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setConfirmId(s.id)}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-secondary px-3 py-2">
                    <div className="num text-lg text-foreground">{s.days_per_week}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">дн/нед</div>
                  </div>
                  <div className="rounded-xl bg-secondary px-3 py-2">
                    <div className="num text-lg text-foreground">{s.days_per_week * 4}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">уроков/мес</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {s.phone ? (
                    <a href={`tel:${s.phone}`} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </a>
                  ) : (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <BookOpen className="h-3 w-3" /> {s.subject || "—"}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    {overdue ? (
                      <Badge tone="danger">
                        <AlertCircle className="mr-0.5 inline h-3 w-3" />Долг {overdue.days}д
                      </Badge>
                    ) : fin.length === 0 ? (
                      <Badge>Без платежей</Badge>
                    ) : hasUnpaid ? (
                      <Badge tone="danger">Должник</Badge>
                    ) : (
                      <Badge tone="success">Оплачено</Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}


      <AddStudentSheet open={open} onClose={() => setOpen(false)} />
      <EditStudentSheet student={editStudent} onClose={() => setEditStudent(null)} />


      <Sheet open={!!confirmId} onClose={() => setConfirmId(null)} title="Удалить ученика?">
        <p className="text-sm text-muted-foreground">
          Ученик и все связанные записи отправятся в Корзину. Их можно восстановить в Настройках.
        </p>
        <div className="mt-8 flex gap-3 pb-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmId(null)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              if (!confirmId) return;
              try {
                await del.mutateAsync(confirmId);
                toast.success("Ученик перемещён в Корзину");
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

type Pattern = "mwf" | "tts" | "custom";
const PATTERN_DAYS: Record<Exclude<Pattern, "custom">, number[]> = {
  mwf: [0, 2, 4], // Пн, Ср, Пт
  tts: [1, 3, 5], // Вт, Чт, Сб
};

function AddStudentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState<Pattern>("mwf");
  const [customDays, setCustomDays] = useState("2");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState("");
  const [time, setTime] = useState("16:00");
  const [duration, setDuration] = useState("60");

  const add = useMut(async () => {
    const slotDays = pattern === "custom" ? [] : PATTERN_DAYS[pattern];
    const daysCount =
      pattern === "custom"
        ? Math.max(1, Math.min(7, Number(customDays) || 1))
        : slotDays.length;

    const sup = await sb();
    const { data: created, error } = await sup
      .from("students")
      .insert({
        name: name.trim(),
        days_per_week: daysCount,
        subject: subject.trim() || null,
        phone: phone.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;

    if (slotDays.length > 0 && created) {
      const dur = Math.max(15, Math.min(240, Number(duration) || 60));
      const rows = slotDays.map((d) => ({
        student_id: created.id,
        day_of_week: d,
        start_time: `${time}:00`,
        duration_min: dur,
      }));
      const { error: slotErr } = await sup.from("schedule_slots").insert(rows);
      if (slotErr) throw slotErr;
    }
  }, ["students", "schedule"]);

  const PatternBtn = ({ value, label, hint }: { value: Pattern; label: string; hint: string }) => {
    const active = pattern === value;
    return (
      <button
        type="button"
        onClick={() => setPattern(value)}
        className={`group relative flex-1 overflow-hidden rounded-2xl border p-3 text-left backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.97] ${
          active
            ? "border-accent/60 bg-accent/15 shadow-[0_12px_28px_-12px_color-mix(in_oklab,var(--accent)_50%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.6)] ring-1 ring-accent/30"
            : "border-white/60 bg-white/55 hover:bg-white/80 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 shadow-[0_8px_22px_-14px_rgba(20,33,61,0.25)]"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/40 via-white/0 to-white/0 opacity-70"
        />
        <div className="relative text-sm font-semibold text-foreground">{label}</div>
        <div className="relative mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      </button>
    );
  };


  return (
    <Sheet open={open} onClose={onClose} title="Новый ученик">
      <div className="space-y-3">
        <div className="stagger-item" style={{ animationDelay: "40ms" }}>
          <Field label="Имя">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Анна Иванова" />
          </Field>
        </div>

        <div className="stagger-item" style={{ animationDelay: "95ms" }}>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Расписание</span>
          <div className="flex gap-2">
            <PatternBtn value="mwf" label="Пн / Ср / Пт" hint="3 урока в неделю" />
            <PatternBtn value="tts" label="Вт / Чт / Сб" hint="3 урока в неделю" />
          </div>
          <button
            type="button"
            onClick={() => setPattern("custom")}
            className={`group relative mt-2 w-full overflow-hidden rounded-2xl border p-3 text-left text-sm backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.98] ${
              pattern === "custom"
                ? "border-accent/60 bg-accent/15 text-foreground ring-1 ring-accent/30 shadow-[0_12px_28px_-12px_color-mix(in_oklab,var(--accent)_50%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.6)]"
                : "border-white/60 bg-white/55 text-muted-foreground hover:bg-white/80 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 shadow-[0_8px_22px_-14px_rgba(20,33,61,0.25)]"
            }`}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/10"
            />
            <span className="relative">Свой график (без авто-слотов)</span>
          </button>
        </div>

        <div className="stagger-item" style={{ animationDelay: "150ms" }}>
          {pattern !== "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Время">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Длительность, мин">
                <Input type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field label="Дней в неделю (1–7)">
              <Input type="number" min={1} max={7} value={customDays} onChange={(e) => setCustomDays(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="stagger-item" style={{ animationDelay: "205ms" }}>
          <Field label="Предмет (необязательно)">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Математика" />
          </Field>
        </div>
        <div className="stagger-item" style={{ animationDelay: "260ms" }}>
          <Field label="Телефон (необязательно)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." />
          </Field>
        </div>
      </div>

      <div className="mt-8 flex gap-3 pb-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
        <Button
          variant="gold"
          className="flex-1"
          disabled={!name.trim() || add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              toast.success("Ученик добавлен");
              setName(""); setPattern("mwf"); setCustomDays("2");
              setSubject(""); setPhone(""); setTime("16:00"); setDuration("60");
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

function EditStudentSheet({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState("");
  const [pattern, setPattern] = useState<Pattern>("custom");
  const [customDays, setCustomDays] = useState("2");
  const [time, setTime] = useState("16:00");
  const [duration, setDuration] = useState("60");
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Заполнить данные при открытии
  useEffect(() => {
    if (!student) return;
    setName(student.name);
    setSubject(student.subject ?? "");
    setPhone(student.phone ?? "");
    setCustomDays(String(student.days_per_week));

    (async () => {
      setLoadingSlots(true);
      const sup = await sb();
      const { data: slots } = await sup
        .from("schedule_slots")
        .select("day_of_week, start_time, duration_min")
        .eq("student_id", student.id)
        .order("day_of_week");
      const days = (slots ?? []).map((s: any) => s.day_of_week).sort();
      const mwf = JSON.stringify(days) === JSON.stringify([0, 2, 4]);
      const tts = JSON.stringify(days) === JSON.stringify([1, 3, 5]);
      setPattern(mwf ? "mwf" : tts ? "tts" : "custom");
      if (slots?.[0]) {
        setTime(String(slots[0].start_time).slice(0, 5));
        setDuration(String(slots[0].duration_min));
      } else {
        setTime("16:00");
        setDuration("60");
      }
      setLoadingSlots(false);
    })();
  }, [student?.id]);

  const save = useMut(async () => {
    if (!student) return;
    const slotDays = pattern === "custom" ? [] : PATTERN_DAYS[pattern];
    const daysCount =
      pattern === "custom"
        ? Math.max(1, Math.min(7, Number(customDays) || 1))
        : slotDays.length;

    const sup = await sb();
    const { error: upErr } = await sup
      .from("students")
      .update({
        name: name.trim(),
        days_per_week: daysCount,
        subject: subject.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", student.id);
    if (upErr) throw upErr;

    if (pattern !== "custom") {
      // Перезаписать слоты
      const { error: delErr } = await sup.from("schedule_slots").delete().eq("student_id", student.id);
      if (delErr) throw delErr;
      const dur = Math.max(15, Math.min(240, Number(duration) || 60));
      const rows = slotDays.map((d) => ({
        student_id: student.id,
        day_of_week: d,
        start_time: `${time}:00`,
        duration_min: dur,
      }));
      const { error: insErr } = await sup.from("schedule_slots").insert(rows);
      if (insErr) throw insErr;
    } else {
      // Обновить только время/длительность в существующих слотах
      const dur = Math.max(15, Math.min(240, Number(duration) || 60));
      const { error: updSlotErr } = await sup
        .from("schedule_slots")
        .update({ start_time: `${time}:00`, duration_min: dur })
        .eq("student_id", student.id);
      if (updSlotErr) throw updSlotErr;
    }
  }, ["students", "schedule", "finance"]);

  const PatternBtn = ({ value, label, hint }: { value: Pattern; label: string; hint: string }) => {
    const active = pattern === value;
    return (
      <button
        type="button"
        onClick={() => setPattern(value)}
        className={`group relative flex-1 overflow-hidden rounded-2xl border p-3 text-left backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.97] ${
          active
            ? "border-accent/60 bg-accent/15 shadow-[0_12px_28px_-12px_color-mix(in_oklab,var(--accent)_50%,transparent),inset_0_1px_0_0_rgba(255,255,255,0.6)] ring-1 ring-accent/30"
            : "border-white/60 bg-white/55 hover:bg-white/80 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 shadow-[0_8px_22px_-14px_rgba(20,33,61,0.25)]"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/40 via-white/0 to-white/0 opacity-70"
        />
        <div className="relative text-sm font-semibold text-foreground">{label}</div>
        <div className="relative mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      </button>
    );
  };


  return (
    <Sheet open={!!student} onClose={onClose} title="Редактировать ученика">
      {loadingSlots ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <div className="space-y-3">
            <Field label="Имя">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Расписание</span>
              <div className="flex gap-2">
                <PatternBtn value="mwf" label="Пн / Ср / Пт" hint="3 урока в неделю" />
                <PatternBtn value="tts" label="Вт / Чт / Сб" hint="3 урока в неделю" />
              </div>
              <button
                type="button"
                onClick={() => setPattern("custom")}
                className={`mt-2 w-full rounded-2xl border p-3 text-left text-sm transition-all backdrop-blur-md ${
                  pattern === "custom"
                    ? "border-accent bg-accent/15"
                    : "border-white/60 bg-white/40 dark:bg-white/5 dark:border-white/10 text-muted-foreground"
                }`}
              >
                Свой график (слоты не перезаписываются)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Время">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Длительность, мин">
                <Input type="number" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
            </div>

            {pattern === "custom" && (
              <Field label="Дней в неделю (1–7)">
                <Input type="number" min={1} max={7} value={customDays} onChange={(e) => setCustomDays(e.target.value)} />
              </Field>
            )}

            <Field label="Предмет">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Математика" />
            </Field>
            <Field label="Телефон">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." />
            </Field>
          </div>

          <div className="mt-8 flex gap-3 pb-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
            <Button
              variant="gold"
              className="flex-1"
              disabled={!name.trim() || save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync(undefined as never);
                  toast.success("Изменения сохранены");
                  onClose();
                } catch (e: any) {
                  toast.error(e?.message ?? "Ошибка");
                }
              }}
            >
              Сохранить
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function StatusStat({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: "success" | "gold" | "neutral" | "danger";
  active: boolean;
  onClick: () => void;
}) {
  const toneRing: Record<string, string> = {
    success: "ring-[color:var(--success,theme(colors.emerald.500))]/40",
    gold: "ring-accent/40",
    neutral: "ring-border",
    danger: "ring-destructive/40",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`liquid-action shrink-0 min-w-[88px] rounded-2xl px-3 py-2 text-center ${
        active
          ? "ring-2 ring-accent/60 bg-accent/15"
          : `ring-1 ring-transparent ${tone ? toneRing[tone] : ""}`
      }`}
    >
      <div className="num text-base text-foreground leading-none">{count}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </button>
  );
}

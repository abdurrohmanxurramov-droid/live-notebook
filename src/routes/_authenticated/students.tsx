import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import { Sheet } from "@/components/Sheet";
import { useStudents, useFinance, useMut, initials, type Student } from "@/lib/db";
import { sb } from "@/lib/sb";
import { softDeleteStudent } from "@/lib/softdelete.functions";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Plus, Search, Trash2, Phone, BookOpen, ChevronRight, Pencil } from "lucide-react";


export const Route = createFileRoute("/_authenticated/students")({ component: StudentsPage });

function StudentsPage() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = students.filter((s) =>
    (s.name + " " + (s.subject ?? "") + " " + (s.phone ?? "")).toLowerCase().includes(q.toLowerCase())
  );

  const softDelFn = useServerFn(softDeleteStudent);
  const del = useMut(async (id: string) => {
    await softDelFn({ data: { id } });
  }, ["students", "finance", "attendance", "schedule", "homework", "lessons"]);

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

      <SectionTitle>{filtered.length} {filtered.length === 1 ? "ученик" : "учеников"}</SectionTitle>

      {filtered.length === 0 ? (
        <Empty
          icon={<GraduationCap className="h-8 w-8" />}
          title={students.length === 0 ? "Список пуст" : "Никого не найдено"}
          hint={students.length === 0 ? "Нажмите «Добавить», чтобы начать" : "Попробуйте другое имя"}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((s) => {
            const fin = finance.filter((f) => f.student_id === s.id);
            const hasUnpaid = fin.some((f) => !f.is_paid);
            return (
              <Card key={s.id} className="p-4">
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

                <div className="mt-3 flex items-center justify-between">
                  {s.phone ? (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BookOpen className="h-3 w-3" /> {s.subject || "—"}
                    </span>
                  )}
                  {fin.length === 0 ? (
                    <Badge>Без платежей</Badge>
                  ) : hasUnpaid ? (
                    <Badge tone="danger">Должник</Badge>
                  ) : (
                    <Badge tone="success">Оплачено</Badge>
                  )}
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
        <div className="mt-5 flex gap-2">
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

  const PatternBtn = ({ value, label, hint }: { value: Pattern; label: string; hint: string }) => (
    <button
      type="button"
      onClick={() => setPattern(value)}
      className={`flex-1 rounded-2xl border p-3 text-left transition-all ${
        pattern === value
          ? "border-accent bg-accent/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]"
          : "border-white/60 bg-white/40 dark:bg-white/5 dark:border-white/10"
      } backdrop-blur-md`}
    >
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Новый ученик">
      <div className="space-y-3">
        <Field label="Имя">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Анна Иванова" />
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
            Свой график (без авто-слотов)
          </button>
        </div>

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

        <Field label="Предмет (необязательно)">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Математика" />
        </Field>
        <Field label="Телефон (необязательно)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." />
        </Field>
      </div>
      <div className="mt-5 flex gap-2">
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

  const PatternBtn = ({ value, label, hint }: { value: Pattern; label: string; hint: string }) => (
    <button
      type="button"
      onClick={() => setPattern(value)}
      className={`flex-1 rounded-2xl border p-3 text-left transition-all ${
        pattern === value
          ? "border-accent bg-accent/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]"
          : "border-white/60 bg-white/40 dark:bg-white/5 dark:border-white/10"
      } backdrop-blur-md`}
    >
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );

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

          <div className="mt-5 flex gap-2">
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

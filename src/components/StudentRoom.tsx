import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import {
  useStudents,
  useAttendance,
  useHomework,
  useFinance,
  useMut,
  initials,
  STUDENT_STATUS_META,
  type HomeworkStatus,
  type AttendanceStatus,
  type Attendance,
  type StudentStatus,
} from "@/lib/db";
import { getSettings } from "@/lib/settings.functions";
import { sb } from "@/lib/sb";
import { CalendarCheck, BookOpen, Wallet, Check, X, Trash2, Phone, Target, RotateCcw, History as HistoryIcon, StickyNote, Paperclip, FileText, MinusCircle, AlertTriangle, type LucideIcon } from "lucide-react";

const LESSONS_PER_CYCLE = 12;
const EXCUSED_LIMIT = 3;

const ATT_STATUS: Record<AttendanceStatus, { label: string; Icon: LucideIcon; tone: "success" | "danger" | "gold" | "neutral" }> = {
  present: { label: "Был", Icon: Check, tone: "success" },
  absent: { label: "Не был", Icon: X, tone: "danger" },
  excused: { label: "Уваж.", Icon: Paperclip, tone: "gold" },
  rescheduled_by_teacher: { label: "Перенос мной", Icon: RotateCcw, tone: "neutral" },
};

const HW_STATUS: Record<HomeworkStatus, { label: string; Icon: LucideIcon; tone: "success" | "danger" | "gold" | "neutral" }> = {
  assigned: { label: "Задано", Icon: FileText, tone: "neutral" },
  done: { label: "Сделано", Icon: Check, tone: "success" },
  partial: { label: "Частично", Icon: MinusCircle, tone: "gold" },
  not_done: { label: "Не сделал", Icon: X, tone: "danger" },
};

export function StudentRoom({ id }: { id: string }) {
  const { data: students = [] } = useStudents();
  const { data: attendance = [] } = useAttendance();
  const { data: homework = [] } = useHomework();
  const { data: finance = [] } = useFinance();

  const student = students.find((s) => s.id === id);
  const att = useMemo(() => attendance.filter((a) => a.student_id === id), [attendance, id]);
  const hw = useMemo(() => homework.filter((h) => h.student_id === id), [homework, id]);
  const fin = useMemo(() => finance.filter((f) => f.student_id === id), [finance, id]);

  // Основная шкала: present + absent (всё что ученик "съел")
  const countedCount = att.filter((a) => a.status === "present" || a.status === "absent").length;
  const cyclesCompleted = Math.floor(countedCount / LESSONS_PER_CYCLE);
  const progress = countedCount % LESSONS_PER_CYCLE;
  const paidCount = fin.filter((f) => f.is_paid).length;
  const unpaidCount = fin.filter((f) => !f.is_paid).length;
  const needsPayment = unpaidCount > 0;

  // Уваж. причины — отдельная шкала
  const excusedCount = att.filter((a) => a.status === "excused").length;
  const excusedReached = excusedCount >= EXCUSED_LIMIT;

  // Долг учителя — переносы, не возмещённые
  const teacherDebt = att.filter((a) => a.status === "rescheduled_by_teacher" && !a.compensated).length;

  const [tab, setTab] = useState<"att" | "hw" | "fin" | "timeline">("att");

  if (!student) {
    return <Empty icon={<Target className="h-8 w-8" />} title="Ученик не найден" />;
  }

  return (
    <div>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar initials={initials(student.name)} />
          <div className="min-w-0 flex-1">
            <div className="name-italic truncate text-lg font-semibold text-foreground">{student.name}</div>
            <div className="text-xs text-muted-foreground">
              {student.subject || "—"} · {student.days_per_week} дн/нед
            </div>
            {student.phone && (
              <a href={`tel:${student.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs text-accent">
                <Phone className="h-3 w-3" /> {student.phone}
              </a>
            )}
          </div>
        </div>

        <StatusSwitcher studentId={student.id} current={student.status} />


        <div className="mt-4 rounded-xl bg-secondary p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Цикл уроков</div>
            {needsPayment ? (
              <Badge tone="danger">Нужна оплата ({unpaidCount})</Badge>
            ) : (
              <Badge tone={progress === 0 && cyclesCompleted > 0 ? "success" : "neutral"}>
                {progress} / {LESSONS_PER_CYCLE}
              </Badge>
            )}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card">
            <div className="h-full bg-accent transition-all" style={{ width: `${(progress / LESSONS_PER_CYCLE) * 100}%` }} />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Засчитано: <span className="num text-foreground">{countedCount}</span> · Циклов:{" "}
            <span className="num text-foreground">{cyclesCompleted}</span> · Оплачено:{" "}
            <span className="num text-foreground">{paidCount}</span>
          </div>
        </div>

        <div className="mt-2 rounded-xl bg-secondary p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Шансы на перенос</div>
            <Badge tone={excusedReached ? "danger" : excusedCount > 0 ? "gold" : "neutral"}>
              {excusedCount} / {EXCUSED_LIMIT}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {Array.from({ length: EXCUSED_LIMIT }).map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full ${i < excusedCount ? "bg-[color:var(--gold,theme(colors.amber.500))] bg-accent" : "bg-card"}`}
              />
            ))}
          </div>
          {excusedReached && (
            <div className="mt-1.5 text-[11px] text-destructive">Лимит исчерпан — новые уваж. причины не принимаются</div>
          )}
        </div>

        {teacherDebt > 0 && (
          <div className="mt-2 rounded-xl bg-destructive/10 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wide text-destructive">Я должен ученику</div>
              <Badge tone="danger">{teacherDebt} ур.</Badge>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Mini n={att.length} label="Записей" />
          <Mini n={hw.filter((h) => h.status === "done").length} label="ДЗ сделано" />
          <Mini n={unpaidCount} label="Долгов" />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <TabBtn active={tab === "att"} onClick={() => setTab("att")} icon={<CalendarCheck className="h-4 w-4" />} label="Посещения" />
        <TabBtn active={tab === "hw"} onClick={() => setTab("hw")} icon={<BookOpen className="h-4 w-4" />} label="ДЗ" />
        <TabBtn active={tab === "fin"} onClick={() => setTab("fin")} icon={<Wallet className="h-4 w-4" />} label="Оплаты" />
        <TabBtn active={tab === "timeline"} onClick={() => setTab("timeline")} icon={<HistoryIcon className="h-4 w-4" />} label="История" />
      </div>

      {tab === "att" && (
        <AttendanceTab
          studentId={id}
          att={att}
          countedBefore={countedCount}
          excusedCount={excusedCount}
        />
      )}
      {tab === "hw" && <HomeworkTab studentId={id} hw={hw} />}
      {tab === "fin" && <FinanceTab studentId={id} fin={fin} />}
      {tab === "timeline" && <TimelineTab att={att} hw={hw} fin={fin} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
        active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Mini({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-card py-2">
      <div className="num text-lg text-foreground">{n}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function AttendanceTab({
  studentId,
  att,
  countedBefore,
  excusedCount,
}: {
  studentId: string;
  att: Attendance[];
  countedBefore: number;
  excusedCount: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [note, setNote] = useState("");

  const getSettingsFn = useServerFn(getSettings);
  const { data: settings } = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => getSettingsFn({}),
  });

  const add = useMut(async () => {
    if (status === "excused" && excusedCount >= EXCUSED_LIMIT) {
      throw new Error(`Лимит уваж. причин (${EXCUSED_LIMIT}) исчерпан`);
    }
    const sup = await sb();
    const { error } = await sup.from("attendance").insert({
      student_id: studentId,
      date,
      status,
      note: note.trim() || null,
    });
    if (error) throw error;

    // Авто-долг: если урок засчитан (был/не был) и достигнут предел 12
    if (status === "present" || status === "absent") {
      const newCount = countedBefore + 1;
      if (newCount > 0 && newCount % LESSONS_PER_CYCLE === 0) {
        const price = (settings?.default_lesson_price ?? 0) * LESSONS_PER_CYCLE;
        const currency = settings?.default_currency ?? "RUB";
        const { error: e2 } = await sup.from("finance").insert({
          student_id: studentId,
          amount: price,
          currency,
          is_paid: false,
          pay_date: date,
        });
        if (e2) throw e2;
        toast.success("Цикл 12 уроков завершён — создан новый долг 💰");
      }
    }
  }, ["attendance", "finance"]);

  const del = useMut(async (id: string) => {
    const { error } = await (await sb()).from("attendance").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }, ["attendance"]);

  const toggleCompensated = useMut(async (r: Attendance) => {
    const { error } = await (await sb())
      .from("attendance")
      .update({ compensated: !r.compensated })
      .eq("id", r.id);
    if (error) throw error;
  }, ["attendance"]);

  const excusedReached = excusedCount >= EXCUSED_LIMIT;
  const willBlock = status === "excused" && excusedReached;

  return (
    <>
      <Card className="mt-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Статус">
            <Select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
              {(Object.entries(ATT_STATUS) as [AttendanceStatus, typeof ATT_STATUS[AttendanceStatus]][]).map(([k, v]) => (
                <option key={k} value={k} disabled={k === "excused" && excusedReached}>
                  {v.label}
                  {k === "excused" ? ` (${excusedCount}/${EXCUSED_LIMIT})` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
        </Field>
        {willBlock && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Лимит уваж. причин (3) исчерпан — выберите другой статус
          </div>
        )}
        <Button
          variant="gold"
          className="mt-3 w-full"
          disabled={add.isPending || willBlock}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              setNote("");
              toast.success("Записано");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Ошибка");
            }
          }}
        >
          <Check className="h-4 w-4" /> Записать урок
        </Button>
      </Card>

      <SectionTitle>История ({att.length})</SectionTitle>
      {att.length === 0 ? (
        <Empty icon={<CalendarCheck className="h-8 w-8" />} title="Уроков ещё не было" />
      ) : (
        <div className="space-y-2">
          {att.map((r) => {
            const cfg = ATT_STATUS[r.status];
            const isReschedule = r.status === "rescheduled_by_teacher";
            return (
              <Card key={r.id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-secondary ${cfg?.tone === "success" ? "text-[color:var(--success)]" : cfg?.tone === "danger" ? "text-destructive" : cfg?.tone === "gold" ? "text-accent" : "text-muted-foreground"}`}>
                    {cfg?.Icon ? <cfg.Icon className="h-5 w-5" /> : <span>·</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-foreground">
                      {new Date(r.date).toLocaleDateString("ru-RU")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {cfg?.label}
                      {isReschedule && r.compensated ? " · возмещён" : ""}
                      {r.note ? ` · ${r.note}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await del.mutateAsync(r.id);
                      toast.success("Удалено");
                    }}
                    className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {isReschedule && (
                  <button
                    onClick={async () => {
                      await toggleCompensated.mutateAsync(r);
                      toast.success(r.compensated ? "Снято с возмещения" : "Отмечено как возмещён");
                    }}
                    className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors ${
                      r.compensated
                        ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {r.compensated ? "Возмещён" : "Отметить возмещённым"}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function HomeworkTab({ studentId, hw }: { studentId: string; hw: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [task, setTask] = useState("");
  const [assignedDate, setAssignedDate] = useState(today);
  const [dueDate, setDueDate] = useState("");

  const add = useMut(async () => {
    if (!task.trim()) throw new Error("Введите задание");
    const { error } = await (await sb()).from("homework").insert({
      student_id: studentId,
      task: task.trim(),
      assigned_date: assignedDate,
      due_date: dueDate || null,
      status: "assigned",
    });
    if (error) throw error;
  }, ["homework"]);

  const setStatus = useMut(async ({ id, status }: { id: string; status: HomeworkStatus }) => {
    const { error } = await (await sb()).from("homework").update({ status }).eq("id", id);
    if (error) throw error;
  }, ["homework"]);

  const del = useMut(async (id: string) => {
    const { error } = await (await sb()).from("homework").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }, ["homework"]);

  return (
    <>
      <Card className="mt-4 p-4">
        <Field label="Задание">
          <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Что именно задал" />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Задано">
            <Input type="date" value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} />
          </Field>
          <Field label="К сроку">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="gold"
          className="mt-3 w-full"
          disabled={!task.trim() || add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              setTask("");
              toast.success("ДЗ добавлено");
            } catch (e: any) {
              toast.error(e?.message ?? "Ошибка");
            }
          }}
        >
          <BookOpen className="h-4 w-4" /> Добавить ДЗ
        </Button>
      </Card>

      <SectionTitle>Задания ({hw.length})</SectionTitle>
      {hw.length === 0 ? (
        <Empty icon={<BookOpen className="h-8 w-8" />} title="Домашек ещё нет" />
      ) : (
        <div className="space-y-2">
          {hw.map((h) => {
            const cfg = HW_STATUS[h.status as HomeworkStatus];
            return (
              <Card key={h.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary ${cfg.tone === "success" ? "text-[color:var(--success)]" : cfg.tone === "danger" ? "text-destructive" : cfg.tone === "gold" ? "text-accent" : "text-muted-foreground"}`}>
                    <cfg.Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-foreground">{h.task}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(h.assigned_date).toLocaleDateString("ru-RU")}
                      {h.due_date ? ` → ${new Date(h.due_date).toLocaleDateString("ru-RU")}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await del.mutateAsync(h.id);
                      toast.success("Удалено");
                    }}
                    className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(["done", "partial", "not_done"] as HomeworkStatus[]).map((s) => {
                    const active = h.status === s;
                    const c = HW_STATUS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus.mutateAsync({ id: h.id, status: s })}
                        className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors ${
                          active
                            ? c.tone === "success"
                              ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                              : c.tone === "danger"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-accent/15 text-accent"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {c.emoji} {c.label}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function FinanceTab({ studentId, fin }: { studentId: string; fin: any[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"RUB" | "USD" | "EGP">("RUB");
  const [date, setDate] = useState(today);
  const [isPaid, setIsPaid] = useState(true);

  const add = useMut(async () => {
    const num = Number(amount);
    if (!num || num <= 0) throw new Error("Введите сумму");
    const { error } = await (await sb()).from("finance").insert({
      student_id: studentId,
      amount: num,
      currency,
      is_paid: isPaid,
      pay_date: date,
    });
    if (error) throw error;
  }, ["finance"]);

  const toggle = useMut(async (f: any) => {
    const { error } = await (await sb()).from("finance").update({ is_paid: !f.is_paid }).eq("id", f.id);
    if (error) throw error;
  }, ["finance"]);

  const del = useMut(async (id: string) => {
    const { error } = await (await sb()).from("finance").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }, ["finance"]);

  return (
    <>
      <Card className="mt-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
            <option value="RUB">₽ RUB</option>
            <option value="USD">$ USD</option>
            <option value="EGP">£ EGP</option>
          </Select>
          <Input
            inputMode="decimal"
            placeholder="Сумма"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="col-span-2"
          />
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2" />
        <button
          onClick={() => setIsPaid((p) => !p)}
          className={`mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold ${
            isPaid ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : "bg-destructive/15 text-destructive"
          }`}
        >
          {isPaid ? "✓ Оплачено" : "✗ Не оплачено"}
        </button>
        <Button
          variant="gold"
          className="mt-3 w-full"
          disabled={!amount || add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              setAmount("");
              toast.success("Платёж добавлен");
            } catch (e: any) {
              toast.error(e?.message ?? "Ошибка");
            }
          }}
        >
          <Wallet className="h-4 w-4" /> Добавить платёж
        </Button>
      </Card>

      <SectionTitle>Платежи ({fin.length})</SectionTitle>
      {fin.length === 0 ? (
        <Empty icon={<Wallet className="h-8 w-8" />} title="Платежей пока нет" />
      ) : (
        <div className="space-y-2">
          {fin.map((f) => {
            const sym = f.currency === "RUB" ? "₽" : f.currency === "USD" ? "$" : "£";
            return (
              <Card key={f.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="num text-base text-foreground">
                    {Number(f.amount).toLocaleString("ru-RU")} {sym}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {f.pay_date ? new Date(f.pay_date).toLocaleDateString("ru-RU") : "—"}
                  </div>
                </div>
                <button
                  onClick={() => toggle.mutateAsync(f)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    f.is_paid
                      ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {f.is_paid ? "Оплачено" : "Долг"}
                </button>
                <button
                  onClick={async () => {
                    await del.mutateAsync(f.id);
                    toast.success("Удалено");
                  }}
                  className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </>
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

function StatusSwitcher({ studentId, current }: { studentId: string; current: StudentStatus }) {
  const upd = useMut(async (next: StudentStatus) => {
    const { error } = await (await sb()).from("students").update({ status: next }).eq("id", studentId);
    if (error) throw error;
  }, ["students"]);
  const items: StudentStatus[] = ["active", "paused", "completed", "archived"];
  return (
    <div className="mt-3 flex gap-1.5 overflow-x-auto -mx-1 px-1">
      {items.map((s) => {
        const meta = STUDENT_STATUS_META[s];
        const active = current === s;
        return (
          <button
            key={s}
            type="button"
            disabled={upd.isPending}
            onClick={() => {
              if (active) return;
              upd.mutate(s, {
                onSuccess: () => toast.success(`Статус: ${meta.label}`),
                onError: (e: any) => toast.error(e?.message ?? "Ошибка"),
              });
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              active
                ? "bg-accent text-accent-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function TimelineTab({ att, hw, fin }: { att: any[]; hw: any[]; fin: any[] }) {
  type Item = {
    id: string;
    date: string;
    kind: "lesson" | "payment" | "homework" | "note";
    title: string;
    sub?: string;
    tone: "success" | "danger" | "gold" | "neutral";
    icon: React.ReactNode;
  };

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const a of att) {
      const meta = ATT_STATUS[a.status as AttendanceStatus];
      out.push({
        id: `a-${a.id}`,
        date: a.date,
        kind: "lesson",
        title: `Урок · ${meta.label}`,
        sub: a.note || undefined,
        tone: meta.tone,
        icon: <CalendarCheck className="h-3.5 w-3.5" />,
      });
      if (a.note) {
        out.push({
          id: `n-${a.id}`,
          date: a.date,
          kind: "note",
          title: "Заметка",
          sub: a.note,
          tone: "neutral",
          icon: <StickyNote className="h-3.5 w-3.5" />,
        });
      }
    }
    for (const h of hw) {
      const meta = HW_STATUS[h.status as HomeworkStatus];
      out.push({
        id: `h-${h.id}`,
        date: h.assigned_date,
        kind: "homework",
        title: `ДЗ · ${meta.label}`,
        sub: h.task,
        tone: meta.tone,
        icon: <BookOpen className="h-3.5 w-3.5" />,
      });
    }
    for (const f of fin) {
      const d = f.pay_date || (f.created_at ? String(f.created_at).slice(0, 10) : "");
      out.push({
        id: `f-${f.id}`,
        date: d,
        kind: "payment",
        title: f.is_paid ? "Оплата получена" : "Начислен платёж",
        sub: `${Number(f.amount).toLocaleString("ru-RU")} ${f.currency}`,
        tone: f.is_paid ? "success" : "danger",
        icon: <Wallet className="h-3.5 w-3.5" />,
      });
    }
    return out
      .filter((i) => i.date)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [att, hw, fin]);

  if (items.length === 0) {
    return <Empty icon={<HistoryIcon className="h-8 w-8" />} title="История пуста" hint="Добавьте уроки, ДЗ или оплаты" />;
  }

  const toneClasses: Record<Item["tone"], string> = {
    success: "bg-[color:var(--success)]/15 text-[color:var(--success)] border-[color:var(--success)]/30",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
    gold: "bg-accent/15 text-accent border-accent/30",
    neutral: "bg-secondary text-muted-foreground border-border",
  };

  return (
    <div className="mt-4">
      <div className="relative pl-6">
        <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="relative">
              <div className={`absolute -left-6 top-1 flex h-6 w-6 items-center justify-center rounded-full border ${toneClasses[it.tone]}`}>
                {it.icon}
              </div>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-foreground">{it.title}</div>
                    {it.sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{it.sub}</div>}
                  </div>
                  <div className="num text-[11px] text-muted-foreground shrink-0">
                    {new Date(it.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

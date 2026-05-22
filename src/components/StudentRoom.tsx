import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import {
  useStudents,
  useAttendance,
  useHomework,
  useFinance,
  useMut,
  initials,
  type HomeworkStatus,
} from "@/lib/db";
import { sb } from "@/lib/sb";
import { CalendarCheck, BookOpen, Wallet, Check, Trash2, Phone, Target } from "lucide-react";

const LESSONS_PER_CYCLE = 12;

const ATT_STATUS = {
  present: { label: "Был", emoji: "✅", tone: "success" as const },
  absent: { label: "Не был", emoji: "❌", tone: "danger" as const },
  excused: { label: "Уваж.", emoji: "📎", tone: "gold" as const },
};

const HW_STATUS: Record<HomeworkStatus, { label: string; emoji: string; tone: "success" | "danger" | "gold" | "neutral" }> = {
  assigned: { label: "Задано", emoji: "📝", tone: "neutral" },
  done: { label: "Сделано", emoji: "✅", tone: "success" },
  partial: { label: "Частично", emoji: "🟡", tone: "gold" },
  not_done: { label: "Не сделал", emoji: "❌", tone: "danger" },
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

  const presentCount = att.filter((a) => a.status === "present").length;
  const cyclesCompleted = Math.floor(presentCount / LESSONS_PER_CYCLE);
  const progress = presentCount % LESSONS_PER_CYCLE;
  const paidCount = fin.filter((f) => f.is_paid).length;
  const needsPayment = cyclesCompleted > paidCount;

  const [tab, setTab] = useState<"att" | "hw" | "fin">("att");

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

        <div className="mt-4 rounded-xl bg-secondary p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Цикл уроков</div>
            {needsPayment ? (
              <Badge tone="danger">Нужна оплата</Badge>
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
            Всего уроков: <span className="num text-foreground">{presentCount}</span> · Завершено циклов:{" "}
            <span className="num text-foreground">{cyclesCompleted}</span> · Оплачено:{" "}
            <span className="num text-foreground">{paidCount}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Mini n={att.length} label="Уроков" />
          <Mini n={hw.filter((h) => h.status === "done").length} label="ДЗ ✓" />
          <Mini n={fin.filter((f) => !f.is_paid).length} label="Долгов" />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <TabBtn active={tab === "att"} onClick={() => setTab("att")} icon={<CalendarCheck className="h-4 w-4" />} label="Посещения" />
        <TabBtn active={tab === "hw"} onClick={() => setTab("hw")} icon={<BookOpen className="h-4 w-4" />} label="ДЗ" />
        <TabBtn active={tab === "fin"} onClick={() => setTab("fin")} icon={<Wallet className="h-4 w-4" />} label="Оплаты" />
      </div>

      {tab === "att" && (
        <AttendanceTab
          studentId={id}
          att={att}
          presentCountBefore={presentCount}
          needsPayment={needsPayment}
          oldestUnpaid={fin.filter((f) => !f.is_paid).slice(-1)[0]}
        />
      )}
      {tab === "hw" && <HomeworkTab studentId={id} hw={hw} />}
      {tab === "fin" && <FinanceTab studentId={id} fin={fin} />}
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
  presentCountBefore,
  needsPayment,
  oldestUnpaid,
}: {
  studentId: string;
  att: any[];
  presentCountBefore: number;
  needsPayment: boolean;
  oldestUnpaid: any | undefined;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<keyof typeof ATT_STATUS>("present");
  const [note, setNote] = useState("");

  const add = useMut(async () => {
    const sup = await sb();
    const { error } = await sup.from("attendance").insert({
      student_id: studentId,
      date,
      status,
      note: note.trim() || null,
    });
    if (error) throw error;

    if (status === "present") {
      const newCount = presentCountBefore + 1;
      if (newCount % LESSONS_PER_CYCLE === 0 && oldestUnpaid && !oldestUnpaid.is_paid) {
        const { error: e2 } = await sup
          .from("finance")
          .update({ is_paid: true, pay_date: date })
          .eq("id", oldestUnpaid.id);
        if (e2) throw e2;
        toast.success("12 уроков! Оплата отмечена как полученная 💰");
      } else if (newCount % LESSONS_PER_CYCLE === 0) {
        toast.success("Цикл из 12 уроков завершён — добавьте оплату");
      }
    }
  }, ["attendance", "finance"]);

  const del = useMut(async (id: string) => {
    const { error } = await (await sb()).from("attendance").delete().eq("id", id);
    if (error) throw error;
  }, ["attendance"]);

  return (
    <>
      <Card className="mt-4 p-4">
        {needsPayment && (
          <div className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠️ Цикл из 12 уроков пройден — добавьте оплату во вкладке «Оплаты»
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Статус">
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              {Object.entries(ATT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.emoji} {v.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
        </Field>
        <Button
          variant="gold"
          className="mt-3 w-full"
          disabled={add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              setNote("");
              toast.success("Записано");
            } catch (e: any) {
              toast.error(e?.message ?? "Ошибка");
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
            const cfg = ATT_STATUS[r.status as keyof typeof ATT_STATUS];
            return (
              <Card key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-lg">
                  {cfg?.emoji ?? "·"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-foreground">
                    {new Date(r.date).toLocaleDateString("ru-RU")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cfg?.label}
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
    const { error } = await (await sb()).from("homework").delete().eq("id", id);
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
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
                    {cfg.emoji}
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
    const { error } = await (await sb()).from("finance").delete().eq("id", id);
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

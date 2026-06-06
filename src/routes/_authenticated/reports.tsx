import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, Button, Input, Select, SectionTitle, Empty } from "@/components/ui-bits";
import {
  useStudents,
  useFinance,
  useHomework,
  useAttendance,
  formatMoney,
  STUDENT_STATUS_META,
  groupByStudentId,
  type Student,
  type Finance,
  type Homework,
  type Attendance,
} from "@/lib/db";
import { listLessons } from "@/lib/lessons.functions";
import { FileText, Printer, User2, CalendarCheck, Wallet, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

type View = "menu" | "student" | "attendance" | "finance";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function ReportsPage() {
  const [view, setView] = useState<View>("menu");

  return (
    <div className="px-4 pt-6 pb-32">
      {view === "menu" ? (
        <Menu onPick={setView} />
      ) : (
        <>
          <div className="no-print mb-3 flex items-center justify-between">
            <button
              onClick={() => setView("menu")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> К отчётам
            </button>
            <Button variant="gold" data-haptic="medium" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Печать / PDF
            </Button>
          </div>
          <div className="print-area">
            {view === "student" && <StudentReport />}
            {view === "attendance" && <AttendanceReport />}
            {view === "finance" && <FinanceReport />}
          </div>
        </>
      )}
    </div>
  );
}

function Menu({ onPick }: { onPick: (v: View) => void }) {
  const items: { id: View; title: string; hint: string; icon: React.ReactNode }[] = [
    { id: "student", title: "Отчёт по ученикам", hint: "Контакты, статус, оплата, ДЗ", icon: <User2 className="h-5 w-5" /> },
    { id: "attendance", title: "Отчёт по посещаемости", hint: "Уроки за период", icon: <CalendarCheck className="h-5 w-5" /> },
    { id: "finance", title: "Финансовый отчёт", hint: "Доход и задолженности", icon: <Wallet className="h-5 w-5" /> },
  ];
  return (
    <>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Отчёты</h1>
        <p className="mt-1 text-sm text-muted-foreground">Печатные сводки с экспортом в PDF</p>
      </header>
      <div className="mt-5 grid gap-3">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onPick(it.id)}
            data-haptic="medium"
            className="tap-pulse group flex items-center gap-3 rounded-2xl bg-white/60 p-4 text-left transition-all hover:-translate-y-0.5 dark:bg-white/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
              {it.icon}
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-semibold text-foreground">{it.title}</span>
              <span className="text-xs text-muted-foreground">{it.hint}</span>
            </span>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </>
  );
}

function PrintHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      <p className="mt-0.5 text-[11px] text-muted-foreground">Сформировано: {new Date().toLocaleString("ru-RU")}</p>
    </div>
  );
}

/* ───────────── Student Report ───────────── */

function StudentReport() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const { data: homework = [] } = useHomework();
  const { data: attendance = [] } = useAttendance();
  const [selected, setSelected] = useState<string>("__all__");

  const list = useMemo(() => {
    if (selected === "__all__") return students;
    return students.filter((s) => s.id === selected);
  }, [students, selected]);
  const financeByStudent = useMemo(() => groupByStudentId(finance), [finance]);
  const homeworkByStudent = useMemo(() => groupByStudentId(homework), [homework]);
  const attendanceByStudent = useMemo(() => groupByStudentId(attendance), [attendance]);

  return (
    <>
      <div className="no-print mb-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Ученик</span>
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="__all__">Все ученики</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </label>
      </div>

      <PrintHeader title="Отчёт по ученикам" sub={`Учеников в отчёте: ${list.length}`} />

      {list.length === 0 ? (
        <Empty icon={<User2 className="h-8 w-8" />} title="Нет данных" />
      ) : (
        <div className="space-y-4">
          {list.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              finance={financeByStudent.get(s.id) ?? []}
              homework={homeworkByStudent.get(s.id) ?? []}
              attendance={attendanceByStudent.get(s.id) ?? []}
            />
          ))}
        </div>
      )}
    </>
  );
}

function StudentCard({
  student,
  finance,
  homework,
  attendance,
}: {
  student: Student;
  finance: Finance[];
  homework: Homework[];
  attendance: Attendance[];
}) {
  const attended = attendance.filter((a) => a.status === "present").length;
  const paid = finance.filter((f) => f.is_paid).reduce((s, f) => s + Number(f.amount), 0);
  const owed = finance.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.amount), 0);
  const currency = finance[0]?.currency ?? "RUB";
  const doneHw = homework.filter((h) => h.status === "done").length;
  const totalHw = homework.length;
  const rate = totalHw ? Math.round((doneHw / totalHw) * 100) : 0;
  const meta = STUDENT_STATUS_META[student.status];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{student.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {student.subject ?? "—"} · {student.phone ?? "—"}
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {meta.label}
        </span>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          <tr>
            <th className="w-2/3 text-left font-normal text-muted-foreground">Уроков посещено</th>
            <td className="text-right num font-semibold">{attended}</td>
          </tr>
          <tr>
            <th className="text-left font-normal text-muted-foreground">Всего оплачено</th>
            <td className="text-right num font-semibold">{formatMoney(paid, currency)}</td>
          </tr>
          <tr>
            <th className="text-left font-normal text-muted-foreground">Задолженность</th>
            <td className="text-right num font-semibold">{formatMoney(owed, currency)}</td>
          </tr>
          <tr>
            <th className="text-left font-normal text-muted-foreground">Выполнение ДЗ</th>
            <td className="text-right num font-semibold">{doneHw} / {totalHw} ({rate}%)</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

/* ───────────── Attendance Report ───────────── */

function AttendanceReport() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const { data: students = [] } = useStudents();
  const listFn = useServerFn(listLessons);

  const { data, isLoading } = useQuery({
    queryKey: ["report-lessons", from, to],
    queryFn: () => listFn({ data: { from, to } }),
    enabled: !!from && !!to,
  });

  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const lessons = (data?.lessons ?? []).filter((l) => l.status !== "moved");
  const totals = useMemo(() => {
    const t = { planned: 0, completed: 0, cancelled: 0 };
    for (const l of lessons) {
      if (l.status === "planned") t.planned++;
      else if (l.status === "completed") t.completed++;
      else if (l.status === "cancelled") t.cancelled++;
    }
    return t;
  }, [lessons]);

  return (
    <>
      <div className="no-print mb-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">С</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">По</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <PrintHeader title="Отчёт по посещаемости" sub={`Период: ${from} — ${to}`} />

      <Card className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Дата</th>
              <th className="text-left">Время</th>
              <th className="text-left">Ученик</th>
              <th className="text-left">Статус</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-muted-foreground">Загрузка…</td></tr>
            ) : lessons.length === 0 ? (
              <tr><td colSpan={4} className="text-muted-foreground">Нет уроков за период</td></tr>
            ) : lessons.map((l) => (
              <tr key={l.id}>
                <td className="num">{l.scheduled_date}</td>
                <td className="num">{String(l.scheduled_time).slice(0, 5)}</td>
                <td>{studentsById.get(l.student_id)?.name ?? "—"}</td>
                <td>
                  {l.status === "planned" ? "Запланирован"
                    : l.status === "completed" ? "Проведён"
                    : l.status === "cancelled" ? "Отменён" : "Перенесён"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2 className="mt-5 text-base font-semibold text-foreground">Итого</h2>
      <Card className="mt-2 p-4">
        <table className="w-full text-sm">
          <tbody>
            <tr><th className="text-left font-normal text-muted-foreground">Проведено</th><td className="text-right num font-semibold">{totals.completed}</td></tr>
            <tr><th className="text-left font-normal text-muted-foreground">Отменено</th><td className="text-right num font-semibold">{totals.cancelled}</td></tr>
            <tr><th className="text-left font-normal text-muted-foreground">Запланировано</th><td className="text-right num font-semibold">{totals.planned}</td></tr>
            <tr><th className="text-left font-normal text-muted-foreground">Всего</th><td className="text-right num font-semibold">{lessons.length}</td></tr>
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* ───────────── Finance Report ───────────── */

function FinanceReport() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const inRange = useMemo(() => {
    return finance.filter((f) => {
      const d = f.pay_date ?? f.created_at.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [finance, from, to]);

  const byStudent = useMemo(() => {
    const m = new Map<string, { paid: number; pending: number; currency: string }>();
    for (const f of inRange) {
      const cur = m.get(f.student_id) ?? { paid: 0, pending: 0, currency: f.currency };
      if (f.is_paid) cur.paid += Number(f.amount);
      else cur.pending += Number(f.amount);
      m.set(f.student_id, cur);
    }
    return m;
  }, [inRange]);

  const totalPaid = inRange.filter((f) => f.is_paid).reduce((s, f) => s + Number(f.amount), 0);
  const totalPending = inRange.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.amount), 0);
  const currency = inRange[0]?.currency ?? "RUB";

  const byMonth = useMemo(() => {
    const m = new Map<string, { paid: number; pending: number }>();
    for (const f of inRange) {
      const d = f.pay_date ?? f.created_at.slice(0, 10);
      const key = d.slice(0, 7);
      const cur = m.get(key) ?? { paid: 0, pending: 0 };
      if (f.is_paid) cur.paid += Number(f.amount);
      else cur.pending += Number(f.amount);
      m.set(key, cur);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [inRange]);

  return (
    <>
      <div className="no-print mb-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">С</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">По</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <PrintHeader title="Финансовый отчёт" sub={`Период: ${from} — ${to}`} />

      <Card className="p-4">
        <table className="w-full text-sm">
          <tbody>
            <tr><th className="text-left font-normal text-muted-foreground">Всего получено</th><td className="text-right num font-semibold">{formatMoney(totalPaid, currency)}</td></tr>
            <tr><th className="text-left font-normal text-muted-foreground">Ожидается</th><td className="text-right num font-semibold">{formatMoney(totalPending, currency)}</td></tr>
          </tbody>
        </table>
      </Card>

      <SectionTitle>Доход по ученикам</SectionTitle>
      <Card className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Ученик</th>
              <th className="text-right">Получено</th>
              <th className="text-right">Ожидается</th>
            </tr>
          </thead>
          <tbody>
            {byStudent.size === 0 ? (
              <tr><td colSpan={3} className="text-muted-foreground">Нет операций за период</td></tr>
            ) : Array.from(byStudent.entries()).map(([sid, v]) => {
              const s = studentsById.get(sid);
              return (
                <tr key={sid}>
                  <td>{s?.name ?? "—"}</td>
                  <td className="text-right num">{formatMoney(v.paid, v.currency)}</td>
                  <td className="text-right num">{formatMoney(v.pending, v.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <SectionTitle>По месяцам</SectionTitle>
      <Card className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Месяц</th>
              <th className="text-right">Получено</th>
              <th className="text-right">Ожидается</th>
            </tr>
          </thead>
          <tbody>
            {byMonth.length === 0 ? (
              <tr><td colSpan={3} className="text-muted-foreground">—</td></tr>
            ) : byMonth.map(([m, v]) => (
              <tr key={m}>
                <td className="num">{m}</td>
                <td className="text-right num">{formatMoney(v.paid, currency)}</td>
                <td className="text-right num">{formatMoney(v.pending, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

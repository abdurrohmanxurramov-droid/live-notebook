import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, SectionTitle, Avatar, Badge, Empty, Button } from "@/components/ui-bits";
import { StudentRoom } from "@/components/StudentRoom";
import { useStudents, useFinance, useRates, useSchedule, useMut, initials, convertToRUB, formatMoney, STUDENT_STATUS_META } from "@/lib/db";
import { sb } from "@/lib/sb";
import { Wallet, GraduationCap, CheckCircle2, AlertTriangle, Plus, CalendarPlus, UserPlus, Sparkles, Clock, CalendarDays, X, Search, AlertCircle, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({ component: Home });

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function Home() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const { data: rates } = useRates();
  const { data: schedule = [] } = useSchedule();
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    document.body.style.overflow = openId ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [openId]);


  const todayDow = (new Date().getDay() + 6) % 7;
  const todayLessons = useMemo(
    () => schedule.filter((s) => s.day_of_week === todayDow).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [schedule, todayDow]
  );
  const studentsById = useMemo(() => {
    const m = new Map<string, (typeof students)[number]>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const stats = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    let incomeRUB = 0;
    let paid = 0;
    let unpaid = 0;
    for (const f of finance) {
      const d = f.pay_date ? new Date(f.pay_date) : new Date(f.created_at);
      const inMonth = d.getMonth() === m && d.getFullYear() === y;
      if (rates && inMonth && f.is_paid) incomeRUB += convertToRUB(Number(f.amount), f.currency, rates);
      if (f.is_paid) paid += 1; else unpaid += 1;
    }
    return { incomeRUB: Math.round(incomeRUB), paid, unpaid };
  }, [finance, rates]);

  const dateLabel = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });

  const metrics = [
    { icon: Wallet, label: "Доход за месяц", value: stats.incomeRUB.toLocaleString("ru-RU") + " ₽", tone: "gold" },
    { icon: GraduationCap, label: "Ученики", value: String(students.length), tone: "navy" },
    { icon: CheckCircle2, label: "Оплатили", value: String(stats.paid), tone: "success" },
    { icon: AlertTriangle, label: "Должники", value: String(stats.unpaid), tone: "danger" },
  ] as const;

  const toneClasses: Record<string, string> = {
    gold: "text-accent",
    navy: "text-foreground",
    success: "text-[color:var(--success)]",
    danger: "text-destructive",
  };

  return (
    <div className="px-4 pt-6">
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {greetingForNow()}
          <Sparkles className="ml-2 inline h-5 w-5 text-accent" />
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} className="p-4">
              <Icon className={`h-5 w-5 ${toneClasses[m.tone]}`} strokeWidth={2.2} />
              <div className="mt-3 num text-2xl text-foreground">{m.value}</div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{m.label}</div>
            </Card>
          );
        })}
      </div>

      <PaymentsWidget />

      <SectionTitle>Быстрые действия</SectionTitle>
      <div className="grid grid-cols-4 gap-3">
        <QuickAction to="/attendance" icon={<CalendarPlus className="h-5 w-5" />} label="Урок" />
        <QuickAction to="/assistant" icon={<Sparkles className="h-5 w-5" />} label="ИИ" />
        <QuickAction to="/finance" icon={<Plus className="h-5 w-5" />} label="Оплата" />
        <QuickAction to="/students" icon={<UserPlus className="h-5 w-5" />} label="Ученик" />
      </div>

      <SectionTitle action={<Link to="/schedule" className="text-xs font-medium text-accent">Открыть →</Link>}>

        Сегодня
      </SectionTitle>
      {todayLessons.length === 0 ? (
        <Card className="px-4 py-5 text-center">
          <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">Сегодня уроков нет</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Отдыхайте или запланируйте новый</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {todayLessons.map((slot) => {
            const st = studentsById.get(slot.student_id);
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => st && setOpenId(st.id)}
                className="block w-full text-left"
              >
                <Card className="flex items-center gap-3 p-3 transition-colors active:bg-secondary">
                  <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-accent/10 px-2 py-1.5">
                    <span className="num text-sm leading-tight text-accent">{slot.start_time.slice(0, 5)}</span>
                    <span className="text-[10px] text-muted-foreground">{slot.duration_min} мин</span>
                  </div>
                  <Avatar initials={initials(st?.name ?? "?")} />
                  <div className="min-w-0 flex-1">
                    <div className="name-italic truncate text-[14px] font-semibold text-foreground">{st?.name ?? "—"}</div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {st?.subject || "Урок"}
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <SectionTitle action={<Link to="/students" className="text-xs font-medium text-accent">Все →</Link>}>
        Ученики
      </SectionTitle>
      {students.length === 0 ? (
        <Empty
          icon={<GraduationCap className="h-8 w-8" />}
          title="Пока никого нет"
          hint="Добавьте первого ученика во вкладке «Ученики»"
        />
      ) : (
        <>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по имени, предмету, телефону"
              className="w-full rounded-2xl border border-border/60 bg-card py-2.5 pl-9 pr-9 text-sm text-foreground outline-none transition-colors focus:border-accent"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Очистить"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        <div className="space-y-2 pb-4">
          {students
            .filter((s) => {
              if (!q.trim()) return true;
              const needle = q.trim().toLowerCase();
              return (
                s.name.toLowerCase().includes(needle) ||
                (s.subject ?? "").toLowerCase().includes(needle) ||
                (s.phone ?? "").toLowerCase().includes(needle)
              );
            })
            .map((s) => {
            const fin = finance.filter((f) => f.student_id === s.id);
            const hasUnpaid = fin.some((f) => !f.is_paid);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpenId(s.id)}
                className="block w-full text-left"
              >
                <Card className="flex items-center gap-3 p-3 transition-colors active:bg-secondary">
                  <Avatar initials={initials(s.name)} />
                  <div className="min-w-0 flex-1">
                    <div className="name-italic truncate text-[15px] font-semibold text-foreground">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.days_per_week} {pluralDays(s.days_per_week)} · {s.subject || "—"}
                    </div>
                  </div>
                  {fin.length === 0 ? (
                    <Badge>—</Badge>
                  ) : hasUnpaid ? (
                    <Badge tone="danger">Должник</Badge>
                  ) : (
                    <Badge tone="success">Оплачено</Badge>
                  )}
                </Card>
              </button>
            );
          })}
        </div>
        </>
      )}

      {openId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpenId(null)} />
          <div className="relative z-10 flex h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-background shadow-2xl sm:h-[88vh] sm:rounded-2xl animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h3 className="text-base font-semibold tracking-tight text-foreground">Карточка ученика</h3>
              <button
                onClick={() => setOpenId(null)}
                aria-label="Закрыть"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
              <StudentRoom id={openId} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card py-4 text-center transition-colors active:bg-secondary"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">{icon}</div>
      <span className="mt-2 text-xs font-medium text-foreground">{label}</span>
    </Link>
  );
}

function pluralDays(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день / нед";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня / нед";
  return "дней / нед";
}

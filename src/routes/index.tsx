import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, SectionTitle, Avatar, Badge, Empty } from "@/components/ui-bits";
import { useStudents, useFinance, useRates, formatMoney, initials, convertToRUB } from "@/lib/db";
import { Wallet, GraduationCap, CheckCircle2, AlertTriangle, Plus, CalendarPlus, UserPlus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

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

      <SectionTitle>Быстрые действия</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <QuickAction to="/attendance" icon={<CalendarPlus className="h-5 w-5" />} label="Урок" />
        <QuickAction to="/finance" icon={<Plus className="h-5 w-5" />} label="Оплата" />
        <QuickAction to="/students" icon={<UserPlus className="h-5 w-5" />} label="Ученик" />
      </div>

      <SectionTitle>Недавние ученики</SectionTitle>
      {students.length === 0 ? (
        <Empty
          icon={<GraduationCap className="h-8 w-8" />}
          title="Пока никого нет"
          hint="Добавьте первого ученика во вкладке «Ученики»"
        />
      ) : (
        <div className="space-y-2">
          {students.slice(0, 5).map((s) => {
            const fin = finance.filter((f) => f.student_id === s.id);
            const hasUnpaid = fin.some((f) => !f.is_paid);
            return (
              <Card key={s.id} className="flex items-center gap-3 p-3">
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
            );
          })}
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, SectionTitle, Avatar, Badge, Empty, Button } from "@/components/ui-bits";
import { CountUp } from "@/components/CountUp";
import { StudentRoom } from "@/components/StudentRoom";
import { GlassChips } from "@/components/GlassChips";
import { useStudents, useFinance, useRates, useSchedule, useAttendance, useHomework, useMut, initials, convertToRUB, formatMoney, STUDENT_STATUS_META } from "@/lib/db";
import { getSettings } from "@/lib/settings.functions";
import { sb } from "@/lib/sb";
import { Wallet, GraduationCap, CheckCircle2, AlertTriangle, Sparkles, Clock, CalendarDays, X, Search, AlertCircle, Check, BookOpen, TrendingUp, PlayCircle, BarChart3, FileText } from "lucide-react";


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
  const [teacherName, setTeacherName] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const client = await sb();
        const { data } = await client.auth.getUser();
        const u = data.user;
        if (!u) return;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const raw = (meta.full_name as string) || (meta.name as string) || (meta.display_name as string) || "";
        const fromName = raw.trim().split(/\s+/)[0];
        const fromEmail = u.email ? u.email.split("@")[0].split(/[._-]/)[0] : "";
        const pick = fromName || fromEmail || "";
        setTeacherName(pick ? pick.charAt(0).toUpperCase() + pick.slice(1) : "");
      } catch {}
    })();
  }, []);

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
          {greetingForNow()}{teacherName ? `, ${teacherName}` : ""}
          <GraduationCap className="ml-2 inline h-6 w-6 text-accent bloom-hide" strokeWidth={2.2} />
          <span className="ml-2 hidden bloom-show align-middle text-2xl" aria-hidden>🌸</span>
        </h1>
      </header>

      <Overview />
      <ContinueCard onOpen={(sid) => setOpenId(sid)} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <QuickAction to="/assistant" icon={<Sparkles className="h-5 w-5" />} label="ИИ" />
        <QuickAction to="/analytics" icon={<BarChart3 className="h-5 w-5" />} label="Аналитика" />
        <QuickAction to="/reports" icon={<FileText className="h-5 w-5" />} label="Отчёты" />
        <QuickAction to="/homework" icon={<BookOpen className="h-5 w-5" />} label="Журнал" />
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
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = fin.some((f) => !f.is_paid && f.pay_date && f.pay_date < today);
            const meta = STUDENT_STATUS_META[s.status];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpenId(s.id)}
                className="block w-full text-left"
              >
                <Card className={`flex items-center gap-3 p-3 transition-colors active:bg-secondary ${isOverdue ? "ring-1 ring-destructive/60" : ""}`}>
                  <Avatar initials={initials(s.name)} />
                  <div className="min-w-0 flex-1">
                    <div className="name-italic flex items-center gap-1.5 truncate text-[15px] font-semibold text-foreground">
                      {s.name}
                      {isOverdue && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="truncate">{s.days_per_week} {pluralDays(s.days_per_week)} · {s.subject || "—"}</span>
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
      className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl px-2 py-4 text-center ring-1 ring-white/40 dark:ring-white/10 shadow-[0_8px_24px_-12px_rgba(20,33,61,0.18),inset_0_1px_0_0_rgba(255,255,255,0.55)] transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
        WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/15"
      />
      <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent/25 to-accent/10 text-accent ring-1 ring-white/40 transition-transform duration-300 group-hover:scale-110 group-active:scale-95 dark:ring-white/10">
        {icon}
      </div>
      <span className="relative mt-2 text-xs font-medium text-foreground">{label}</span>
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

function PaymentsWidget() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const studentsById = useMemo(() => {
    const m = new Map<string, (typeof students)[number]>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7iso = in7.toISOString().slice(0, 10);

  const overdueRows = useMemo(() => {
    const map = new Map<string, { amount: number; currency: string; days: number; firstId: string }>();
    for (const f of finance) {
      if (f.is_paid || !f.pay_date || f.pay_date >= today) continue;
      const days = Math.floor((Date.parse(today) - Date.parse(f.pay_date)) / 86400000);
      const cur = map.get(f.student_id);
      if (cur) {
        cur.amount += Number(f.amount);
        cur.days = Math.max(cur.days, days);
      } else {
        map.set(f.student_id, { amount: Number(f.amount), currency: f.currency, days, firstId: f.id });
      }
    }
    return Array.from(map.entries())
      .map(([sid, v]) => ({ studentId: sid, ...v }))
      .sort((a, b) => b.days - a.days);
  }, [finance, today]);

  const upcomingRows = useMemo(() => {
    return finance
      .filter((f) => !f.is_paid && f.pay_date && f.pay_date >= today && f.pay_date <= in7iso)
      .sort((a, b) => (a.pay_date ?? "").localeCompare(b.pay_date ?? ""));
  }, [finance, today, in7iso]);

  const totalUnpaid = overdueRows.reduce((acc, r) => acc + r.amount, 0);

  const markPaid = useMut(async (id: string) => {
    const { error } = await (await sb()).from("finance").update({ is_paid: true }).eq("id", id);
    if (error) throw error;
  }, ["finance"]);

  if (overdueRows.length === 0 && upcomingRows.length === 0) return null;

  return (
    <>
      <SectionTitle action={<Link to="/finance" className="text-xs font-medium text-accent">Все →</Link>}>
        Платежи
      </SectionTitle>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Просрочено всего</div>
            <div className="mt-1 num text-2xl text-destructive">
              {overdueRows.length === 0 ? "—" : formatMoney(totalUnpaid, overdueRows[0]?.currency ?? "RUB")}
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>

        {overdueRows.length > 0 && (
          <div className="mt-3 space-y-2">
            {overdueRows.slice(0, 5).map((r) => {
              const st = studentsById.get(r.studentId);
              if (!st) return null;
              return (
                <div key={r.studentId} className="flex items-center gap-2 rounded-xl bg-destructive/5 p-2.5">
                  <Avatar initials={initials(st.name)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-foreground">{st.name}</div>
                    <div className="text-[11px] text-destructive">
                      {formatMoney(r.amount, r.currency)} · {r.days} дн просрочки
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      markPaid.mutate(r.firstId, {
                        onSuccess: () => toast.success("Платёж отмечен"),
                        onError: (e: any) => toast.error(e?.message ?? "Ошибка"),
                      });
                    }}
                    disabled={markPaid.isPending}
                    className="h-8 px-2 text-xs"
                  >
                    <Check className="h-3.5 w-3.5" /> Оплачен
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {upcomingRows.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ближайшие 7 дней</div>
            <div className="mt-2 space-y-1.5">
              {upcomingRows.slice(0, 5).map((f) => {
                const st = studentsById.get(f.student_id);
                if (!st) return null;
                return (
                  <div key={f.id} className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate text-[13px] text-foreground">{st.name}</span>
                    </div>
                    <div className="num text-[12px] text-foreground shrink-0">
                      {formatMoney(Number(f.amount), f.currency)} · {f.pay_date?.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function useDashData() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const { data: schedule = [] } = useSchedule();
  const { data: attendance = [] } = useAttendance();
  const { data: homework = [] } = useHomework();
  const getSettingsFn = useServerFn(getSettings);
  const { data: settings } = useQuery({ queryKey: ["user_settings"], queryFn: () => getSettingsFn({}) });
  return { students, finance, schedule, attendance, homework, settings };
}

function todayDowMon0() { return (new Date().getDay() + 6) % 7; }

function Overview() {
  const { finance, schedule, homework, attendance, settings } = useDashData();
  const [period, setPeriod] = useState<"today" | "week">(() => {
    if (typeof window === "undefined") return "today";
    return (localStorage.getItem("home-overview-period") as "today" | "week") || "today";
  });
  useEffect(() => {
    try { localStorage.setItem("home-overview-period", period); } catch {}
  }, [period]);

  const todayDow = todayDowMon0();
  const price = Number(settings?.default_lesson_price ?? 0);
  const currency = settings?.default_currency ?? "RUB";

  const todayLessons = useMemo(
    () => schedule.filter((s) => s.day_of_week === todayDow).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [schedule, todayDow]
  );
  const timesLine = todayLessons.map((s) => s.start_time.slice(0, 5)).join(" · ");
  const expectedToday = todayLessons.length * price;
  const studentsUnpaid = useMemo(() => {
    const ids = new Set<string>();
    for (const f of finance) if (!f.is_paid) ids.add(f.student_id);
    return ids.size;
  }, [finance]);
  const hwWaiting = useMemo(() => homework.filter((h) => h.status === "assigned").length, [homework]);

  const weekLessons = schedule.length;
  const expectedWeek = weekLessons * price;
  const { mondayIso, sundayIso } = useMemo(() => {
    const now = new Date();
    const dow = todayDowMon0();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - dow);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { mondayIso: monday.toISOString().slice(0, 10), sundayIso: sunday.toISOString().slice(0, 10) };
  }, []);
  const rate = useMemo(() => {
    const weekAtt = attendance.filter((a) => a.date >= mondayIso && a.date <= sundayIso);
    const counted = weekAtt.filter((a) => a.status === "present" || a.status === "absent");
    if (counted.length === 0) return 0;
    return Math.round((counted.filter((a) => a.status === "present").length / counted.length) * 100);
  }, [attendance, mondayIso, sundayIso]);

  return (
    <>
      <div className="mt-1 flex items-center justify-between gap-3">
        <SectionTitle>Обзор</SectionTitle>
        <div className="-mt-1">
          <GlassChips<"today" | "week">
            active={period}
            onChange={setPeriod}
            items={[
              { key: "today", label: "Сегодня" },
              { key: "week", label: "Неделя" },
            ]}
          />
        </div>
      </div>

      {period === "today" ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <CalendarDays className="h-5 w-5 text-accent" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={todayLessons.length} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">Уроков сегодня</div>
            {timesLine && <div className="mt-1 truncate text-[11px] num text-muted-foreground">{timesLine}</div>}
          </Card>
          <Card className="p-4">
            <Wallet className="h-5 w-5 text-[color:var(--success)]" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={expectedToday} format={(n) => formatMoney(n, currency)} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">Ожидаемый доход</div>
          </Card>
          <Card className="p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={studentsUnpaid} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">С неоплаченным</div>
          </Card>
          <Card className="p-4">
            <BookOpen className="h-5 w-5 text-accent" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={hwWaiting} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">ДЗ на проверку</div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <CalendarDays className="h-5 w-5 text-accent" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={weekLessons} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">Уроков за неделю</div>
          </Card>
          <Card className="p-4">
            <Wallet className="h-5 w-5 text-[color:var(--success)]" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={expectedWeek} format={(n) => formatMoney(n, currency)} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">Ожидается доход</div>
          </Card>
          <Card className="p-4">
            <TrendingUp className="h-5 w-5 text-accent" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={rate} format={(n) => `${n}%`} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">Посещаемость</div>
          </Card>
          <Card className="p-4">
            <BookOpen className="h-5 w-5 text-accent" strokeWidth={2.2} />
            <div className="mt-3 num text-2xl text-foreground"><CountUp value={hwWaiting} /></div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">ДЗ на проверку</div>
          </Card>
        </div>
      )}
    </>
  );
}


function ContinueCard({ onOpen }: { onOpen: (sid: string) => void }) {
  const { students, schedule } = useDashData();
  const studentsById = useMemo(() => {
    const m = new Map<string, (typeof students)[number]>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);
  const next = useMemo(() => {
    const now = new Date();
    const dow = todayDowMon0();
    const hm = now.toTimeString().slice(0, 5);
    const todayUpcoming = schedule
      .filter((s) => s.day_of_week === dow && s.start_time.slice(0, 5) >= hm)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (todayUpcoming[0]) return { slot: todayUpcoming[0], when: "Сегодня" };
    for (let i = 1; i <= 7; i++) {
      const d = (dow + i) % 7;
      const list = schedule.filter((s) => s.day_of_week === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (list[0]) {
        const dateName = new Date(Date.now() + i * 86400000).toLocaleDateString("ru-RU", { weekday: "long" });
        return { slot: list[0], when: i === 1 ? "Завтра" : dateName };
      }
    }
    return null;
  }, [schedule]);

  if (!next) return null;
  const st = studentsById.get(next.slot.student_id);
  if (!st) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(st.id)}
      className="mt-3 block w-full text-left"
    >
      <Card className="flex items-center gap-3 p-4 transition-colors active:bg-secondary">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
          <PlayCircle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Продолжить — {next.when}</div>
          <div className="name-italic truncate text-[15px] font-semibold text-foreground">{st.name}</div>
          <div className="text-[11px] text-muted-foreground num">
            {next.slot.start_time.slice(0, 5)} · {next.slot.duration_min} мин · {st.subject || "Урок"}
          </div>
        </div>
      </Card>
    </button>
  );
}


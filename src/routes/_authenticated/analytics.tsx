import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { Card, SectionTitle, Empty, Avatar } from "@/components/ui-bits";
import {
  useStudents,
  useFinance,
  useAttendance,
  useHomework,
  useRates,
  convertToRUB,
  initials,
} from "@/lib/db";
import { BarChart3, TrendingUp, Users, AlertTriangle, BookOpen } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/analytics")({ component: AnalyticsPage });

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function AnalyticsPage() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const { data: attendance = [] } = useAttendance();
  const { data: homework = [] } = useHomework();
  const { data: rates } = useRates();
  const [range, setRange] = useState<6 | 12>(6);

  // Доход по месяцам (последние N месяцев)
  const incomeByMonth = useMemo(() => {
    if (!rates) return [];
    const now = new Date();
    const buckets: { key: string; label: string; rub: number }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: MONTHS[d.getMonth()],
        rub: 0,
      });
    }
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const f of finance) {
      if (!f.is_paid) continue;
      const d = f.pay_date ? new Date(f.pay_date) : new Date(f.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = map.get(key);
      if (b) b.rub += convertToRUB(Number(f.amount), f.currency, rates);
    }
    return buckets.map((b) => ({ ...b, rub: Math.round(b.rub) }));
  }, [finance, rates, range]);

  const totalIncome = incomeByMonth.reduce((s, x) => s + x.rub, 0);
  const avgIncome = incomeByMonth.length ? Math.round(totalIncome / incomeByMonth.length) : 0;

  // Посещаемость по дням недели
  const attendanceByDow = useMemo(() => {
    const arr = DOW.map((d) => ({ day: d, present: 0, absent: 0, excused: 0 }));
    for (const r of attendance) {
      const idx = (new Date(r.date).getDay() + 6) % 7;
      const bucket = arr[idx];
      if (r.status === "present") bucket.present += 1;
      else if (r.status === "absent") bucket.absent += 1;
      else if (r.status === "excused") bucket.excused += 1;
    }
    return arr;
  }, [attendance]);

  // Pie распределения статусов
  const attendancePie = useMemo(() => {
    const acc = { present: 0, absent: 0, excused: 0 };
    for (const r of attendance)
      acc[r.status as keyof typeof acc] = (acc[r.status as keyof typeof acc] ?? 0) + 1;
    return [
      { name: "Присутствовал", value: acc.present, color: "var(--success)" },
      { name: "Отсутствовал", value: acc.absent, color: "var(--destructive)" },
      { name: "Уваж. причина", value: acc.excused, color: "var(--accent)" },
    ].filter((x) => x.value > 0);
  }, [attendance]);
  const totalAtt = attendancePie.reduce((s, x) => s + x.value, 0);
  const attRate = totalAtt
    ? Math.round(
        ((attendancePie.find((x) => x.name === "Присутствовал")?.value ?? 0) / totalAtt) * 100,
      )
    : 0;

  // Топ учеников по доходу
  const topStudents = useMemo(() => {
    if (!rates) return [];
    const map = new Map<string, number>();
    for (const f of finance) {
      if (!f.is_paid) continue;
      map.set(
        f.student_id,
        (map.get(f.student_id) ?? 0) + convertToRUB(Number(f.amount), f.currency, rates),
      );
    }
    return students
      .map((s) => ({ s, rub: Math.round(map.get(s.id) ?? 0) }))
      .filter((x) => x.rub > 0)
      .sort((a, b) => b.rub - a.rub)
      .slice(0, 5);
  }, [students, finance, rates]);

  // Должники
  const debtors = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of finance)
      if (!f.is_paid) map.set(f.student_id, (map.get(f.student_id) ?? 0) + 1);
    return students
      .map((s) => ({ s, n: map.get(s.id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
  }, [students, finance]);

  // Аналитика ДЗ
  const hwStats = useMemo(() => {
    const acc = { assigned: 0, done: 0, partial: 0, not_done: 0 };
    for (const h of homework)
      acc[h.status as keyof typeof acc] = (acc[h.status as keyof typeof acc] ?? 0) + 1;
    const evaluated = acc.done + acc.partial + acc.not_done;
    const rate = evaluated ? Math.round(((acc.done + acc.partial * 0.5) / evaluated) * 100) : 0;
    return { ...acc, rate, evaluated };
  }, [homework]);

  const hwByStudent = useMemo(() => {
    const map = new Map<
      string,
      { done: number; partial: number; not_done: number; assigned: number }
    >();
    for (const h of homework) {
      const m = map.get(h.student_id) ?? { done: 0, partial: 0, not_done: 0, assigned: 0 };
      m[h.status as keyof typeof m] += 1;
      map.set(h.student_id, m);
    }
    return students
      .map((s) => {
        const m = map.get(s.id) ?? { done: 0, partial: 0, not_done: 0, assigned: 0 };
        const evaluated = m.done + m.partial + m.not_done;
        const rate = evaluated ? Math.round(((m.done + m.partial * 0.5) / evaluated) * 100) : 0;
        const total = evaluated + m.assigned;
        return { s, rate, total, ...m };
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.rate - a.rate);
  }, [students, homework]);

  const hasAny =
    students.length > 0 && (finance.length > 0 || attendance.length > 0 || homework.length > 0);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Аналитика</h1>
      <p className="mt-1 text-sm text-muted-foreground">Доходы, посещаемость и тренды</p>

      {!hasAny && (
        <div className="mt-6">
          <Empty
            icon={<BarChart3 className="h-8 w-8" />}
            title="Данных пока недостаточно"
            hint="Добавьте учеников, платежи и записи посещаемости"
          />
        </div>
      )}

      {hasAny && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <TrendingUp className="h-5 w-5 text-accent" />
              <div className="num mt-3 text-2xl text-foreground">
                {totalIncome.toLocaleString("ru-RU")} ₽
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                За {range} мес
              </div>
            </Card>
            <Card className="p-4">
              <BarChart3 className="h-5 w-5 text-[color:var(--success)]" />
              <div className="num mt-3 text-2xl text-foreground">
                {avgIncome.toLocaleString("ru-RU")} ₽
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                Средний месяц
              </div>
            </Card>
            <Card className="p-4">
              <Users className="h-5 w-5 text-foreground" />
              <div className="num mt-3 text-2xl text-foreground">{attRate}%</div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                Посещаемость
              </div>
            </Card>
            <Card className="p-4">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="num mt-3 text-2xl text-foreground">{debtors.length}</div>
              <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">Должников</div>
            </Card>
          </div>

          <SectionTitle action={<RangePill value={range} onChange={setRange} options={[6, 12]} />}>
            Доход по месяцам
          </SectionTitle>
          <Card className="p-3">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={incomeByMonth} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip content={<ChartTooltip suffix=" ₽" />} />
                  <Area
                    type="monotone"
                    dataKey="rub"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    fill="url(#incFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SectionTitle>Посещаемость по дням</SectionTitle>
          <Card className="p-3">
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceByDow} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="present"
                    stackId="a"
                    fill="var(--success)"
                    shape={<StackBar dataKey="present" order={["absent", "excused", "present"]} />}
                  />
                  <Bar
                    dataKey="excused"
                    stackId="a"
                    fill="var(--accent)"
                    shape={<StackBar dataKey="excused" order={["absent", "excused", "present"]} />}
                  />
                  <Bar
                    dataKey="absent"
                    stackId="a"
                    fill="var(--destructive)"
                    shape={<StackBar dataKey="absent" order={["absent", "excused", "present"]} />}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <LegendDot color="var(--success)" label="Был" />
              <LegendDot color="var(--accent)" label="Уваж." />
              <LegendDot color="var(--destructive)" label="Пропуск" />
            </div>
          </Card>

          {attendancePie.length > 0 && (
            <>
              <SectionTitle>Распределение статусов</SectionTitle>
              <Card className="p-3">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={attendancePie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {attendancePie.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
                  {attendancePie.map((d) => (
                    <div key={d.name} className="rounded-xl bg-secondary py-2">
                      <div className="num text-base" style={{ color: d.color }}>
                        {d.value}
                      </div>
                      <div className="text-muted-foreground">{d.name}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {homework.length > 0 && (
            <>
              <SectionTitle>Домашние задания</SectionTitle>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Успеваемость по ДЗ
                    </div>
                    <div className="num text-2xl text-foreground">{hwStats.rate}%</div>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    Оценено
                    <br />
                    {hwStats.evaluated} из {homework.length}
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-[color:var(--success)]"
                    style={{ width: `${hwStats.rate}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div className="rounded-xl bg-secondary py-2">
                    <div className="num text-base text-foreground">{hwStats.assigned}</div>
                    <div className="text-muted-foreground">Активно</div>
                  </div>
                  <div className="rounded-xl bg-[color:var(--success)]/15 py-2">
                    <div className="num text-base text-[color:var(--success)]">{hwStats.done}</div>
                    <div className="text-muted-foreground">Сдали</div>
                  </div>
                  <div className="rounded-xl bg-accent/15 py-2">
                    <div className="num text-base text-accent">{hwStats.partial}</div>
                    <div className="text-muted-foreground">Част.</div>
                  </div>
                  <div className="rounded-xl bg-destructive/15 py-2">
                    <div className="num text-base text-destructive">{hwStats.not_done}</div>
                    <div className="text-muted-foreground">Не сдали</div>
                  </div>
                </div>
              </Card>

              {hwByStudent.length > 0 && (
                <div className="mt-3 space-y-2">
                  {hwByStudent.map(({ s, rate, done, partial, not_done, assigned }) => (
                    <Card key={s.id} className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar initials={initials(s.name)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="name-italic truncate text-[14px] font-semibold">
                              {s.name}
                            </div>
                            <div className="num text-sm text-foreground">{rate}%</div>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${rate}%`,
                                background:
                                  rate >= 80
                                    ? "var(--success)"
                                    : rate >= 50
                                      ? "var(--accent)"
                                      : "var(--destructive)",
                              }}
                            />
                          </div>
                          <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground">
                            <span className="text-[color:var(--success)]">✓ {done}</span>
                            <span className="text-accent">~ {partial}</span>
                            <span className="text-destructive">✗ {not_done}</span>
                            {assigned > 0 && <span>⏳ {assigned}</span>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {topStudents.length > 0 && (
            <>
              <SectionTitle>Топ учеников по доходу</SectionTitle>
              <div className="space-y-2">
                {topStudents.map(({ s, rub }, i) => {
                  const max = topStudents[0].rub || 1;
                  const pct = Math.round((rub / max) * 100);
                  return (
                    <Card key={s.id} className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="num w-5 text-center text-sm text-muted-foreground">
                          {i + 1}
                        </div>
                        <Avatar initials={initials(s.name)} />
                        <div className="min-w-0 flex-1">
                          <div className="name-italic truncate text-[14px] font-semibold">
                            {s.name}
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-accent transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="num text-sm text-foreground">
                          {rub.toLocaleString("ru-RU")} ₽
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {debtors.length > 0 && (
            <>
              <SectionTitle>Должники</SectionTitle>
              <div className="space-y-2 pb-4">
                {debtors.map(({ s, n }) => (
                  <Card key={s.id} className="flex items-center gap-3 p-3">
                    <Avatar initials={initials(s.name)} />
                    <div className="min-w-0 flex-1">
                      <div className="name-italic truncate text-[14px] font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">Неоплаченных платежей</div>
                    </div>
                    <div className="num rounded-full bg-destructive/15 px-3 py-1 text-sm text-destructive">
                      {n}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

type StackBarProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, unknown>;
  dataKey?: string;
  order?: string[];
};

function StackBar(props: StackBarProps) {
  const { x, y, width, height, fill, payload, dataKey, order } = props;
  if (x == null || y == null || !width || !height) return null;
  const topKey = order?.find((key) => Number(payload?.[key]) > 0);
  const isTop = dataKey === topKey;
  const r = Math.min(6, width / 2, height);
  if (!isTop || r <= 0) {
    return <rect x={x} y={y} width={width} height={height} fill={fill} />;
  }
  const path = `M ${x},${y + r} Q ${x},${y} ${x + r},${y} L ${x + width - r},${y} Q ${x + width},${y} ${x + width},${y + r} L ${x + width},${y + height} L ${x},${y + height} Z`;
  return <path d={path} fill={fill} />;
}

type TooltipEntry = {
  color?: string;
  name?: ReactNode;
  value?: string | number;
  payload?: { color?: string };
};

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: ReactNode;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
      {label != null && <div className="mb-1 font-semibold text-foreground">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color || p.payload?.color }}
          />
          <span>{p.name}:</span>
          <span className="num text-foreground">
            {Number(p.value).toLocaleString("ru-RU")}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

function RangePill<T extends number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [ind, setInd] = useState({ x: 0, w: 0, ready: false });

  const measure = () => {
    const idx = options.indexOf(value);
    const el = itemRefs.current[idx];
    const wrap = containerRef.current;
    if (!el || !wrap) return;
    const er = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    setInd({ x: er.left - wr.left, w: er.width, ready: true });
  };

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="glass-strong relative inline-flex items-center gap-1 rounded-full p-1"
    >
      <span
        aria-hidden
        className="liquid-pill pointer-events-none absolute top-1 bottom-1 rounded-full"
        style={{
          width: ind.w,
          transform: `translateX(${ind.x - 4}px)`,
          opacity: ind.ready ? 1 : 0,
          transition:
            "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease",
        }}
      />
      {options.map((n, i) => (
        <button
          key={n}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          onClick={() => onChange(n)}
          className={`no-anim relative z-10 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-300 ${
            value === n ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {n} мес
        </button>
      ))}
    </div>
  );
}

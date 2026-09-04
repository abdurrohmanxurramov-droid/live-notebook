import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle, Select, Badge } from "@/components/ui-bits";
import { GlassChips } from "@/components/GlassChips";
import { useStudents } from "@/lib/db";
import { useInsightQuery, fmtTotals, isoToday, ruDate, type Totals } from "@/lib/ui-insights";
import { getErrorMessage } from "@/lib/utils";
import { Loader2, AlertTriangle, Wallet, History } from "lucide-react";

type OverdueStudent = {
  student_id: string;
  student_name?: string;
  totals?: Totals;
  aging?: { d0_7?: Totals; d8_30?: Totals; d31_plus?: Totals };
};
type OverdueResult = { students: OverdueStudent[]; outstanding_totals?: Totals };

type CashflowBucket = {
  bucket: string;
  paid_totals?: Totals;
  unpaid_totals?: Totals;
};
type CashflowResult = {
  buckets: CashflowBucket[];
  paid_totals?: Totals;
  unpaid_totals?: Totals;
};

type PaymentRecord = {
  id: string;
  amount: number;
  currency: string;
  is_paid: boolean;
  pay_date?: string | null;
  created_at?: string;
  note?: string | null;
};
type HistoryResult = {
  records: PaymentRecord[];
  paid_totals?: Totals;
  unpaid_totals?: Totals;
  paid_count?: number;
  last_payment_date?: string | null;
};

type Grain = "day" | "week" | "month";

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(getErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

function State({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading)
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загружаем…
      </div>
    );
  if (error) return <div className="text-[12px] text-destructive">{error}</div>;
  return null;
}

export function FinanceInsights() {
  const runQuery = useInsightQuery();
  const { data: students = [] } = useStudents();

  const [grain, setGrain] = useState<Grain>("month");
  const [studentId, setStudentId] = useState("");

  const overdue = useAsync<OverdueResult>(
    () => runQuery<OverdueResult>("finance.overdue", { limit: 20 }),
    [],
  );

  const from = useMemo(() => isoToday(grain === "day" ? -13 : grain === "week" ? -56 : -180), [grain]);
  const cashflow = useAsync<CashflowResult>(
    () => runQuery<CashflowResult>("finance.cashflow", { from, to: isoToday(), granularity: grain }),
    [grain, from],
  );

  const history = useAsync<HistoryResult | null>(
    () =>
      studentId
        ? runQuery<HistoryResult>("finance.student_payment_history", {
            student_id: studentId,
            limit: 20,
          })
        : Promise.resolve(null),
    [studentId],
  );

  return (
    <>
      <SectionTitle>Задолженности по срокам</SectionTitle>
      <Card className="p-3">
        <State loading={overdue.loading} error={overdue.error} />
        {!overdue.loading && !overdue.error && overdue.data && (
          <>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Всего не оплачено
              </span>
              <span className="text-sm font-semibold text-foreground">
                {fmtTotals(overdue.data.outstanding_totals, "нет")}
              </span>
            </div>
            {overdue.data.students.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">Долгов нет.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {overdue.data.students.map((s) => (
                  <div key={s.student_id} className="rounded-xl bg-secondary/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="name-italic truncate text-[13px] font-semibold text-foreground">
                        {s.student_name ?? "—"}
                      </span>
                      <span className="text-[12px] font-medium text-destructive">
                        {fmtTotals(s.totals, "—")}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[10px]">
                      <Bucket label="0–7 дн" value={fmtTotals(s.aging?.d0_7, "—")} tone="neutral" />
                      <Bucket label="8–30 дн" value={fmtTotals(s.aging?.d8_30, "—")} tone="gold" />
                      <Bucket
                        label="31+ дн"
                        value={fmtTotals(s.aging?.d31_plus, "—")}
                        tone="danger"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <SectionTitle>Денежный поток</SectionTitle>
      <Card className="p-3">
        <GlassChips<Grain>
          active={grain}
          onChange={setGrain}
          leading={<Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />}
          items={[
            { key: "day", label: "По дням" },
            { key: "week", label: "По неделям" },
            { key: "month", label: "По месяцам" },
          ]}
        />
        <div className="mt-3">
          <State loading={cashflow.loading} error={cashflow.error} />
        </div>
        {!cashflow.loading && !cashflow.error && cashflow.data && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-secondary p-2.5">
                <div className="text-[10px] font-medium text-muted-foreground">Оплачено</div>
                <div className="mt-0.5 text-[13px] font-semibold text-[color:var(--success)]">
                  {fmtTotals(cashflow.data.paid_totals, "—")}
                </div>
              </div>
              <div className="rounded-xl bg-secondary p-2.5">
                <div className="text-[10px] font-medium text-muted-foreground">Не оплачено</div>
                <div className="mt-0.5 text-[13px] font-semibold text-destructive">
                  {fmtTotals(cashflow.data.unpaid_totals, "—")}
                </div>
              </div>
            </div>
            {cashflow.data.buckets.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">Нет данных за период.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {cashflow.data.buckets.map((b) => (
                  <div
                    key={b.bucket}
                    className="flex items-center justify-between gap-2 text-[12px]"
                  >
                    <span className="text-muted-foreground">{b.bucket}</span>
                    <span className="text-right">
                      <span className="font-medium text-[color:var(--success)]">
                        {fmtTotals(b.paid_totals, "—")}
                      </span>
                      <span className="ml-2 text-destructive">
                        {fmtTotals(b.unpaid_totals, "")}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <SectionTitle>История платежей ученика</SectionTitle>
      <Card className="p-3">
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Выберите ученика…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <div className="mt-3">
          <State loading={history.loading} error={history.error} />
        </div>

        {!studentId && !history.loading && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Выберите ученика, чтобы увидеть платежи.
          </p>
        )}

        {studentId && !history.loading && !history.error && history.data && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge tone="success">Оплачено: {fmtTotals(history.data.paid_totals, "—")}</Badge>
              <Badge tone="danger">Долг: {fmtTotals(history.data.unpaid_totals, "нет")}</Badge>
              <span className="flex items-center gap-1 text-muted-foreground">
                <History className="h-3.5 w-3.5" />
                {history.data.last_payment_date
                  ? `последняя: ${ruDate(history.data.last_payment_date)}`
                  : "оплат нет"}
              </span>
            </div>
            {history.data.records.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">Записей нет.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {history.data.records.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-muted-foreground">
                      {r.pay_date
                        ? ruDate(r.pay_date)
                        : r.created_at
                          ? ruDate(String(r.created_at).slice(0, 10))
                          : "—"}
                    </span>
                    <span
                      className={
                        r.is_paid
                          ? "font-medium text-[color:var(--success)]"
                          : "font-medium text-destructive"
                      }
                    >
                      {fmtTotals({ [r.currency]: Number(r.amount) }, "—")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function Bucket({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "gold" | "danger";
}) {
  const cls: Record<string, string> = {
    neutral: "text-foreground",
    gold: "text-accent",
    danger: "text-destructive",
  };
  return (
    <div className="rounded-lg bg-card px-1.5 py-1 text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold ${cls[tone]}`}>{value}</div>
    </div>
  );
}

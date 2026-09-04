import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui-bits";
import { useInsightQuery, fmtTotals, ruDate, type Totals } from "@/lib/ui-insights";
import { getErrorMessage } from "@/lib/utils";

type Insights = {
  period: { days: number };
  activity: {
    last_completed_lesson: { scheduled_date?: string } | null;
    next_lesson: { scheduled_date?: string; scheduled_time?: string } | null;
    lessons_by_status: Record<string, number>;
  };
  attendance: { total: number; present_rate: number | null };
  finance: { unpaid_totals: Totals; last_payment_date: string | null };
  homework: { open: unknown[]; overdue_count: number };
  flags: string[];
};

export function StudentInsightsPanel({ studentId }: { studentId: string }) {
  const runQuery = useInsightQuery();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [studentId]);

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    runQuery<Insights>("students.insights", { student_id: studentId, days: 30 })
      .then(setData)
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading, runQuery, studentId]);

  return (
    <div className="mt-3 rounded-xl bg-secondary p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Сводка за 30 дней
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 text-[12px]">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загружаем…
            </div>
          )}
          {error && <div className="text-destructive">{error}</div>}
          {!loading && !error && data && (
            <div className="space-y-1.5">
              <Row
                label="Ближайший урок"
                value={
                  data.activity.next_lesson?.scheduled_date
                    ? `${ruDate(data.activity.next_lesson.scheduled_date)} ${String(
                        data.activity.next_lesson.scheduled_time ?? "",
                      ).slice(0, 5)}`
                    : "нет"
                }
              />
              <Row
                label="Последний проведённый"
                value={
                  data.activity.last_completed_lesson?.scheduled_date
                    ? ruDate(data.activity.last_completed_lesson.scheduled_date)
                    : "нет"
                }
              />
              <Row
                label="Посещаемость"
                value={
                  data.attendance.present_rate === null
                    ? "—"
                    : `${data.attendance.present_rate}% (${data.attendance.total})`
                }
              />
              <Row label="Задолженность" value={fmtTotals(data.finance.unpaid_totals, "нет")} />
              <Row
                label="Последняя оплата"
                value={
                  data.finance.last_payment_date ? ruDate(data.finance.last_payment_date) : "—"
                }
              />
              <Row
                label="Открытые ДЗ"
                value={`${data.homework.open.length}${
                  data.homework.overdue_count ? ` (просрочено ${data.homework.overdue_count})` : ""
                }`}
              />
              {data.flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {data.flags.map((f) => (
                    <Badge key={f} tone="danger">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          {!loading && !error && !data && (
            <div className="text-muted-foreground">Нет данных за период.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

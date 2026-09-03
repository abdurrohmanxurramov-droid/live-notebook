import { useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/Sheet";
import { Button, Input, Select, Badge } from "@/components/ui-bits";
import { useStudents, useMut } from "@/lib/db";
import { sb } from "@/lib/sb";
import { supabase } from "@/integrations/supabase/client";
import { useInsightQuery, isoToday, ruDate } from "@/lib/ui-insights";
import { getErrorMessage } from "@/lib/utils";
import { Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type Suggestion = {
  date: string;
  time: string;
  day_of_week: number;
  score: number;
  reasons: string[];
};

type SuggestResult = { suggestions: Suggestion[]; considered: number };

type Conflict = { id?: string; scheduled_date?: string; scheduled_time?: string } & Record<
  string,
  unknown
>;

type AvailabilityResult = {
  available: boolean;
  student_available: boolean | null;
  student_lessons_that_day: unknown[] | null;
  conflicts: Conflict[];
};

export function SuggestSlotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: students = [] } = useStudents();
  const runQuery = useInsightQuery();

  const [studentId, setStudentId] = useState("");
  const [duration, setDuration] = useState(60);
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday(13));
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("21:00");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);

  const reset = () => {
    setSuggestions(null);
    setPicked(null);
    setAvailability(null);
    setError(null);
  };

  const search = async () => {
    setLoading(true);
    reset();
    try {
      const res = await runQuery<SuggestResult>("schedule.suggest_slot", {
        duration_min: duration,
        from,
        to,
        work_start: workStart,
        work_end: workEnd,
        limit: 10,
        ...(studentId ? { student_id: studentId } : {}),
      });
      setSuggestions(res.suggestions ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const pick = async (s: Suggestion) => {
    setPicked(s);
    setAvailability(null);
    setChecking(true);
    try {
      const res = await runQuery<AvailabilityResult>("schedule.check_availability", {
        date: s.date,
        time: s.time,
        duration_min: duration,
        ...(studentId ? { student_id: studentId } : {}),
      });
      setAvailability(res);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const create = useMut(async () => {
    if (!studentId) throw new Error("Выберите ученика");
    if (!picked) throw new Error("Выберите вариант");
    const { data: u } = await supabase.auth.getUser();
    const owner_id = u.user?.id;
    if (!owner_id) throw new Error("Не авторизован");
    const { error: err } = await (await sb()).from("lessons").insert({
      owner_id,
      student_id: studentId,
      scheduled_date: picked.date,
      scheduled_time: `${picked.time}:00`,
      duration_min: duration,
      status: "planned",
    });
    if (err) throw err;
  }, ["lessons"]);

  const blocked = availability ? !availability.available : true;

  return (
    <Sheet open={open} onClose={onClose} title="Подобрать окно">
      <div className="grid gap-3">
        <Select
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            reset();
          }}
        >
          <option value="">Выберите ученика…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[30, 45, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} мин
              </option>
            ))}
          </Select>
          <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
          <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
        </div>

        <Button variant="gold" className="liquid-action" disabled={loading} onClick={search}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Подобрать
        </Button>

        {error && (
          <div className="rounded-xl bg-destructive/10 p-3 text-[12px] text-destructive">
            {error}
          </div>
        )}

        {suggestions !== null && suggestions.length === 0 && !loading && (
          <div className="rounded-xl bg-secondary p-3 text-[12px] text-muted-foreground">
            Свободных окон в этом диапазоне нет. Расширьте даты или рабочие часы.
          </div>
        )}

        {suggestions && suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s) => {
              const active = picked?.date === s.date && picked?.time === s.time;
              return (
                <button
                  key={`${s.date}-${s.time}`}
                  onClick={() => pick(s)}
                  className={`w-full rounded-xl p-3 text-left transition-colors ${
                    active ? "bg-accent/15 ring-1 ring-accent" : "bg-secondary/60 hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">
                      {ruDate(s.date)} · {s.time}
                    </div>
                    <Badge tone={active ? "gold" : "neutral"}>{s.score}</Badge>
                  </div>
                  {s.reasons.length > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {s.reasons.join(" · ")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {picked && (
          <div className="rounded-xl bg-secondary p-3 text-[12px]">
            {checking ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Проверяем занятость…
              </span>
            ) : availability ? (
              availability.available &&
              (availability.student_available === null || availability.student_available) ? (
                <span className="flex items-center gap-2 text-[color:var(--success)]">
                  <CheckCircle2 className="h-4 w-4" /> Свободно: {ruDate(picked.date)} {picked.time}
                </span>
              ) : (
                <span className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Конфликт: занято {availability.conflicts.length} урок(ов) в это время
                    {availability.student_available === false && ", ученик занят"}.
                  </span>
                </span>
              )
            ) : null}
          </div>
        )}

        <Button
          variant="gold"
          className="liquid-action"
          disabled={!picked || !studentId || checking || blocked || create.isPending}
          onClick={async () => {
            try {
              await create.mutateAsync(undefined as never);
              toast.success("Урок запланирован");
              reset();
              onClose();
            } catch (e: unknown) {
              toast.error(getErrorMessage(e));
            }
          }}
        >
          Поставить урок
        </Button>
      </div>
    </Sheet>
  );
}

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet } from "@/components/Sheet";
import { Button, Input, Badge } from "@/components/ui-bits";
import { useStudents } from "@/lib/db";
import { useInsightMutate, isoToday } from "@/lib/ui-insights";
import { getErrorMessage } from "@/lib/utils";
import { Check, Loader2, Users } from "lucide-react";

const MAX = 100;

type ItemResult = { student_id: string; ok?: boolean; error?: string };
type BulkResult = { results: ItemResult[]; created?: number; failed?: number };

export function BulkAssignSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: students = [] } = useStudents();
  const runMutate = useInsightMutate();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  const [task, setTask] = useState("");
  const [assigned, setAssigned] = useState(isoToday());
  const [due, setDue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const nameById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s.name])),
    [students],
  );

  const toggle = (id: string) => {
    setResult(null);
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX
          ? (toast.error(`Максимум ${MAX} учеников`), prev)
          : [...prev, id],
    );
  };

  const submit = async () => {
    setPending(true);
    try {
      const res = await runMutate<BulkResult>("homework.bulk_assign", {
        student_ids: selected,
        task: task.trim(),
        assigned_date: assigned,
        ...(due ? { due_date: due } : {}),
      });
      setResult(res);
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["homework"] });
      const failed = res.results?.filter((r) => r.error).length ?? 0;
      if (failed === 0) toast.success("ДЗ выдано всем выбранным");
      else toast.error(`Есть ошибки: ${failed}`);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const canSubmit = selected.length > 0 && task.trim().length > 0 && !pending;

  return (
    <Sheet open={open} onClose={onClose} title="Массовая выдача ДЗ">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Выбрано {selected.length} / {MAX}
          </span>
          {selected.length > 0 && (
            <button className="text-accent" onClick={() => setSelected([])}>
              Сбросить
            </button>
          )}
        </div>

        <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl bg-secondary/50 p-1.5">
          {students.map((s) => {
            const active = selected.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  active ? "bg-accent/15 text-foreground" : "hover:bg-secondary"
                }`}
              >
                <span className="truncate">{s.name}</span>
                {active && <Check className="h-4 w-4 text-accent" />}
              </button>
            );
          })}
          {students.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">Учеников пока нет.</p>
          )}
        </div>

        <textarea
          value={task}
          onChange={(e) => {
            setTask(e.target.value);
            setResult(null);
          }}
          rows={3}
          placeholder="Например: §12, упр. 4–7"
          className="liquid-control w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input type="date" value={assigned} onChange={(e) => setAssigned(e.target.value)} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>

        {result && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-secondary p-2.5 text-[12px]">
            {result.results?.map((r) => (
              <div key={r.student_id} className="flex items-center justify-between gap-2">
                <span className="truncate text-muted-foreground">
                  {nameById[r.student_id] ?? r.student_id}
                </span>
                {r.error ? (
                  <Badge tone="danger">{r.error}</Badge>
                ) : (
                  <Badge tone="success">Готово</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {confirming ? (
          <div className="rounded-xl bg-accent/10 p-3 text-[12px]">
            <p className="text-foreground">
              Выдать это задание {selected.length} ученикам? Действие создаст записи ДЗ.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Отмена
              </Button>
              <Button variant="gold" className="flex-1" onClick={submit} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Подтвердить
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="gold"
            className="liquid-action w-full"
            disabled={!canSubmit}
            onClick={() => setConfirming(true)}
          >
            Выдать выбранным
          </Button>
        )}
      </div>
    </Sheet>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, Button, Empty, ListSkeleton, Badge } from "@/components/ui-bits";
import { listTrash, restoreItem, hardDelete, restoreStudent } from "@/lib/softdelete.functions";
import { Trash2, Undo2, GraduationCap } from "lucide-react";
import { useStudents } from "@/lib/db";

const TABLE_LABELS: Record<string, string> = {
  students: "Ученики",
  lessons: "Уроки",
  attendance: "Посещения",
  finance: "Платежи",
  homework: "Домашние задания",
  schedule_slots: "Слоты расписания",
};

export function TrashSection() {
  const listFn = useServerFn(listTrash);
  const restoreFn = useServerFn(restoreItem);
  const restoreStudentFn = useServerFn(restoreStudent);
  const hardFn = useServerFn(hardDelete);
  const qc = useQueryClient();
  const { data: students = [] } = useStudents();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: () => listFn({}),
  });

  function studentName(id?: string) {
    return students.find((s) => s.id === id)?.name ?? "—";
  }

  async function doRestore(table: string, id: string) {
    setBusy(true);
    try {
      if (table === "students") await restoreStudentFn({ data: { id } });
      else await restoreFn({ data: { table: table as never, id } });
      toast.success("Восстановлено");
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function doHardDelete(table: string, id: string) {
    if (!confirm("Удалить безвозвратно?")) return;
    setBusy(true);
    try {
      await hardFn({ data: { table: table as never, id } });
      toast.success("Удалено навсегда");
      await qc.invalidateQueries({ queryKey: ["trash"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <ListSkeleton rows={2} />;

  const total = data ? Object.values(data).reduce((n, arr) => n + arr.length, 0) : 0;
  if (total === 0) {
    return (
      <Empty
        icon={<Trash2 className="h-8 w-8" />}
        title="Корзина пуста"
        hint="Удалённые записи будут здесь — их можно восстановить"
      />
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(data ?? {}).map(([table, rows]) =>
        rows.length === 0 ? null : (
          <Card key={table} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{TABLE_LABELS[table] ?? table}</span>
              <Badge>{rows.length}</Badge>
            </div>
            <div className="space-y-2">
              {rows.slice(0, 20).map((r) => {
                const id = String(r.id);
                let label = "";
                if (table === "students") label = String(r.name ?? "—");
                else if (table === "lessons")
                  label = `${studentName(r.student_id as string)} · ${r.scheduled_date} ${String(r.scheduled_time ?? "").slice(0, 5)}`;
                else if (table === "attendance")
                  label = `${studentName(r.student_id as string)} · ${r.date} · ${r.status}`;
                else if (table === "finance")
                  label = `${studentName(r.student_id as string)} · ${r.amount} ${r.currency}`;
                else if (table === "homework")
                  label = `${studentName(r.student_id as string)} · ${String(r.task ?? "").slice(0, 60)}`;
                else if (table === "schedule_slots")
                  label = `${studentName(r.student_id as string)} · день ${r.day_of_week} · ${String(r.start_time ?? "").slice(0, 5)}`;

                return (
                  <div key={id} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/40 p-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{label}</span>
                    <button
                      onClick={() => doRestore(table, id)}
                      disabled={busy}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent disabled:opacity-50"
                      aria-label="Восстановить"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => doHardDelete(table, id)}
                      disabled={busy}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="Удалить навсегда"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {rows.length > 20 && (
                <div className="text-xs text-muted-foreground">…и ещё {rows.length - 20}</div>
              )}
            </div>
          </Card>
        ),
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import { useStudents, useAttendance, useMut, initials } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { CalendarCheck, Check, X, FileText, Trash2 } from "lucide-react";

export const Route = createFileRoute("/attendance")({ component: AttendancePage });

const STATUS = {
  present: { label: "Присутствовал", emoji: "✅", tone: "success" as const },
  absent: { label: "Отсутствовал", emoji: "❌", tone: "danger" as const },
  excused: { label: "Уваж. причина", emoji: "📎", tone: "gold" as const },
};

function AttendancePage() {
  const { data: students = [] } = useStudents();
  const { data: records = [] } = useAttendance();
  const today = new Date().toISOString().slice(0, 10);

  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<keyof typeof STATUS>("present");
  const [note, setNote] = useState("");

  const add = useMut(async () => {
    if (!studentId) throw new Error("Выберите ученика");
    const { error } = await supabase.from("attendance").insert({
      student_id: studentId,
      date,
      status,
      note: note.trim() || null,
    });
    if (error) throw error;
  }, ["attendance"]);

  const del = useMut(async (id: string) => {
    const { error } = await supabase.from("attendance").delete().eq("id", id);
    if (error) throw error;
  }, ["attendance"]);

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const perStudentStats = useMemo(() => {
    const map: Record<string, { present: number; absent: number; excused: number; total: number }> = {};
    for (const r of records) {
      const m = (map[r.student_id] ??= { present: 0, absent: 0, excused: 0, total: 0 });
      m[r.status as keyof typeof STATUS] += 1;
      m.total += 1;
    }
    return map;
  }, [records]);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Посещаемость</h1>
      <p className="mt-1 text-sm text-muted-foreground">Журнал уроков и причин</p>

      <Card className="mt-4 p-4">
        <div className="space-y-3">
          <Field label="Ученик">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">— выберите —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Статус">
              <Select value={status} onChange={(e) => setStatus(e.target.value as keyof typeof STATUS)}>
                {Object.entries(STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Заметка (необязательно)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
          </Field>
          <Button
            variant="gold"
            className="w-full"
            disabled={!studentId || add.isPending}
            onClick={async () => {
              try {
                await add.mutateAsync(undefined as never);
                toast.success("Записано");
                setNote("");
              } catch (e: any) {
                toast.error(e?.message ?? "Ошибка");
              }
            }}
          >
            <Check className="h-4 w-4" /> Записать
          </Button>
        </div>
      </Card>

      <SectionTitle>Статистика</SectionTitle>
      {students.length === 0 ? (
        <Empty icon={<CalendarCheck className="h-8 w-8" />} title="Нет учеников" hint="Сначала добавьте ученика" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {students.map((s) => {
            const st = perStudentStats[s.id] ?? { present: 0, absent: 0, excused: 0, total: 0 };
            const pct = st.total ? Math.round((st.present / st.total) * 100) : 0;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar initials={initials(s.name)} />
                  <div className="min-w-0 flex-1">
                    <div className="name-italic truncate text-[15px] font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">Посещаемость · {pct}%</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat n={st.present} label="✅" tone="success" />
                  <Stat n={st.absent} label="❌" tone="danger" />
                  <Stat n={st.excused} label="📎" tone="gold" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Журнал</SectionTitle>
      {records.length === 0 ? (
        <Empty icon={<FileText className="h-8 w-8" />} title="Записей пока нет" />
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const s = studentMap[r.student_id];
            const cfg = STATUS[r.status as keyof typeof STATUS];
            return (
              <Card key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-lg">
                  {cfg?.emoji ?? "·"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="name-italic truncate text-[14px] font-semibold">{s?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.date).toLocaleDateString("ru-RU")} · {cfg?.label}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <button
                  onClick={async () => { await del.mutateAsync(r.id); toast.success("Удалено"); }}
                  className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "success" | "danger" | "gold" }) {
  const toneCls: Record<string, string> = {
    success: "text-[color:var(--success)]",
    danger: "text-destructive",
    gold: "text-accent",
  };
  return (
    <div className="rounded-xl bg-secondary py-2">
      <div className={`num text-lg ${toneCls[tone]}`}>{n}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  );
}

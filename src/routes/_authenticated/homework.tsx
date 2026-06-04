import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import { GlassChips } from "@/components/GlassChips";
import { Sheet } from "@/components/Sheet";
import { useStudents, useHomework, useMut, initials, type HomeworkStatus, type Homework } from "@/lib/db";
import { sb } from "@/lib/sb";
import { BookOpen, Plus, Trash2, Check, X, MinusCircle, Clock, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/homework")({ component: HomeworkPage });

const STATUS: Record<HomeworkStatus, { label: string; tone: "neutral" | "success" | "danger" | "gold"; icon: any }> = {
  assigned: { label: "Задано", tone: "neutral", icon: Clock },
  done: { label: "Сдал", tone: "success", icon: Check },
  partial: { label: "Частично", tone: "gold", icon: MinusCircle },
  not_done: { label: "Не сдал", tone: "danger", icon: X },
};

function HomeworkPage() {
  const { data: students = [] } = useStudents();
  const { data: items = [] } = useHomework();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | HomeworkStatus>("all");
  const [studentFilter, setStudentFilter] = useState<string>("");

  useEffect(() => {
    const wantsNew =
      typeof location.search === "object" && location.search !== null
        ? (location.search as Record<string, unknown>).new === 1 || (location.search as Record<string, unknown>).new === "1"
        : typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1";
    if (wantsNew) {
      setOpen(true);
      navigate({ to: "/homework", search: {} as any, replace: true });
    }
  }, [location.search, navigate]);

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const filtered = useMemo(() => {
    return items.filter((h) => {
      if (filter !== "all" && h.status !== filter) return false;
      if (studentFilter && h.student_id !== studentFilter) return false;
      return true;
    });
  }, [items, filter, studentFilter]);

  const stats = useMemo(() => {
    const acc = { assigned: 0, done: 0, partial: 0, not_done: 0 };
    for (const h of items) acc[h.status] += 1;
    const completed = acc.done + acc.partial * 0.5;
    const evaluated = acc.done + acc.partial + acc.not_done;
    const rate = evaluated ? Math.round((completed / evaluated) * 100) : 0;
    return { ...acc, rate };
  }, [items]);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Домашние задания</h1>
      <p className="mt-1 text-sm text-muted-foreground">Что задано и как сдают</p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <MiniStat n={stats.assigned} label="Активно" tone="neutral" />
        <MiniStat n={stats.done} label="Сдали" tone="success" />
        <MiniStat n={stats.partial} label="Част." tone="gold" />
        <MiniStat n={stats.not_done} label="Не сдали" tone="danger" />
      </div>

      <Card className="mt-3 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Успеваемость</div>
            <div className="num mt-1 text-2xl text-foreground">{stats.rate}%</div>
          </div>
          <Button variant="gold" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Задать
          </Button>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-[color:var(--success)]" style={{ width: `${stats.rate}%` }} />
        </div>
      </Card>

      <div className="mt-4">
        <GlassChips<"all" | HomeworkStatus>
          active={filter}
          onChange={(k) => setFilter(k)}
          leading={<Filter className="h-4 w-4 shrink-0 text-muted-foreground" />}
          items={[
            { key: "all", label: "Все" },
            ...(Object.keys(STATUS) as HomeworkStatus[]).map((k) => ({ key: k, label: STATUS[k].label })),
          ]}
        />
      </div>


      {students.length > 1 && (
        <Select className="mt-2" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
          <option value="">Все ученики</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      )}

      <SectionTitle>{filtered.length} заданий</SectionTitle>

      {filtered.length === 0 ? (
        <Empty
          icon={<BookOpen className="h-8 w-8" />}
          title={items.length === 0 ? "Заданий пока нет" : "По фильтру ничего нет"}
          hint={items.length === 0 ? "Нажмите «Задать», чтобы начать" : undefined}
        />
      ) : (
        <div className="space-y-2 pb-4">
          {filtered.map((h) => (
            <HomeworkCard key={h.id} h={h} studentName={studentMap[h.student_id]?.name ?? "—"} />
          ))}
        </div>
      )}

      <AddHomeworkSheet open={open} onClose={() => setOpen(false)} students={students} />
    </div>
  );
}

function MiniStat({ n, label, tone }: { n: number; label: string; tone: "neutral" | "success" | "danger" | "gold" }) {
  const cls: Record<string, string> = {
    neutral: "text-foreground",
    success: "text-[color:var(--success)]",
    danger: "text-destructive",
    gold: "text-accent",
  };
  return (
    <Card className="p-3 text-center">
      <div className={`num text-xl ${cls[tone]}`}>{n}</div>
      <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">{label}</div>
    </Card>
  );
}


function HomeworkCard({ h, studentName }: { h: Homework; studentName: string }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(h.note ?? "");

  const setStatus = useMut(async (status: HomeworkStatus) => {
    const { error } = await (await sb()).from("homework").update({ status }).eq("id", h.id);
    if (error) throw error;
  }, ["homework"]);

  const saveNote = useMut(async () => {
    const { error } = await (await sb()).from("homework").update({ note: note.trim() || null }).eq("id", h.id);
    if (error) throw error;
  }, ["homework"]);

  const del = useMut(async () => {
    const { error } = await (await sb()).from("homework").update({ deleted_at: new Date().toISOString() }).eq("id", h.id);
    if (error) throw error;
  }, ["homework"]);

  const cfg = STATUS[h.status];
  const overdue = h.status === "assigned" && h.due_date && new Date(h.due_date) < new Date(new Date().toDateString());

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <Avatar initials={initials(studentName)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="name-italic truncate text-[14px] font-semibold">{studentName}</div>
            <Badge tone={cfg.tone}>{cfg.label}</Badge>
            {overdue && <Badge tone="danger">Просрочено</Badge>}
          </div>
          <p className="mt-1.5 text-sm text-foreground whitespace-pre-wrap">{h.task}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>Задано: {new Date(h.assigned_date).toLocaleDateString("ru-RU")}</span>
            {h.due_date && <span>До: {new Date(h.due_date).toLocaleDateString("ru-RU")}</span>}
          </div>
          {h.note && <p className="mt-1.5 rounded-lg bg-secondary px-2 py-1.5 text-[12px] text-muted-foreground">{h.note}</p>}
        </div>
        <button
          onClick={async () => { await del.mutateAsync(undefined as never); toast.success("Удалено"); }}
          className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Удалить"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {(Object.keys(STATUS) as HomeworkStatus[]).map((k) => {
          const c = STATUS[k];
          const Icon = c.icon;
          const active = h.status === k;
          const toneActive: Record<string, string> = {
            neutral: "bg-secondary text-foreground",
            success: "bg-[color:var(--success)] text-white",
            danger: "bg-destructive text-white",
            gold: "bg-accent text-accent-foreground",
          };
          return (
            <button
              key={k}
              onClick={() => setStatus.mutateAsync(k).then(() => toast.success(c.label))}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold transition-colors ${
                active ? toneActive[c.tone] : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setNoteOpen((v) => !v)}
        className="mt-2 text-[11px] font-medium text-accent"
      >
        {noteOpen ? "Скрыть" : h.note ? "Изменить заметку" : "+ Заметка"}
      </button>
      {noteOpen && (
        <div className="mt-2 flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Комментарий..." />
          <Button
            variant="outline"
            onClick={async () => {
              await saveNote.mutateAsync(undefined as never);
              toast.success("Сохранено");
              setNoteOpen(false);
            }}
          >
            ОК
          </Button>
        </div>
      )}
    </Card>
  );
}

function AddHomeworkSheet({
  open,
  onClose,
  students,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
}) {
  const [studentId, setStudentId] = useState("");
  const [task, setTask] = useState("");
  const [assigned, setAssigned] = useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState("");

  const add = useMut(async () => {
    if (!studentId) throw new Error("Выберите ученика");
    if (!task.trim()) throw new Error("Опишите задание");
    const { error } = await (await sb()).from("homework").insert({
      student_id: studentId,
      task: task.trim(),
      assigned_date: assigned,
      due_date: due || null,
      status: "assigned",
    });
    if (error) throw error;
  }, ["homework"]);

  return (
    <Sheet open={open} onClose={onClose} title="Добавить ДЗ">
      <div className="space-y-3">
        <div className="stagger-item" style={{ animationDelay: "40ms" }}>
        <Field label="Ученик">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">— выберите —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        </div>
        <div className="stagger-item" style={{ animationDelay: "95ms" }}>
        <Field label="Задание">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Например: §12, упр. 4–7"
            rows={3}
            className="liquid-control w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="stagger-item" style={{ animationDelay: "150ms" }}>
          <Field label="Задано">
            <Input type="date" value={assigned} onChange={(e) => setAssigned(e.target.value)} />
          </Field>
          </div>
          <div className="stagger-item" style={{ animationDelay: "205ms" }}>
          <Field label="Сдать до">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          </div>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="liquid-action flex-1" onClick={onClose}>Отмена</Button>
        <Button
          variant="gold"
          className="liquid-action flex-1"
          disabled={add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              toast.success("Задание создано");
              setTask(""); setDue("");
              onClose();
            } catch (e: any) {
              toast.error(e?.message ?? "Ошибка");
            }
          }}
        >
          Сохранить
        </Button>
      </div>
    </Sheet>
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

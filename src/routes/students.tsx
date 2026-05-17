import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import { Sheet } from "@/components/Sheet";
import { useStudents, useFinance, useMut, initials } from "@/lib/db";
import { sb } from "@/lib/sb";
import { GraduationCap, Plus, Search, Trash2, Phone, BookOpen } from "lucide-react";

export const Route = createFileRoute("/students")({ component: StudentsPage });

function StudentsPage() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = students.filter((s) =>
    (s.name + " " + (s.subject ?? "")).toLowerCase().includes(q.toLowerCase())
  );

  const del = useMut(async (id: string) => {
    const { error } = await (await sb()).from("students").delete().eq("id", id);
    if (error) throw error;
  }, ["students", "finance", "attendance"]);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Ученики</h1>
      <p className="mt-1 text-sm text-muted-foreground">Карточки ваших подопечных</p>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Поиск ученика..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="gold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Добавить
        </Button>
      </div>

      <SectionTitle>{filtered.length} {filtered.length === 1 ? "ученик" : "учеников"}</SectionTitle>

      {filtered.length === 0 ? (
        <Empty
          icon={<GraduationCap className="h-8 w-8" />}
          title={students.length === 0 ? "Список пуст" : "Никого не найдено"}
          hint={students.length === 0 ? "Нажмите «Добавить», чтобы начать" : "Попробуйте другое имя"}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((s) => {
            const fin = finance.filter((f) => f.student_id === s.id);
            const hasUnpaid = fin.some((f) => !f.is_paid);
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar initials={initials(s.name)} />
                  <div className="min-w-0 flex-1">
                    <div className="name-italic truncate text-[15px] font-semibold text-foreground">{s.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {s.subject || "Без предмета"}
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmId(s.id)}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-secondary px-3 py-2">
                    <div className="num text-lg text-foreground">{s.days_per_week}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">дн/нед</div>
                  </div>
                  <div className="rounded-xl bg-secondary px-3 py-2">
                    <div className="num text-lg text-foreground">{s.days_per_week * 4}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">уроков/мес</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {s.phone ? (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <BookOpen className="h-3 w-3" /> {s.subject || "—"}
                    </span>
                  )}
                  {fin.length === 0 ? (
                    <Badge>Без платежей</Badge>
                  ) : hasUnpaid ? (
                    <Badge tone="danger">Должник</Badge>
                  ) : (
                    <Badge tone="success">Оплачено</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddStudentSheet open={open} onClose={() => setOpen(false)} />

      <Sheet open={!!confirmId} onClose={() => setConfirmId(null)} title="Удалить ученика?">
        <p className="text-sm text-muted-foreground">
          Все связанные платежи и записи посещаемости также будут удалены.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConfirmId(null)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              if (!confirmId) return;
              try {
                await del.mutateAsync(confirmId);
                toast.success("Ученик удалён");
                setConfirmId(null);
              } catch (e: any) {
                toast.error(e?.message ?? "Ошибка");
              }
            }}
          >
            Удалить
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function AddStudentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState("2");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState("");

  const add = useMut(async () => {
    const d = Math.max(1, Math.min(7, Number(days) || 1));
    const { error } = await (await sb()).from("students").insert({
      name: name.trim(),
      days_per_week: d,
      subject: subject.trim() || null,
      phone: phone.trim() || null,
    });
    if (error) throw error;
  }, ["students"]);

  return (
    <Sheet open={open} onClose={onClose} title="Новый ученик">
      <div className="space-y-3">
        <Field label="Имя">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Анна Иванова" />
        </Field>
        <Field label="Дней в неделю (1–7)">
          <Input type="number" min={1} max={7} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="Предмет (необязательно)">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Математика" />
        </Field>
        <Field label="Телефон (необязательно)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." />
        </Field>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
        <Button
          variant="gold"
          className="flex-1"
          disabled={!name.trim() || add.isPending}
          onClick={async () => {
            try {
              await add.mutateAsync(undefined as never);
              toast.success("Ученик добавлен");
              setName(""); setDays("2"); setSubject(""); setPhone("");
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

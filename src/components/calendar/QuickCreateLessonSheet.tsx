import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/Sheet";
import { Button, Input, Select } from "@/components/ui-bits";
import { useStudents, useMut } from "@/lib/db";
import { sb } from "@/lib/sb";
import { supabase } from "@/integrations/supabase/client";

export function QuickCreateLessonSheet({
  open,
  onClose,
  initialDate,
  initialTime,
}: {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
  initialTime?: string;
}) {
  const { data: students = [] } = useStudents();
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(initialTime ?? "10:00");
  const [duration, setDuration] = useState(60);

  useEffect(() => {
    if (open) {
      if (initialDate) setDate(initialDate);
      if (initialTime) setTime(initialTime);
    }
  }, [open, initialDate, initialTime]);

  const create = useMut(async () => {
    if (!studentId) throw new Error("Выберите ученика");
    const { data: u } = await supabase.auth.getUser();
    const owner_id = u.user?.id;
    if (!owner_id) throw new Error("Не авторизован");
    const t = time.length === 5 ? `${time}:00` : time;
    const { error } = await (await sb()).from("lessons").insert({
      owner_id,
      student_id: studentId,
      scheduled_date: date,
      scheduled_time: t,
      duration_min: duration,
      status: "planned",
    });
    if (error) throw error;
  }, ["lessons"]);

  return (
    <Sheet open={open} onClose={onClose} title="Запланировать урок">
      <div className="grid gap-3">
        <div className="stagger-item" style={{ animationDelay: "40ms" }}>
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Выберите ученика…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="stagger-item" style={{ animationDelay: "95ms" }}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="stagger-item" style={{ animationDelay: "150ms" }}>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="stagger-item" style={{ animationDelay: "205ms" }}>
        <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
          <option value={30}>30 мин</option>
          <option value={45}>45 мин</option>
          <option value={60}>60 мин</option>
          <option value={90}>90 мин</option>
          <option value={120}>120 мин</option>
        </Select>
        </div>
        <Button
          variant="gold"
          className="liquid-action"
          disabled={create.isPending}
          onClick={() => {
            create.mutate(undefined, {
              onSuccess: () => {
                toast.success("Урок добавлен");
                onClose();
              },
              onError: (e: Error) => toast.error(e.message),
            });
          }}
        >
          Добавить
        </Button>
      </div>
    </Sheet>
  );
}

import { sb } from "@/lib/sb";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type StudentStatus = "active" | "paused" | "completed" | "archived";
export type Student = {
  id: string;
  name: string;
  days_per_week: number;
  subject: string | null;
  phone: string | null;
  created_at: string;
  status: StudentStatus;
};

export const STUDENT_STATUS_META: Record<
  StudentStatus,
  { label: string; tone: "success" | "gold" | "neutral" | "danger" }
> = {
  active: { label: "Активный", tone: "success" },
  paused: { label: "На паузе", tone: "gold" },
  completed: { label: "Завершён", tone: "neutral" },
  archived: { label: "Архив", tone: "danger" },
};

export type Finance = {
  id: string;
  student_id: string;
  amount: number;
  currency: "RUB" | "USD" | "EGP" | "USDT";
  is_paid: boolean;
  pay_date: string | null;
  created_at: string;
};

export type AttendanceStatus = "present" | "absent" | "excused" | "rescheduled_by_teacher";
export type Attendance = {
  id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  compensated: boolean;
  created_at: string;
};

export type ScheduleSlot = {
  id: string;
  student_id: string;
  day_of_week: number; // 0=Mon ... 6=Sun
  start_time: string; // "HH:MM:SS"
  duration_min: number;
  created_at: string;
};

export type HomeworkStatus = "assigned" | "done" | "not_done" | "partial";
export type Homework = {
  id: string;
  student_id: string;
  assigned_date: string;
  due_date: string | null;
  task: string;
  status: HomeworkStatus;
  note: string | null;
  created_at: string;
};

export type Rates = {
  id: string;
  usd_to_rub: number;
  usdt_to_egp: number;
  usd_to_egp: number;
  updated_at: string;
};

export function useStudents() {
  return useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("students")
        .select("id, name, days_per_week, subject, phone, created_at, status")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Student[];
    },
  });
}

export function useFinance() {
  return useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("finance")
        .select("id, student_id, amount, currency, is_paid, pay_date, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Finance[];
    },
  });
}

export function useAttendance() {
  return useQuery({
    queryKey: ["attendance"],
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("attendance")
        .select("id, student_id, date, status, note, compensated, created_at")
        .is("deleted_at", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });
}

export function useSchedule() {
  return useQuery({
    queryKey: ["schedule"],
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("schedule_slots")
        .select("id, student_id, day_of_week, start_time, duration_min, created_at")
        .is("deleted_at", null)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduleSlot[];
    },
  });
}

export function useHomework() {
  return useQuery({
    queryKey: ["homework"],
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("homework")
        .select("id, student_id, assigned_date, due_date, task, status, note, created_at")
        .is("deleted_at", null)
        .order("assigned_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Homework[];
    },
  });
}

export function useRates() {
  return useQuery({
    queryKey: ["rates"],
    queryFn: async () => {
      const { data, error } = await (await sb())
        .from("rates")
        .select("id, usd_to_rub, usdt_to_egp, usd_to_egp, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) {
        const { data: inserted, error: insErr } = await (await sb())
          .from("rates")
          .insert({ usd_to_rub: 90, usdt_to_egp: 50, usd_to_egp: 50 })
          .select("id, usd_to_rub, usdt_to_egp, usd_to_egp, updated_at")
          .single();
        if (insErr) throw insErr;
        return inserted as Rates;
      }
      return data[0] as Rates;
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useMut<T>(fn: (input: T) => Promise<unknown>, keys: string[]) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate(keys),
  });
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatMoney(amount: number, currency: string) {
  const sym = currency === "RUB" ? "₽" : currency === "USD" ? "$" : "£";
  return `${Math.round(amount).toLocaleString("ru-RU")} ${sym}`;
}

export function convertToRUB(amount: number, currency: string, rates: Rates) {
  if (currency === "RUB") return amount;
  if (currency === "USD") return amount * rates.usd_to_rub;
  if (currency === "EGP") return (amount / rates.usdt_to_egp) * rates.usd_to_rub;
  return amount;
}

export function convertToUSDT(amount: number, currency: string, rates: Rates) {
  if (currency === "USD") return amount;
  if (currency === "RUB") return amount / rates.usd_to_rub;
  if (currency === "EGP") return amount / rates.usdt_to_egp;
  return amount;
}

export function convertToEGP(amount: number, currency: string, rates: Rates) {
  if (currency === "EGP") return amount;
  if (currency === "USD") return amount * rates.usdt_to_egp;
  if (currency === "RUB") return (amount / rates.usd_to_rub) * rates.usdt_to_egp;
  return amount;
}

export function groupByStudentId<T extends { student_id: string }>(rows: readonly T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(row.student_id);
    if (bucket) bucket.push(row);
    else map.set(row.student_id, [row]);
  }
  return map;
}

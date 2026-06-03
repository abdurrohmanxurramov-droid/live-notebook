import { z } from "zod";

export const studentSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(100),
  subject: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  days_per_week: z.number().int().min(1).max(7),
});

export const paymentSchema = z.object({
  student_id: z.string().uuid(),
  amount: z.number().min(0).max(10_000_000),
  currency: z.enum(["RUB", "USD", "EGP"]),
  is_paid: z.boolean(),
  pay_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const homeworkSchema = z.object({
  student_id: z.string().uuid(),
  task: z.string().trim().min(1, "Опишите задание").max(2000),
  assigned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["assigned", "done", "not_done", "partial"]),
  note: z.string().max(2000).nullable().optional(),
});

export const userSettingsSchema = z.object({
  default_currency: z.enum(["RUB", "USD", "EGP"]),
  default_lesson_duration: z.number().int().min(15).max(240),
  default_lesson_price: z.number().min(0).max(10_000_000),
  week_starts_on: z.number().int().min(0).max(6),
  remind_before_min: z.number().int().min(5).max(1440),
  locale: z.enum(["ru", "en"]),
  remind_lessons: z.boolean(),
  remind_payments: z.boolean(),
  remind_homework: z.boolean(),
});

export type UserSettings = z.infer<typeof userSettingsSchema> & {
  user_id: string;
  created_at: string;
  updated_at: string;
};

export const SOFT_DELETE_TABLES = [
  "students",
  "lessons",
  "attendance",
  "finance",
  "homework",
  "schedule_slots",
] as const;
export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

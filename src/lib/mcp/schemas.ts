import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency";

export const uuid = z.string().uuid();
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Date, YYYY-MM-DD");
export const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/)
  .describe("Time, HH:MM");

export const LESSON_STATUSES = ["planned", "completed", "cancelled", "moved"] as const;
export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "excused",
  "rescheduled_by_teacher",
] as const;
export const HOMEWORK_STATUSES = ["assigned", "done", "not_done", "partial"] as const;
export const STUDENT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export const DELETABLE_TABLES = [
  "students",
  "lessons",
  "attendance",
  "finance",
  "homework",
  "schedule_slots",
] as const;

export const amountSchema = z.number().finite().min(0).max(10_000_000);
export const durationSchema = z.number().int().min(15).max(480);
export const noteSchema = z.string().max(1000);
export const taskSchema = z.string().trim().min(1).max(2000);
export const nameSchema = z.string().trim().min(1).max(100);
export const currencySchema = currencyCodeSchema;
export const dayOfWeekSchema = z.number().int().min(0).max(6);
export const limitSchema = z.number().int().min(1).max(200);

export const settingsPatchSchema = z
  .object({
    default_currency: currencySchema.optional(),
    default_lesson_duration: z.number().int().min(15).max(240).optional(),
    default_lesson_price: amountSchema.optional(),
    week_starts_on: z.number().int().min(0).max(6).optional(),
    remind_before_min: z.number().int().min(5).max(1440).optional(),
    locale: z.enum(["ru", "en"]).optional(),
    remind_lessons: z.boolean().optional(),
    remind_payments: z.boolean().optional(),
    remind_homework: z.boolean().optional(),
  })
  .strict();

/** Keys the assistant may write in user settings. Secrets and identity are excluded. */
export const ALLOWED_SETTINGS_KEYS = Object.keys(settingsPatchSchema.shape) as Array<
  keyof typeof settingsPatchSchema.shape
>;

/** Strips undefined values so partial updates never null out untouched columns. */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

/** Rejects ranges that are inverted or wider than one year. */
export function validRange(from: string, to: string): boolean {
  if (from > to) return false;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return Number.isFinite(days) && days <= 366;
}

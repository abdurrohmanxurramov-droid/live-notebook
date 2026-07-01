import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BACKUP_VERSION = 1;
const TABLES = [
  "students",
  "schedule_slots",
  "lessons",
  "attendance",
  "finance",
  "homework",
  "rates",
  "push_subscriptions",
  "chat_messages",
  "user_settings",
] as const;

const TABLE_SELECTS: Record<(typeof TABLES)[number], string> = {
  students: "id, owner_id, name, days_per_week, subject, phone, status, deleted_at, created_at",
  schedule_slots:
    "id, owner_id, student_id, day_of_week, start_time, duration_min, deleted_at, created_at",
  lessons:
    "id, owner_id, student_id, scheduled_date, scheduled_time, duration_min, status, notes, source_slot_id, moved_from_id, deleted_at, created_at, updated_at",
  attendance: "id, owner_id, student_id, date, status, note, compensated, deleted_at, created_at",
  finance: "id, owner_id, student_id, amount, currency, is_paid, pay_date, deleted_at, created_at",
  homework:
    "id, owner_id, student_id, assigned_date, due_date, task, status, note, deleted_at, created_at",
  rates: "id, owner_id, usd_to_rub, usdt_to_egp, usd_to_egp, updated_at",
  push_subscriptions: "id, owner_id, endpoint, p256dh, auth, user_agent, created_at",
  chat_messages: "id, user_id, role, content, tool_calls, tool_call_id, name, created_at",
  user_settings:
    "user_id, default_currency, default_lesson_duration, default_lesson_price, week_starts_on, remind_before_min, locale, remind_lessons, remind_payments, remind_homework, gender, theme, onboarding_completed, created_at, updated_at",
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type BackupRow = Record<string, JsonValue>;

export const exportBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const tables: Record<string, BackupRow[]> = {};
    for (const t of TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)(t).select(TABLE_SELECTS[t]);
      if (error) throw new Error(`${t}: ${error.message}`);
      tables[t] = (data ?? []) as unknown as BackupRow[];
    }
    return {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      tables,
    };
  });

const CSV_TABLES = ["students", "finance", "attendance", "homework", "lessons"] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>()),
  );
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return lines.join("\n");
}

export const exportCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const out: Record<string, string> = {};
    for (const t of CSV_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)(t).select(TABLE_SELECTS[t]);
      if (error) throw new Error(`${t}: ${error.message}`);
      out[t] = rowsToCsv((data ?? []) as unknown as Record<string, unknown>[]);
    }
    return out as Record<(typeof CSV_TABLES)[number], string>;
  });

// ---------- Per-table row schemas ----------
// Strip unknown columns; cap free-text length; constrain numeric/enum values.
// owner_id / user_id are overwritten with the current user before upsert.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const isoTimestamp = z.string().max(64);
const uuid = z.string().uuid();
const shortText = (max: number) => z.string().max(max).nullable().optional();

const studentRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    name: z.string().trim().min(1).max(100),
    days_per_week: z.number().int().min(0).max(7).nullable().optional(),
    subject: shortText(100),
    phone: shortText(40),
    status: z.string().max(40).nullable().optional(),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const scheduleSlotRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    student_id: uuid,
    day_of_week: z.number().int().min(0).max(7),
    start_time: isoTime,
    duration_min: z.number().int().min(5).max(600),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const lessonRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    student_id: uuid,
    scheduled_date: isoDate,
    scheduled_time: isoTime,
    duration_min: z.number().int().min(5).max(600),
    status: z.enum(["planned", "completed", "cancelled", "moved"]).optional(),
    notes: z.string().max(4000).nullable().optional(),
    source_slot_id: uuid.nullable().optional(),
    moved_from_id: uuid.nullable().optional(),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
    updated_at: isoTimestamp.optional(),
  })
  .strip();


const attendanceRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    student_id: uuid,
    date: isoDate,
    status: z.enum(["present", "absent", "excused", "rescheduled_by_teacher"]),
    note: z.string().max(2000).nullable().optional(),
    compensated: z.boolean().nullable().optional(),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const financeRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    student_id: uuid.nullable().optional(),
    amount: z.number().finite().min(0).max(10_000_000),
    currency: z.enum(["RUB", "USD", "USDT", "EGP"]),
    is_paid: z.boolean().optional(),
    pay_date: isoDate.nullable().optional(),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const homeworkRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    student_id: uuid,
    assigned_date: isoDate.nullable().optional(),
    due_date: isoDate.nullable().optional(),
    task: z.string().min(1).max(4000),
    status: z.enum(["assigned", "done", "not_done", "partial"]).optional(),
    note: z.string().max(2000).nullable().optional(),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const ratesRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    usd_to_rub: z.number().finite().min(0).max(1_000_000),
    usdt_to_egp: z.number().finite().min(0).max(1_000_000),
    usd_to_egp: z.number().finite().min(0).max(1_000_000),
    updated_at: isoTimestamp.optional(),
  })
  .strip();

const pushSubscriptionRowSchema = z
  .object({
    id: uuid.optional(),
    owner_id: uuid.optional(),
    endpoint: z.string().url().max(2000),
    p256dh: z.string().max(500),
    auth: z.string().max(500),
    user_agent: z.string().max(500).nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const chatMessageRowSchema = z
  .object({
    id: uuid.optional(),
    user_id: uuid.optional(),
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.string().max(20_000).nullable().optional(),
    tool_calls: z.unknown().nullable().optional(),
    tool_call_id: z.string().max(200).nullable().optional(),
    name: z.string().max(200).nullable().optional(),
    created_at: isoTimestamp.optional(),
  })
  .strip();

const userSettingsRowSchema = z
  .object({
    user_id: uuid.optional(),
    default_currency: z.enum(["RUB", "USD", "USDT", "EGP"]).optional(),
    default_lesson_duration: z.number().int().min(5).max(600).optional(),
    default_lesson_price: z.number().finite().min(0).max(10_000_000).optional(),
    week_starts_on: z.number().int().min(0).max(6).optional(),
    remind_before_min: z.number().int().min(0).max(10_000).optional(),
    locale: z.string().max(16).nullable().optional(),
    remind_lessons: z.boolean().optional(),
    remind_payments: z.boolean().optional(),
    remind_homework: z.boolean().optional(),
    gender: z.enum(["male", "female"]).nullable().optional(),
    theme: z.enum(["classic", "bloom"]).optional(),
    onboarding_completed: z.boolean().optional(),
    created_at: isoTimestamp.optional(),
    updated_at: isoTimestamp.optional(),
  })
  .strip();

const ROW_SCHEMAS = {
  students: studentRowSchema,
  schedule_slots: scheduleSlotRowSchema,
  lessons: lessonRowSchema,
  
  attendance: attendanceRowSchema,
  finance: financeRowSchema,
  homework: homeworkRowSchema,
  rates: ratesRowSchema,
  push_subscriptions: pushSubscriptionRowSchema,
  chat_messages: chatMessageRowSchema,
  user_settings: userSettingsRowSchema,
} as const satisfies Record<(typeof TABLES)[number], z.ZodTypeAny>;

const importSchema = z.object({
  json: z.object({
    version: z.number(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});

export const importBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.json.version !== BACKUP_VERSION) {
      throw new Error(`Несовместимая версия бэкапа: ${data.json.version}`);
    }
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      const rows = data.json.tables[t];
      if (!rows || rows.length === 0) {
        counts[t] = 0;
        continue;
      }
      const schema = ROW_SCHEMAS[t];
      // Validate + strip unknown columns; force owner_id / user_id to current user.
      const fixed: Record<string, unknown>[] = [];
      for (let i = 0; i < rows.length; i++) {
        const parsed = schema.safeParse(rows[i]);
        if (!parsed.success) {
          throw new Error(`${t}[${i}]: ${parsed.error.issues[0]?.message ?? "invalid row"}`);
        }
        const row = { ...(parsed.data as Record<string, unknown>) };
        if ("owner_id" in row) row.owner_id = userId;
        if ("user_id" in row) row.user_id = userId;
        if (t === "push_subscriptions") delete row.id;
        fixed.push(row);
      }
      const conflictCol =
        t === "user_settings" ? "user_id" : t === "push_subscriptions" ? "endpoint" : "id";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(t).upsert(fixed as any, {
        onConflict: conflictCol,
      });
      if (error) throw new Error(`${t}: ${error.message}`);
      counts[t] = fixed.length;
    }
    return { ok: true, counts };
  });


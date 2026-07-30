import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { enforceRateLimit } from "@/lib/rate-limit";

const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 5_000_000;
const MAX_ROWS_PER_TABLE = 5_000;
const MAX_TOTAL_ROWS = 20_000;
const BACKUP_PAGE_SIZE = 200;
const TABLES = [
  "students",
  "schedule_slots",
  "lessons",
  "attendance",
  "finance",
  "homework",
  "rates",
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
  finance:
    "id, owner_id, student_id, amount, currency, is_paid, pay_date, entry_type, cycle_number, deleted_at, created_at",
  homework:
    "id, owner_id, student_id, assigned_date, due_date, task, status, note, deleted_at, created_at",
  rates:
    "id, owner_id, usd_to_rub, usdt_to_egp, usd_to_egp, base_currency, rates_map, rates_fetched_at, updated_at",
  chat_messages: "id, user_id, role, content, tool_calls, tool_call_id, name, created_at",
  user_settings:
    "user_id, default_currency, default_lesson_duration, default_lesson_price, week_starts_on, remind_before_min, locale, remind_lessons, remind_payments, remind_homework, gender, theme, onboarding_completed, created_at, updated_at",
};

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type BackupRow = Record<string, JsonValue>;

type ByteBudget = { used: number };

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function consumeByteBudget(budget: ByteBudget, value: unknown) {
  budget.used += serializedByteLength(value);
  if (budget.used > MAX_BACKUP_BYTES) {
    throw new Error("Резервная копия превышает допустимый размер.");
  }
}

async function selectBackupRows(
  supabase: SupabaseClient<Database>,
  table: (typeof TABLES)[number],
  byteBudget?: ByteBudget,
): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  let offset = 0;
  let expectedCount: number | null = null;

  while (expectedCount === null || rows.length < expectedCount) {
    const result: {
      data: unknown[] | null;
      error: { code?: string } | null;
      count: number | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = await (supabase.from as any)(table)
      .select(TABLE_SELECTS[table], { count: expectedCount === null ? "exact" : undefined })
      .range(offset, Math.min(offset + BACKUP_PAGE_SIZE - 1, MAX_ROWS_PER_TABLE - 1));
    const { data, error, count } = result;

    if (error) {
      console.error("[backup-select]", table, error.code ?? "unknown");
      throw new Error("Не удалось подготовить резервную копию.");
    }
    if (expectedCount === null) {
      const resolvedCount = count ?? data?.length ?? 0;
      expectedCount = resolvedCount;
      if (resolvedCount > MAX_ROWS_PER_TABLE) {
        throw new Error(`Слишком много записей в разделе ${table} для одного экспорта.`);
      }
    }

    const page = (data ?? []) as unknown as BackupRow[];
    if (byteBudget) consumeByteBudget(byteBudget, page);
    rows.push(...page);
    if (page.length === 0) break;
    offset += page.length;
  }

  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(`Не удалось полностью выгрузить раздел ${table}.`);
  }
  return rows;
}

export const exportBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await enforceRateLimit(userId, "backup_export");
    const tables: Record<string, BackupRow[]> = {};
    const byteBudget: ByteBudget = { used: 0 };
    for (const t of TABLES) {
      tables[t] = await selectBackupRows(supabase, t, byteBudget);
    }
    const result = {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      tables,
    };
    if (serializedByteLength(result) > MAX_BACKUP_BYTES) {
      throw new Error("Резервная копия превышает допустимый размер.");
    }
    return result;
  });

const CSV_TABLES = ["students", "finance", "attendance", "homework", "lessons"] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  // Prevent spreadsheet formula execution when a CSV is opened in Excel/Sheets.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
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
    const { supabase, userId } = context;
    await enforceRateLimit(userId, "backup_export");
    const out: Record<string, string> = {};
    const byteBudget: ByteBudget = { used: 0 };
    for (const t of CSV_TABLES) {
      out[t] = rowsToCsv(await selectBackupRows(supabase, t, byteBudget));
      if (serializedByteLength(out) > MAX_BACKUP_BYTES) {
        throw new Error("CSV-экспорт превышает допустимый размер.");
      }
    }
    return out as Record<(typeof CSV_TABLES)[number], string>;
  });

// ---------- Per-table row schemas ----------
// Strip unknown columns; cap free-text length; constrain numeric/enum values.
// owner_id / user_id are overwritten with the current user before upsert.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const isoTimestamp = z.string().datetime({ offset: true }).max(64);
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
    status: z.enum(["active", "paused", "completed", "archived"]).nullable().optional(),
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
    student_id: uuid,
    amount: z.number().finite().min(-120_000_000).max(120_000_000),
    currency: currencyCodeSchema,
    is_paid: z.boolean().optional(),
    pay_date: isoDate.nullable().optional(),
    deleted_at: isoTimestamp.nullable().optional(),
    created_at: isoTimestamp.optional(),
    entry_type: z.enum(["manual", "lesson_cycle"]).optional(),
    cycle_number: z.number().int().positive().nullable().optional(),
  })
  .strip()
  .superRefine((row, context) => {
    if (row.amount < 0 && row.deleted_at == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "Negative finance amounts are allowed only for archived legacy rows.",
      });
    }
  });

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
    usd_to_rub: z.number().finite().positive().max(1_000_000),
    usdt_to_egp: z.number().finite().positive().max(1_000_000),
    usd_to_egp: z.number().finite().positive().max(1_000_000),
    base_currency: z.literal("USD").optional(),
    rates_map: z.record(z.string(), z.number().finite().positive()).nullable().optional(),
    rates_fetched_at: isoTimestamp.nullable().optional(),
    updated_at: isoTimestamp.optional(),
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
    default_currency: currencyCodeSchema.optional(),
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
  chat_messages: chatMessageRowSchema,
  user_settings: userSettingsRowSchema,
} as const satisfies Record<(typeof TABLES)[number], z.ZodTypeAny>;

const importSchema = z.object({
  json: z.object({
    version: z.number().int().nonnegative(),
    tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});

function validateImport(input: unknown) {
  let bytes: number;
  try {
    bytes = serializedByteLength(input);
  } catch {
    throw new Error("Некорректный формат резервной копии.");
  }
  if (bytes > MAX_BACKUP_BYTES) {
    throw new Error("Резервная копия слишком большая.");
  }
  const parsed = importSchema.parse(input);
  const tableRows = Object.values(parsed.json.tables);
  if (tableRows.some((rows) => rows.length > MAX_ROWS_PER_TABLE)) {
    throw new Error("В одном из разделов резервной копии слишком много записей.");
  }
  const totalRows = tableRows.reduce((sum, rows) => sum + rows.length, 0);
  if (totalRows > MAX_TOTAL_ROWS) {
    throw new Error("В резервной копии слишком много записей.");
  }
  return parsed;
}

export const importBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateImport)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await enforceRateLimit(userId, "backup_import");
    if (data.json.version !== BACKUP_VERSION) {
      throw new Error(`Несовместимая версия бэкапа: ${data.json.version}`);
    }
    const counts: Record<string, number> = {};
    const importedSlotStudentById = new Map<string, string>();
    const importedLessonStudentById = new Map<string, string>();

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
        if (t === "chat_messages" || t === "user_settings") {
          row.user_id = userId;
        } else {
          row.owner_id = userId;
        }
        fixed.push(row);
      }

      if (t === "schedule_slots") {
        for (const row of fixed) {
          if (typeof row.id === "string" && typeof row.student_id === "string") {
            importedSlotStudentById.set(row.id, row.student_id);
          }
        }
      }

      if (t === "lessons") {
        for (const row of fixed) {
          if (typeof row.id === "string" && typeof row.student_id === "string") {
            importedLessonStudentById.set(row.id, row.student_id);
          }
        }

        // Old backups can retain provenance IDs whose target was hard-deleted.
        // Keep the lesson itself, but discard only missing or cross-student
        // provenance so the new tenant-aware foreign keys remain authoritative.
        for (const row of fixed) {
          const studentId = row.student_id;
          const sourceSlotId = row.source_slot_id;
          if (
            typeof sourceSlotId === "string" &&
            importedSlotStudentById.get(sourceSlotId) !== studentId
          ) {
            row.source_slot_id = null;
          }

          const movedFromId = row.moved_from_id;
          if (
            typeof movedFromId === "string" &&
            importedLessonStudentById.get(movedFromId) !== studentId
          ) {
            row.moved_from_id = null;
          }
        }
      }

      const conflictCol = t === "user_settings" ? "user_id" : "id";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(t).upsert(fixed as any, {
        onConflict: conflictCol,
      });
      if (error) {
        console.error("[backup-import]", t, error.code);
        throw new Error(`Не удалось импортировать раздел ${t}.`);
      }
      counts[t] = fixed.length;
    }
    return { ok: true, counts };
  });

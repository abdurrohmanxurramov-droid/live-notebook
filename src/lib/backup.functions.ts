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
      const { data, error } = await supabase.from(t).select(TABLE_SELECTS[t]);
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
    }, new Set<string>())
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
      const { data, error } = await supabase.from(t).select(TABLE_SELECTS[t]);
      if (error) throw new Error(`${t}: ${error.message}`);
      out[t] = rowsToCsv((data ?? []) as Record<string, unknown>[]);
    }
    return out as Record<(typeof CSV_TABLES)[number], string>;
  });

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
      // Force owner_id / user_id to current user
      const fixed = rows.map((r) => {
        const row = { ...r } as Record<string, unknown>;
        if ("owner_id" in row) row.owner_id = userId;
        if (t === "user_settings") row.user_id = userId;
        return row;
      });
      const conflictCol = t === "user_settings" ? "user_id" : "id";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from(t).upsert(fixed as any, { onConflict: conflictCol });
      if (error) throw new Error(`${t}: ${error.message}`);
      counts[t] = fixed.length;
    }
    return { ok: true, counts };
  });

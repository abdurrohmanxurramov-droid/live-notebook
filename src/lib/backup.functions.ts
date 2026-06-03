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

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type BackupRow = Record<string, JsonValue>;

export const exportBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const tables: Record<string, BackupRow[]> = {};
    for (const t of TABLES) {
      const { data, error } = await supabase.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      tables[t] = (data ?? []) as unknown as BackupRow[];
    }
    return {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      tables,
    };
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

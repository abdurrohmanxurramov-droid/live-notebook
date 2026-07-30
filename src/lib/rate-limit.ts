import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type RateLimitScope =
  | "ai_chat"
  | "backup_export"
  | "backup_import"
  | "push_test"
  | "mcp_write";

export async function enforceRateLimit(
  supabase: SupabaseClient<Database>,
  scope: RateLimitScope,
): Promise<void> {
  const { data, error } = await supabase.rpc("consume_app_rate_limit", {
    p_scope: scope,
  });

  if (error) {
    console.error("[rate-limit]", scope, error.code);
    throw new Error("Защита от частых запросов временно недоступна. Попробуйте позже.");
  }
  if (data !== true) {
    throw new Error("Слишком много запросов. Подождите немного и попробуйте снова.");
  }
}

export type RateLimitScope =
  | "ai_chat"
  | "backup_export"
  | "backup_import"
  | "push_test"
  | "mcp_write";

/**
 * Consumes one rate-limit token for the given user.
 * The underlying RPC is executable by service_role only, so it is called with
 * the trusted server client and an explicit user id.
 */
export async function checkRateLimit(userId: string, scope: RateLimitScope): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("consume_app_rate_limit", {
    p_scope: scope,
    p_user_id: userId,
  });
  if (error) {
    console.error("[rate-limit]", scope, error.code);
    throw new Error("Защита от частых запросов временно недоступна. Попробуйте позже.");
  }
  return data === true;
}

export async function enforceRateLimit(userId: string, scope: RateLimitScope): Promise<void> {
  const allowed = await checkRateLimit(userId, scope);
  if (!allowed) {
    throw new Error("Слишком много запросов. Подождите немного и попробуйте снова.");
  }
}

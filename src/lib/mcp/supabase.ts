import type { ToolContext } from "@lovable.dev/mcp-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client bound to the verified OAuth caller.
 * Publishable key + the caller's bearer token: RLS runs as the signed-in user.
 * Never uses the service-role key.
 */
export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export function ok(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function dbError(tag: string, error: { code?: string } | null): ToolResult {
  console.error(`[mcp:${tag}]`, error?.code ?? "unknown");
  return fail("Операция не выполнена. Попробуйте позже.");
}

/** Resolves the authenticated caller, or returns an error result. */
export async function requireCaller(
  ctx: ToolContext,
): Promise<{ supabase: SupabaseClient; userId: string } | ToolResult> {
  if (!ctx.isAuthenticated()) return fail("Not authenticated");
  const supabase = supabaseForUser(ctx);
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return fail("Not authenticated");
  return { supabase, userId };
}

export function isToolResult(value: unknown): value is ToolResult {
  return typeof value === "object" && value !== null && "content" in value;
}

/** Consumes one write token for the caller. Returns null when allowed. */
export async function guardWrite(userId: string): Promise<ToolResult | null> {
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const allowed = await checkRateLimit(userId, "mcp_write").catch(() => false);
  if (!allowed) return fail("Слишком много запросов. Подождите немного и попробуйте снова.");
  return null;
}

/** Verifies the student exists, is not deleted, and belongs to the caller. */
export async function assertOwnStudent(
  supabase: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

/** Verifies the lesson exists, is not deleted, and belongs to the caller. */
export async function assertOwnLesson(
  supabase: SupabaseClient,
  lessonId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lessons")
    .select("id")
    .eq("id", lessonId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

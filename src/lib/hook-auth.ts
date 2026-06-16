// Server-only helper: validates X-Hook-Secret header against the HOOK_SECRET
// stored in Supabase Vault, using timing-safe comparison.
// Reads via a SECURITY DEFINER RPC (get_hook_secret) so cron jobs and this
// server share a single source of truth — rotating the Vault entry rotates both.
// Falls back to process.env.HOOK_SECRET if the RPC is unavailable.
import { timingSafeEqual } from "crypto";

let cached: { value: string; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function loadExpectedSecret(): Promise<string | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_hook_secret");
    if (!error && typeof data === "string" && data.length > 0) {
      cached = { value: data, at: Date.now() };
      return data;
    }
  } catch {
    // fall through to env
  }
  const env = process.env.HOOK_SECRET;
  if (env && env.length > 0) {
    cached = { value: env, at: Date.now() };
    return env;
  }
  return null;
}

export async function checkHookSecret(request: Request): Promise<Response | null> {
  const expected = await loadExpectedSecret();
  if (!expected) {
    return new Response("HOOK_SECRET not configured", { status: 500 });
  }
  const provided = request.headers.get("x-hook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

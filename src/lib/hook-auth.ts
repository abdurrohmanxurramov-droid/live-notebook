// Server-only helper: validates X-Hook-Secret header against the HOOK_SECRET
// stored in Supabase Vault, using timing-safe comparison.
// Reads via a SECURITY DEFINER RPC (get_hook_secret) so cron jobs and this
// server share a single source of truth — rotating the Vault entry rotates both.
// Falls back to process.env.HOOK_SECRET if the RPC is unavailable.
import { timingSafeEqual } from "crypto";
import { z } from "zod";

let cached: { value: string; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;
const hookPayloadSchema = z.object({}).strict();
const MAX_HOOK_BODY_BYTES = 1024;

export function rejectUnsupportedHookMethod(): Response {
  return Response.json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        Allow: "POST",
        "Cache-Control": "no-store",
      },
    },
  );
}

async function readLimitedBody(request: Request): Promise<string | null> {
  const reader = request.clone().body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HOOK_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

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
    return new Response("Service unavailable", { status: 503 });
  }
  const provided = request.headers.get("x-hook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_HOOK_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  try {
    const body = await readLimitedBody(request);
    if (body === null) {
      return new Response("Payload too large", { status: 413 });
    }
    const parsed = hookPayloadSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  return null;
}

export async function claimHookExecution(hookName: string, windowKey: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("claim_hook_execution", {
    p_hook_name: hookName,
    p_window_key: windowKey,
  });
  if (error) {
    console.error("[hook-idempotency]", hookName, error.code);
    throw new Error("Hook idempotency check failed");
  }
  return data === true;
}

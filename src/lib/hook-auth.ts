// Server-only helper: validates X-Hook-Secret header against HOOK_SECRET env var
// using timing-safe comparison. Returns a 401 Response if invalid, else null.
import { timingSafeEqual } from "crypto";

export function checkHookSecret(request: Request): Response | null {
  const expected = process.env.HOOK_SECRET;
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

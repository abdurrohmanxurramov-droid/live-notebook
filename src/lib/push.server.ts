// Server-only: web-push sender. Never import from client code.
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VAPID_PUBLIC =
  "BMsPV2ojnxOy0BNfmip6b0_ZBBsO4BAlZFBjcRaAMS65s-LAlImbacmmuNspD1I3tgfieXXzw4LCBX0EPGUfuwg";

let configured = false;
function configure() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT || "mailto:teacher@livenote.app";
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) throw new Error("VAPID_PRIVATE_KEY is not set");
  webpush.setVapidDetails(subject, VAPID_PUBLIC, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushSubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPushTo(sub: PushSubRow, payload: PushPayload) {
  configure();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 600 }
    );
    return { ok: true as const };
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    // Stale subscription — clean up
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    return { ok: false as const, error: err.message ?? "push failed", status: err.statusCode };
  }
}

export async function broadcast(payload: PushPayload) {
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) throw new Error(error.message);
  const results = await Promise.all((subs ?? []).map((s) => sendPushTo(s, payload)));
  return {
    total: results.length,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}

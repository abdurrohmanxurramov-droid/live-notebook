import { supabase, SUPABASE_AUTH_STORAGE_KEY } from "@/integrations/supabase/client";
import { clearOfflineSnapshots } from "@/lib/offline";
import { unsubscribePush, unsubscribePushLocally } from "@/lib/push";

function clearPersistedSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`);
  localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`);
}

function broadcastLocalSignOut(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(SUPABASE_AUTH_STORAGE_KEY);
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  } catch {
    // Storage cleanup below remains the security boundary when BroadcastChannel
    // is unavailable or blocked by the browser.
  }
}

async function forceLocalSignOut(): Promise<void> {
  await supabase.auth.stopAutoRefresh().catch(() => {});
  clearPersistedSession();
  broadcastLocalSignOut();
}

export async function signOutSafely(): Promise<void> {
  try {
    await unsubscribePush();
  } catch {
    // If server cleanup is unavailable, invalidate the browser endpoint so it
    // cannot keep receiving the previous user's notifications.
    await unsubscribePushLocally().catch(() => {});
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) await forceLocalSignOut();
  } catch {
    await forceLocalSignOut();
  } finally {
    // Do not rely solely on the asynchronous SIGNED_OUT listener: navigation or
    // a network failure must never leave the previous user's offline CRM data.
    await clearOfflineSnapshots().catch(() => {});
    await unsubscribePushLocally().catch(() => {});
  }
}

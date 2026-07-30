// Client-side Web Push helpers
import {
  ownsPushSubscription,
  removePushSubscription,
  savePushSubscription,
} from "./push.functions";

// VAPID public key (safe to expose; private key lives in server secret)
export const VAPID_PUBLIC_KEY =
  "BBfliNs2fnILCFvMEGcitzDTcSCVl3dW2FKkljPQX_Al6j1NHg2v5ZrblLaI-rv3EJtB2j_pWozTLQPV4i_WvHc";
const PUSH_OWNER_STORAGE_KEY = "live-notebook:push-owner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  let reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

function keysEqual(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const av = new Uint8Array(a);
  if (av.length !== b.length) return false;
  for (let i = 0; i < av.length; i++) if (av[i] !== b[i]) return false;
  return true;
}

/**
 * If the browser holds a push subscription created with a different VAPID
 * public key (e.g. after key rotation), it's dead. Silently unsubscribe so
 * the UI can prompt the user to enable notifications again.
 */
async function unsubscribeLocally(sub: PushSubscription) {
  await sub.unsubscribe();
  localStorage.removeItem(PUSH_OWNER_STORAGE_KEY);
}

async function healStaleSubscription(
  reg: ServiceWorkerRegistration,
  currentUserId?: string,
  strictOwnership = false,
) {
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const storedOwnerId = localStorage.getItem(PUSH_OWNER_STORAGE_KEY);
  if (currentUserId && storedOwnerId && storedOwnerId !== currentUserId) {
    await unsubscribeLocally(sub);
    return null;
  }
  const expected = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const current = sub.options.applicationServerKey ?? null;
  if (!keysEqual(current, expected)) {
    try {
      await removePushSubscription({ data: { endpoint: sub.endpoint } });
    } catch {
      // ignore server-side cleanup errors
    }
    await unsubscribeLocally(sub);
    return null;
  }
  try {
    const ownedByCurrentUser = await ownsPushSubscription({
      data: { endpoint: sub.endpoint },
    });
    if (!ownedByCurrentUser) {
      await unsubscribeLocally(sub);
      return null;
    }
    if (currentUserId) localStorage.setItem(PUSH_OWNER_STORAGE_KEY, currentUserId);
  } catch {
    // During an auth transition, an unknown owner must fail closed. For an
    // already-bound current user, a temporary network failure can keep push.
    if (strictOwnership && storedOwnerId !== currentUserId) {
      await unsubscribeLocally(sub);
      return null;
    }
  }
  return sub;
}

export async function healPushSubscriptionForCurrentUser(currentUserId: string): Promise<void> {
  const reg = await getRegistration();
  if (reg) await healStaleSubscription(reg, currentUserId, true);
}

export async function isSubscribed(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await healStaleSubscription(reg);
  return !!sub && Notification.permission === "granted";
}

export async function subscribePush(): Promise<boolean> {
  if (!pushSupported()) throw new Error("Браузер не поддерживает push");
  // Push API не работает в кросс-доменных iframe (превью Lovable).
  // Откройте приложение в отдельной вкладке.
  let isIframe = false;
  try {
    isIframe = window.self !== window.top;
  } catch {
    isIframe = true;
  }
  if (isIframe) {
    throw new Error("Откройте приложение в отдельной вкладке — в превью push не работает");
  }
  const perm = await Notification.requestPermission();
  if (perm === "denied")
    throw new Error("Разрешение отклонено. Включите уведомления в настройках браузера");
  if (perm !== "granted") throw new Error("Разрешение не получено");
  const reg = await getRegistration();
  if (!reg) throw new Error("Не удалось зарегистрировать service worker");
  let sub = await healStaleSubscription(reg);
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }
  const json = sub.toJSON();
  const saved = await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent,
    },
  });
  localStorage.setItem(PUSH_OWNER_STORAGE_KEY, saved.ownerId);
  return true;
}

export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await removePushSubscription({ data: { endpoint: sub.endpoint } });
    } finally {
      await unsubscribeLocally(sub);
    }
  } else {
    localStorage.removeItem(PUSH_OWNER_STORAGE_KEY);
  }
}

export async function unsubscribePushLocally(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await unsubscribeLocally(sub);
  else localStorage.removeItem(PUSH_OWNER_STORAGE_KEY);
}

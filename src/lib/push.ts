// Client-side Web Push helpers
import { savePushSubscription, removePushSubscription } from "./push.functions";

// VAPID public key (safe to expose; private key lives in server secret)
export const VAPID_PUBLIC_KEY =
  "BBfliNs2fnILCFvMEGcitzDTcSCVl3dW2FKkljPQX_Al6j1NHg2v5ZrblLaI-rv3EJtB2j_pWozTLQPV4i_WvHc";

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
async function healStaleSubscription(reg: ServiceWorkerRegistration) {
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const expected = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const current = sub.options.applicationServerKey ?? null;
  if (!keysEqual(current, expected)) {
    try {
      await removePushSubscription({ data: { endpoint: sub.endpoint } });
    } catch {
      // ignore server-side cleanup errors
    }
    await sub.unsubscribe();
    return null;
  }
  return sub;
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
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }
  const json = sub.toJSON();
  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent,
    },
  });
  return true;
}

export async function unsubscribePush(): Promise<void> {
  const reg = await getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await removePushSubscription({ data: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
}

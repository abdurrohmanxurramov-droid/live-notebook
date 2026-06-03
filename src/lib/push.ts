// Client-side Web Push helpers
import { savePushSubscription, removePushSubscription } from "./push.functions";

// VAPID public key (safe to expose; private key lives in server secret)
export const VAPID_PUBLIC_KEY =
  "BL0iI6I4fOxkatMN7sSmbPdoahwXLZT4v91KPQEUM8uvYAgSpmYGvzbL6m73lMN5eYe8uOS-ij54bmy8EDQ2kCY";

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

export async function isSubscribed(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub && Notification.permission === "granted";
}

export async function subscribePush(): Promise<boolean> {
  if (!pushSupported()) throw new Error("Браузер не поддерживает push");
  // Push API не работает в кросс-доменных iframe (превью Lovable).
  // Откройте приложение в отдельной вкладке.
  let isIframe = false;
  try { isIframe = window.self !== window.top; } catch { isIframe = true; }
  if (isIframe) {
    throw new Error("Откройте приложение в отдельной вкладке — в превью push не работает");
  }
  const perm = await Notification.requestPermission();
  if (perm === "denied") throw new Error("Разрешение отклонено. Включите уведомления в настройках браузера");
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

// Registers the app service worker in production only.
// Push registration keeps its own path (src/lib/push.ts).
const BLOCKED_HOSTS = /(^|\.)lovableproject(-dev)?\.com$|(^|\.)beta\.lovable\.dev$/;

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  const host = window.location.hostname;
  if (
    inIframe() ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    BLOCKED_HOSTS.test(host)
  ) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // registration failures must never break the app
    });
  });
}

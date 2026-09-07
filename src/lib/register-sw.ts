// Registers the app service worker in production only.
// Push registration keeps its own path (src/lib/push.ts).
const BLOCKED_HOSTS = /(^|\.)lovableproject(-dev)?\.com$|(^|\.)beta\.lovable\.dev$/;
const RELOAD_GUARD_KEY = "ln-sw-reloaded-at";
const RELOAD_COOLDOWN_MS = 60_000;

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function canReloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

async function register() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    // Новый воркер => сразу активируем его, чтобы HTML и hashed-ассеты
    // не расходились между версиями сборки.
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          if (canReloadOnce()) window.location.reload();
        }
      });
    });

    void registration.update().catch(() => {});
  } catch {
    // registration failures must never break the app
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
  // Не полагаемся на событие load: к моменту вызова оно часто уже прошло.
  if (document.readyState === "complete") {
    void register();
  } else {
    window.addEventListener("load", () => void register(), { once: true });
  }
}

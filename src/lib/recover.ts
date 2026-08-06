// Автовосстановление после «пустой страницы».
// Типовая причина: браузер/сервис-воркер отдал устаревшую версию оболочки,
// которая ссылается на уже удалённые чанки — динамический импорт падает,
// React не может отрисовать дерево, и пользователь видит пустой экран.

const RELOAD_GUARD_KEY = "ln-recovered-at";
const RELOAD_COOLDOWN_MS = 60_000;

const STALE_BUILD_PATTERNS = [
  /dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk .* failed/i,
  /chunkloaderror/i,
  /failed to fetch dynamically/i,
  /unexpected token '<'/i,
  /module script failed/i,
];

function messageOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "");
  }
  return "";
}

export function looksLikeStaleBuildError(value: unknown): boolean {
  const message = messageOf(value);
  if (!message) return false;
  return STALE_BUILD_PATTERNS.some((pattern) => pattern.test(message));
}

/** Сбрасывает кеши сервис-воркера. Безопасно вызывать где угодно. */
export async function clearAppCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    /* noop */
  }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.allSettled(
        names.filter((name) => name.startsWith("ln-")).map((name) => caches.delete(name)),
      );
    }
  } catch {
    /* noop */
  }
}

/** Ручной «жёсткий перезапуск» из экрана ошибки. */
export async function hardRestart(): Promise<void> {
  await clearAppCaches();
  window.location.replace(window.location.pathname + window.location.search);
}

function canReloadNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/** Глобальные слушатели: один автоматический перезапуск при устаревшей сборке. */
export function installStaleBuildRecovery(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __lnRecoveryInstalled?: boolean };
  if (w.__lnRecoveryInstalled) return;
  w.__lnRecoveryInstalled = true;

  const handle = (value: unknown) => {
    if (!looksLikeStaleBuildError(value)) return;
    if (!canReloadNow()) return;
    void hardRestart();
  };

  window.addEventListener("error", (event) => handle(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => handle(event.reason));
}

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { hardRestart } from "@/lib/recover";

const SHOWN_KEY = "splash-shown-session";
const BRAND_MS = 1100;
const LEAVE_MS = 600;
const STARTUP_TIMEOUT_MS = 13_000;

/**
 * Стартовый экран и одновременно startup-guard: он остаётся на экране,
 * пока маршрут/авторизация не готовы, поэтому пустая белая страница
 * при первом запуске невозможна. Если запуск завис — показываем
 * понятный экран ошибки вместо пустоты.
 */
export function SplashScreen({
  pending = false,
  onRetry,
}: {
  pending?: boolean;
  onRetry?: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
    setMounted(true);
    const firstTime = sessionStorage.getItem(SHOWN_KEY) !== "1";
    sessionStorage.setItem(SHOWN_KEY, "1");
    if (firstTime) haptic("medium");
    const t = window.setTimeout(() => setMinElapsed(true), firstTime ? BRAND_MS : 0);
    return () => {
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!pending) {
      setStuck(false);
      return;
    }
    const timeout = window.setTimeout(() => setStuck(true), STARTUP_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [pending, retryAttempt]);

  const ready = mounted && minElapsed && !pending;

  useEffect(() => {
    if (!ready || leaving) return;
    haptic("light");
    setLeaving(true);
    const t = window.setTimeout(() => setGone(true), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [ready, leaving]);

  if (gone) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        leaving ? "opacity-0 scale-110 blur-md pointer-events-none" : "opacity-100 scale-100"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(60% 45% at 10% 0%, rgba(179, 139, 89, 0.35), transparent 60%), radial-gradient(55% 40% at 100% 15%, rgba(91, 130, 200, 0.30), transparent 60%), radial-gradient(70% 50% at 50% 100%, rgba(200, 110, 140, 0.22), transparent 60%)",
      }}
    >
      <div className="flex flex-col items-center gap-8 animate-splash-in">
        <div className="group relative">
          <div className="pointer-events-none absolute inset-0 scale-150 rounded-full bg-white/20 opacity-50 blur-3xl" />
          <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[2.5rem] border border-white/60 bg-gradient-to-br from-white/60 to-white/20 shadow-[0_22px_40px_-10px_rgba(20,33,61,0.08)] backdrop-blur-2xl">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-tr from-transparent via-white/30 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
            <div className="relative flex items-baseline">
              <span className="text-[3.2rem] font-bold leading-none tracking-[-0.05em] text-foreground">
                L
              </span>
              <span className="-ml-1 text-[3.2rem] font-medium leading-none tracking-[-0.05em] text-foreground">
                N
              </span>
              <div className="absolute -bottom-1 -right-3 h-3 w-3 rounded-full bg-accent shadow-sm" />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <h1 className="ml-1 text-2xl font-semibold uppercase tracking-[0.15em] text-foreground">
            Live Notebook
          </h1>
          <div className="h-px w-8 bg-accent/40" />
        </div>

        {stuck && !ready ? (
          <div className="mt-2 max-w-xs px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Приложение слишком долго запускается. Проверьте соединение и попробуйте снова.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => {
                  setStuck(false);
                  setRetrying(true);
                  setRetryAttempt((attempt) => attempt + 1);
                  Promise.resolve(onRetry?.()).finally(() => setRetrying(false));
                }}
                disabled={retrying}
                className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
              >
                Повторить
              </button>
              <button
                onClick={() => void hardRestart()}
                className="rounded-xl border border-border px-4 py-2 text-sm text-foreground"
              >
                Перезагрузить
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex gap-1.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
          </div>
        )}
      </div>
    </div>
  );
}

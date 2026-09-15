import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from "@/integrations/supabase/client";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { TopClock } from "@/components/TopClock";
import { hasAnySnapshot, isNetworkError, OFFLINE_TEXT } from "@/lib/offline";
import { getSafeUiErrorMessage } from "@/lib/utils";
import { signOutSafely } from "@/lib/logout";

const AUTH_TIMEOUT_MS = 7000;

async function withStartupTimeout<T>(request: PromiseLike<T>): Promise<T | null> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as {
      user?: unknown;
      session?: { user?: unknown };
      currentSession?: { user?: unknown };
    };
    const candidate = value.user ?? value.session?.user ?? value.currentSession?.user;
    if (!candidate || typeof candidate !== "object" || !("id" in candidate)) return null;
    if (typeof (candidate as { id?: unknown }).id !== "string") return null;
    return candidate as User;
  } catch {
    return null;
  }
}

function AuthErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const message = getSafeUiErrorMessage(error, "Не удалось загрузить раздел");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Ошибка раздела</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset?.();
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Повторить
          </button>
          <Link
            to="/"
            className="rounded-xl border border-border px-4 py-2 text-sm text-foreground"
          >
            На главную
          </Link>
          <button
            onClick={async () => {
              await signOutSafely();
              window.location.href = "/auth";
            }}
            className="rounded-xl border border-border px-4 py-2 text-sm text-foreground"
          >
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Страница не найдена</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Offline-safe gate: trust the locally stored session so a network failure
    // never signs a previously logged-in user out.
    const cachedUser = readCachedUser();
    let user = cachedUser;
    try {
      const sessionResult = await withStartupTimeout(supabase.auth.getSession());
      user = sessionResult?.data.session?.user ?? cachedUser;
    } catch {
      // Temporary storage/auth failure: retain the safely parsed cached session.
    }
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!offline) {
      try {
        // Ограничиваем сетевую проверку: зависший запрос не должен держать
        // приложение на экране загрузки — используем сохранённую сессию.
        const userResult = await withStartupTimeout(supabase.auth.getUser());
        if (userResult && !userResult.error && userResult.data.user) user = userResult.data.user;
        else if (userResult?.error && (!user || !isNetworkError(userResult.error))) {
          throw redirect({ to: "/auth", search: {} });
        }
      } catch (e) {
        if (e && typeof e === "object" && "to" in (e as Record<string, unknown>)) throw e;
        // network failure — keep the stored session
      }
    }
    if (!user) {
      throw redirect({ to: "/auth", search: {} });
    }
    if (offline && !(await hasAnySnapshot())) {
      throw new Error(OFFLINE_TEXT.offlineNoCache);
    }
    const data = { user };
    // Onboarding gate (only for routes inside _authenticated, except /onboarding itself)
    if (!location.pathname.startsWith("/onboarding")) {
      try {
        const settingsResult = await withStartupTimeout(
          supabase
            .from("user_settings")
            .select("onboarding_completed, gender")
            .eq("user_id", data.user.id)
            .maybeSingle(),
        );
        const settings = settingsResult?.error ? null : settingsResult?.data;
        if (settings && settings.onboarding_completed !== true && settings.gender == null) {
          throw redirect({ to: "/onboarding" });
        }
      } catch (e) {
        // Re-throw redirects; swallow other errors so the app still loads.
        if (e && typeof e === "object" && "to" in (e as Record<string, unknown>)) throw e;
      }
    }
    return { user: data.user };
  },
  component: PageShell,
  errorComponent: AuthErrorComponent,
  notFoundComponent: AuthNotFound,
});

function PageShell() {
  return (
    <>
      <TopClock />
      <Outlet />
      <QuickActionsFab />
    </>
  );
}

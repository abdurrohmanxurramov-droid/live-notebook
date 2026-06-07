import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { TopClock } from "@/components/TopClock";

function AuthErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const message = error?.message ?? "Неизвестная ошибка";
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
              await supabase.auth.signOut();
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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    // Onboarding gate (only for routes inside _authenticated, except /onboarding itself)
    if (!location.pathname.startsWith("/onboarding")) {
      try {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("onboarding_completed, gender")
          .eq("user_id", data.user.id)
          .maybeSingle();
        const done =
          !!settings && (settings.onboarding_completed === true || settings.gender != null);
        if (!done) {
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

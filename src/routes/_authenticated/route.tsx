import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { QuickActionsFab } from "@/components/QuickActionsFab";

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
            onClick={() => { router.invalidate(); reset?.(); }}
            className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Повторить
          </button>
          <Link to="/" className="rounded-xl border border-border px-4 py-2 text-sm text-foreground">
            На главную
          </Link>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}
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
        <Link to="/" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          На главную
        </Link>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: PageShell,
  errorComponent: AuthErrorComponent,
  notFoundComponent: AuthNotFound,
});

function PageShell() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="animate-page-in">
      <Outlet />
      <QuickActionsFab />
    </div>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { BottomNav } from "../components/BottomNav";
import { SplashScreen } from "../components/SplashScreen";
import { supabase } from "@/integrations/supabase/client";
import { installGlobalHaptics } from "@/lib/haptics";
import { ThemeProvider } from "../components/ThemeProvider";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Страница не найдена</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          На главную
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const message = error?.message ?? "Неизвестная ошибка";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Что-то пошло не так</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset?.(); }}
            className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Повторить
          </button>
          <Link to="/" className="rounded-xl border border-border px-4 py-2 text-sm text-foreground">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" },
      { title: "LiveNotebook — CRM для преподавателей" },
      { name: "description", content: "Премиум CRM для преподавателей: ученики, посещаемость, финансы." },
      { name: "theme-color", content: "#14213D" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Живой Блокнот" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:title", content: "LiveNotebook — CRM для преподавателей" },
      { name: "twitter:title", content: "LiveNotebook — CRM для преподавателей" },
      { property: "og:description", content: "Премиум CRM для преподавателей: ученики, посещаемость, финансы." },
      { name: "twitter:description", content: "Премиум CRM для преподавателей: ученики, посещаемость, финансы." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9e453c54-d505-43c4-8639-cf21b0fc3cd9/id-preview-81f0475e--d39d2996-2034-45a2-9d70-95ccd7843397.lovable.app-1780566296895.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9e453c54-d505-43c4-8639-cf21b0fc3cd9/id-preview-81f0475e--d39d2996-2034-45a2-9d70-95ccd7843397.lovable.app-1780566296895.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,600&family=Caveat:wght@500;700&family=Cormorant+Garamond:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ThemeBoot() {
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideNav = pathname === "/auth";

  useEffect(() => {
    installGlobalHaptics();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBoot />
      <ThemeProvider />
      <SplashScreen />
      <div className={`mx-auto min-h-screen max-w-2xl safe-top ${hideNav ? "" : "pb-24"}`}>
        <Outlet />
      </div>
      {!hideNav && <BottomNav />}
      <Toaster position="top-center" theme="system" richColors />
    </QueryClientProvider>
  );
}

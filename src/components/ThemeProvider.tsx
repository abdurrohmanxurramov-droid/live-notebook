import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getSettings } from "@/lib/settings.functions";
import { BloomBackdrop } from "./BloomBackdrop";

export type AppTheme = "classic" | "bloom";

function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Reads `theme` from user_settings (only when signed in) and applies
 * data-theme="classic|bloom" on <html>. Renders bloom decorations
 * (floating petals) when active.
 */
export function ThemeProvider() {
  const fetchSettings = useServerFn(getSettings);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
      if (!session) applyTheme("classic");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data } = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => fetchSettings(),
    enabled: hasSession,
    retry: false,
    staleTime: 60_000,
  });


  const theme: AppTheme = (data as { theme?: AppTheme } | undefined)?.theme ?? "classic";

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);


  if (theme === "bloom") return <BloomBackdrop />;
  return null;
}

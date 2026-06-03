import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";

const SHOWN_KEY = "splash-shown-session";

export function SplashScreen() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SHOWN_KEY) !== "1";
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    haptic("medium");
    sessionStorage.setItem(SHOWN_KEY, "1");
    const t1 = setTimeout(() => {
      haptic("light");
      setLeaving(true);
    }, 1100);
    const t2 = setTimeout(() => setVisible(false), 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [visible]);

  if (!visible) return null;

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
      <div className="flex flex-col items-center gap-5 animate-splash-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-[28px] bg-accent/40 blur-2xl animate-pulse" />
          <div className="glass-strong relative flex h-24 w-24 items-center justify-center rounded-[28px] text-4xl font-bold tracking-tight text-foreground">
            ЖБ
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold tracking-tight text-foreground">Живой Блокнот</div>
          <div className="mt-1 text-xs text-muted-foreground">CRM для преподавателей</div>
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

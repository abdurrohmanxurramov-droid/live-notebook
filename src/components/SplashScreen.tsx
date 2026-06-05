import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";

const SHOWN_KEY = "splash-shown-session";

export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;
    setVisible(true);
  }, []);

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
      <div className="flex flex-col items-center gap-8 animate-splash-in">
        <div className="group relative">
          <div className="pointer-events-none absolute inset-0 scale-150 rounded-full bg-white/20 opacity-50 blur-3xl" />
          <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[2.5rem] border border-white/60 bg-gradient-to-br from-white/60 to-white/20 shadow-[0_22px_40px_-10px_rgba(20,33,61,0.08)] backdrop-blur-2xl">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-tr from-transparent via-white/30 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
            <div className="relative flex items-baseline">
              <span className="text-[3.2rem] font-bold leading-none tracking-[-0.05em] text-foreground">L</span>
              <span className="-ml-1 text-[3.2rem] font-medium leading-none tracking-[-0.05em] text-foreground">N</span>
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
        <div className="mt-2 flex gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

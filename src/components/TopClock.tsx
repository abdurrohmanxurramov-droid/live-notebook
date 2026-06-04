import { useEffect, useState } from "react";

export function TopClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      className="glass-strong pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums text-foreground shadow-sm"
      style={{
        top: "calc(env(safe-area-inset-top) + 10px)",
        right: "calc(env(safe-area-inset-right) + 12px)",
      }}
      aria-label="Текущее время"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)] shadow-[0_0_8px_var(--success)]" />
      {time}
    </div>
  );
}

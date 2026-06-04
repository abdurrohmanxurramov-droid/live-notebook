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
      className="pointer-events-none fixed right-3 z-50 text-[13px] font-semibold tabular-nums text-foreground"
      style={{
        top: "calc(env(safe-area-inset-top) + 10px)",
      }}
      aria-label="Текущее время"
    >
      {time}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type GlassChip<K extends string = string> = {
  key: K;
  label: React.ReactNode;
};

export function GlassChips<K extends string>({
  items,
  active,
  onChange,
  leading,
  className = "",
}: {
  items: ReadonlyArray<GlassChip<K>>;
  active: K;
  onChange: (key: K) => void;
  leading?: React.ReactNode;
  className?: string;
}) {
  const refs = useRef<Map<K, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [targetKey, setTargetKey] = useState<K>(active);

  useEffect(() => {
    setTargetKey(active);
  }, [active]);

  useLayoutEffect(() => {
    const el = refs.current.get(targetKey);
    if (!el) return;
    setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    const t = setTimeout(() => setReady(true), 30);
    return () => clearTimeout(t);
  }, [targetKey, items.length]);

  useEffect(() => {
    const onResize = () => {
      const el = refs.current.get(targetKey);
      if (!el) return;
      setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [targetKey]);

  const setRef = (key: K) => (node: HTMLButtonElement | null) => {
    if (node) refs.current.set(key, node);
    else refs.current.delete(key);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {leading}
      <div
        className="relative flex items-center gap-1 rounded-full p-1 overflow-x-auto ring-1 ring-white/40 dark:ring-white/10 shadow-[0_8px_24px_-12px_rgba(20,33,61,0.18),inset_0_1px_0_0_rgba(255,255,255,0.55)]"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
          WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
          scrollbarWidth: "none",
        }}
      >
        {indicator && (
          <span
            aria-hidden
            className="liquid-pill pointer-events-none absolute top-1 bottom-1 rounded-full"
            style={{
              transform: `translateX(${indicator.x - 4}px)`,
              width: indicator.w,
              transition: ready
                ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), width 320ms cubic-bezier(0.22, 1, 0.36, 1)"
                : "none",
            }}
          />
        )}
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <button
              key={it.key}
              ref={setRef(it.key)}
              type="button"
              onPointerDown={() => setTargetKey(it.key)}
              onClick={() => onChange(it.key)}
              className={`relative z-10 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-300 ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

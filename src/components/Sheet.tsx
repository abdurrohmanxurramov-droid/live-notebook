import { ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      document.body.style.overflow = "hidden";
      // next frame to trigger transition
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      document.body.style.overflow = "";
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-all duration-300 ease-out ${
          visible ? "opacity-100 backdrop-blur-xl saturate-150" : "opacity-0 backdrop-blur-0"
        }`}
      />
      <div
        className={`glass-strong relative z-10 w-full max-w-md rounded-t-[28px] p-5 sm:rounded-[28px] safe-bottom
          transition-all duration-[460ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform
          ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-8 scale-[0.985] opacity-0"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60 dark:bg-white/10 text-foreground backdrop-blur-md transition-transform duration-300 hover:scale-105 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

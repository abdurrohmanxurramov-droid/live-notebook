import { ReactNode, useEffect } from "react";
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
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-md" onClick={onClose} />
      <div className="glass-strong relative z-10 w-full max-w-md rounded-t-[28px] p-5 sm:rounded-[28px] safe-bottom animate-in slide-in-from-bottom-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60 dark:bg-white/10 text-foreground backdrop-blur-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

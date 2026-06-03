import { useRef, useState, ReactNode, PointerEvent } from "react";
import { Check, X, ArrowRight } from "lucide-react";
import { haptic } from "@/lib/haptics";

type Props = {
  children: ReactNode;
  enabled?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
  onReschedule?: () => void;
};

const THRESHOLD = 96; // px to trigger an action

export function SwipeableLessonCard({ children, enabled = true, onComplete, onCancel, onReschedule }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const lockedH = useRef(false);
  const lockedV = useRef(false);

  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (!enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    lockedH.current = false;
    lockedV.current = false;
    setDragging(true);
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const x = e.clientX - startX.current;
    const y = e.clientY - startY.current;
    if (!lockedH.current && !lockedV.current) {
      if (Math.abs(y) > 8 && Math.abs(y) > Math.abs(x)) {
        lockedV.current = true;
        setDragging(false);
        setDx(0);
        return;
      }
      if (Math.abs(x) > 8) {
        lockedH.current = true;
        try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
      }
    }
    if (lockedH.current) {
      e.preventDefault?.();
      setDx(Math.max(-180, Math.min(180, x)));
    }
  }
  function onUp() {
    if (!dragging && !lockedH.current) {
      setDx(0);
      return;
    }
    const v = dx;
    setDragging(false);
    setDx(0);
    if (!lockedH.current) return;
    if (v >= THRESHOLD && onComplete) {
      haptic("success");
      onComplete();
    } else if (v <= -THRESHOLD) {
      haptic("warning");
      // prefer cancel; if not provided, reschedule
      (onCancel ?? onReschedule)?.();
    } else {
      haptic("selection");
    }
  }

  const showLeft = dx > 0;
  const showRight = dx < 0;
  const intensity = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Left action (swipe right = mark done) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-start pl-4"
        style={{
          width: "100%",
          background: `color-mix(in oklab, var(--success) ${20 + intensity * 30}%, transparent)`,
          opacity: showLeft ? 1 : 0,
        }}
      >
        <span className="flex items-center gap-1.5 rounded-full bg-[color:var(--success)] px-3 py-1.5 text-xs font-semibold text-white">
          <Check className="h-4 w-4" /> Провёл
        </span>
      </div>
      {/* Right action (swipe left = cancel/reschedule) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end pr-4"
        style={{
          width: "100%",
          background: `color-mix(in oklab, var(--destructive) ${20 + intensity * 30}%, transparent)`,
          opacity: showRight ? 1 : 0,
        }}
      >
        <span className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-white">
          {onCancel ? <X className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          {onCancel ? "Отменить" : "Перенести"}
        </span>
      </div>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          transform: `translate3d(${dx}px,0,0)`,
          transition: dragging ? "none" : "transform 280ms cubic-bezier(0.22,1,0.36,1)",
          touchAction: lockedH.current ? "none" : "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}

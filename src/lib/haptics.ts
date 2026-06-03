// iOS-like haptic feedback using Web Vibration API.
// On iOS Safari vibration is not supported, but on Android/PWA it works.
// We still call it everywhere — it's a no-op when unsupported.

type Intensity = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

const patterns: Record<Intensity, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 22,
  heavy: 35,
  success: [14, 40, 22],
  warning: [22, 50, 22],
  error: [30, 60, 30, 60, 30],
};

let lastAt = 0;

export function haptic(intensity: Intensity = "light") {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    const now = Date.now();
    if (now - lastAt < 30) return; // throttle
    lastAt = now;
    navigator.vibrate(patterns[intensity]);
  } catch {
    /* noop */
  }
}

/** Global delegation: vibrate on every tap of an interactive element. */
export function installGlobalHaptics() {
  if (typeof window === "undefined") return;
  if ((window as any).__hapticsInstalled) return;
  (window as any).__hapticsInstalled = true;

  const handler = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const el = target.closest(
      'button, a, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], input[type="checkbox"], input[type="radio"], label, summary'
    ) as HTMLElement | null;
    if (!el) return;
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;
    const kind = (el.getAttribute("data-haptic") as Intensity | null) ?? "light";
    haptic(kind);
  };

  window.addEventListener("pointerdown", handler, { passive: true, capture: true });
}

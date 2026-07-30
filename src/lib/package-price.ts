import { normalizeCurrency } from "@/lib/currency";

export const PACKAGE_SIZE = 12;
export const PACKAGE_PRESETS = [2500, 4000, 5000];
const PKG_MEMORY_KEY = "ln:last-package-price";
const PAY_MEMORY_PREFIX = "ln:last-payment:";

export function perLessonFromPackage(pkg: string): number | null {
  if (pkg.trim() === "") return null;
  const total = Math.max(0, Math.min(10_000_000, Number(pkg) || 0));
  return Math.round((total / PACKAGE_SIZE) * 100) / 100;
}

export function rememberPackagePrice(pkg: string, currency: string) {
  try {
    localStorage.setItem(PKG_MEMORY_KEY, JSON.stringify({ pkg, currency }));
  } catch {
    /* ignore */
  }
}

export function readPackageMemory(): { pkg: string; currency: string } | null {
  try {
    const raw = localStorage.getItem(PKG_MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pkg?: string; currency?: string };
    if (!parsed?.pkg) return null;
    return { pkg: String(parsed.pkg), currency: normalizeCurrency(parsed.currency) };
  } catch {
    return null;
  }
}

/** Память последней суммы платежа конкретного ученика. */
export function rememberPayment(studentId: string, amount: string, currency: string) {
  try {
    localStorage.setItem(PAY_MEMORY_PREFIX + studentId, JSON.stringify({ amount, currency }));
  } catch {
    /* ignore */
  }
}

export function readPaymentMemory(studentId: string): { amount: string; currency: string } | null {
  try {
    const raw = localStorage.getItem(PAY_MEMORY_PREFIX + studentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { amount?: string; currency?: string };
    if (!parsed?.amount) return null;
    return { amount: String(parsed.amount), currency: normalizeCurrency(parsed.currency) };
  } catch {
    return null;
  }
}

/** Суммы-подсказки: цена пакета ученика (если задана) + стандартные варианты. */
export function amountSuggestions(lessonPrice: number | null | undefined): number[] {
  const list: number[] = [];
  if (lessonPrice != null && lessonPrice > 0) {
    list.push(Math.round(lessonPrice * PACKAGE_SIZE * 100) / 100);
  }
  for (const p of PACKAGE_PRESETS) if (!list.includes(p)) list.push(p);
  return list;
}

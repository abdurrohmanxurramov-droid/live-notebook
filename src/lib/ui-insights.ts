import { useServerFn } from "@tanstack/react-start";
import { uiQuery, uiMutate, type UiQueryOp, type UiMutateOp } from "@/lib/insights.functions";
import { formatMoney } from "@/lib/currency";

export type Totals = Record<string, number>;

export function fmtTotals(totals: Totals | null | undefined, empty = "—"): string {
  const entries = Object.entries(totals ?? {}).filter(([, v]) => Number(v) !== 0);
  if (!entries.length) return empty;
  return entries.map(([code, value]) => formatMoney(Number(value), code)).join(" · ");
}

export function sumTotals(totals: Totals | null | undefined): number {
  return Object.values(totals ?? {}).reduce((s, v) => s + Number(v || 0), 0);
}

/** Typed helper around the allowlisted MCP read bridge. */
export function useInsightQuery() {
  const run = useServerFn(uiQuery);
  return <T = Record<string, unknown>>(
    operation: UiQueryOp,
    params: Record<string, unknown> = {},
  ) => run({ data: { operation, params } }) as Promise<T>;
}

/** Typed helper around the allowlisted MCP write bridge. */
export function useInsightMutate() {
  const run = useServerFn(uiMutate);
  return <T = Record<string, unknown>>(
    operation: UiMutateOp,
    params: Record<string, unknown> = {},
  ) => run({ data: { operation, params } }) as Promise<T>;
}

export function isoToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function ruDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    weekday: "short",
  });
}

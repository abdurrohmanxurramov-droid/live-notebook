import { describe, expect, it } from "vitest";
import { fmtTotals, sumTotals, isoToday, ruDate } from "@/lib/ui-insights";

describe("ui-insights helpers", () => {
  it("formats empty totals as placeholder", () => {
    expect(fmtTotals(null)).toBe("—");
    expect(fmtTotals({ RUB: 0 }, "нет")).toBe("нет");
  });

  it("formats multi-currency totals", () => {
    const out = fmtTotals({ RUB: 2500, EGP: 100 });
    expect(out).toContain("2");
    expect(out).toContain("·");
  });

  it("sums totals across currencies", () => {
    expect(sumTotals({ RUB: 100, EGP: 50 })).toBe(150);
    expect(sumTotals(undefined)).toBe(0);
  });

  it("returns ISO dates with offset", () => {
    expect(isoToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const a = new Date(`${isoToday()}T00:00:00`);
    const b = new Date(`${isoToday(3)}T00:00:00`);
    expect(Math.round((+b - +a) / 86400000)).toBe(3);
  });

  it("renders russian dates", () => {
    expect(ruDate("2026-01-15")).toContain("15");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildRateMap,
  convert,
  currencyCodeSchema,
  formatMoney,
  isSupportedCurrency,
  sumConverted,
} from "./currency";

const map = buildRateMap({ EUR: 0.92, TRY: 34, AED: 3.67, RUB: 92, JPY: 150, KWD: 0.31 });

describe("buildRateMap", () => {
  it("keeps only finite positive numbers and pins USD/USDT", () => {
    const m = buildRateMap({ EUR: "0.9", TRY: 0, AED: -1, RUB: Number.NaN, JPY: 150 });
    expect(m.USD).toBe(1);
    expect(m.USDT).toBe(1);
    expect(m.EUR).toBeUndefined();
    expect(m.TRY).toBeUndefined();
    expect(m.AED).toBeUndefined();
    expect(m.RUB).toBeUndefined();
    expect(m.JPY).toBe(150);
  });

  it("rejects non plain objects", () => {
    expect(buildRateMap(null)).toEqual({ USD: 1, USDT: 1 });
    expect(buildRateMap([["EUR", 1]])).toEqual({ USD: 1, USDT: 1 });
    expect(buildRateMap("EUR=1")).toEqual({ USD: 1, USDT: 1 });
  });
});

describe("convert", () => {
  it("supports EUR/TRY/AED via USD base", () => {
    expect(convert(100, "USD", "EUR", map)).toEqual({ ok: true, value: 92 });
    const try_ = convert(10, "EUR", "TRY", map);
    expect(try_.ok).toBe(true);
    if (try_.ok) expect(try_.value).toBeCloseTo((10 / 0.92) * 34, 6);
    const aed = convert(1, "AED", "USD", map);
    expect(aed.ok).toBe(true);
    if (aed.ok) expect(aed.value).toBeCloseTo(1 / 3.67, 6);
  });

  it("returns same amount when currencies match", () => {
    expect(convert(55.5, "TRY", "TRY", map)).toEqual({ ok: true, value: 55.5 });
  });

  it("fails on missing rate instead of returning source amount", () => {
    expect(convert(100, "SEK", "USD", map)).toEqual({ ok: false, reason: "missing_rate" });
    expect(convert(100, "USD", "SEK", map)).toEqual({ ok: false, reason: "missing_rate" });
    expect(convert(100, "USD", "EUR", null)).toEqual({ ok: false, reason: "missing_rate" });
  });

  it("rejects invalid amounts and unknown codes", () => {
    expect(convert(Number.NaN, "USD", "EUR", map)).toEqual({ ok: false, reason: "invalid_amount" });
    expect(convert(10, "XXXXX", "USD", map).ok).toBe(false);
    expect(convert(10, "eur", "USD", map).ok).toBe(true);
  });

  it("USDT behaves as USD", () => {
    expect(convert(10, "USDT", "USD", map)).toEqual({ ok: true, value: 10 });
  });
});

describe("sumConverted", () => {
  it("sums converted rows and keeps unconverted separate", () => {
    const res = sumConverted(
      [
        { amount: 100, currency: "USD" },
        { amount: 92, currency: "EUR" },
        { amount: 50, currency: "SEK" },
        { amount: 25, currency: "SEK" },
      ],
      "USD",
      map,
    );
    expect(res.total).toBeCloseTo(200, 6);
    expect(res.unconvertedCount).toBe(2);
    expect(res.unconverted).toEqual({ SEK: 75 });
  });
});

describe("formatMoney", () => {
  it("always shows whole units without cents/kopeks", () => {
    expect(formatMoney(1234.567, "KWD", "en-US")).toContain("1,235");
    expect(formatMoney(1234.5, "USD", "en-US")).toContain("1,235");
    expect(formatMoney(1234.4, "JPY", "en-US")).toContain("1,234");
  });

  it("falls back for USDT and junk codes", () => {
    expect(formatMoney(10.5, "USDT")).toContain("USDT");
    expect(formatMoney(10.5, "XXXXX")).toContain("XXXXX");
  });
});

describe("currency domain", () => {
  it("accepts ISO codes plus USDT and rejects junk", () => {
    expect(isSupportedCurrency("KPW")).toBe(true);
    expect(isSupportedCurrency("XDR")).toBe(true);
    expect(isSupportedCurrency("USDT")).toBe(true);
    expect(isSupportedCurrency("TVD")).toBe(false);
    expect(isSupportedCurrency("EURO")).toBe(false);
    expect(currencyCodeSchema.safeParse("eur").success).toBe(true);
    expect(currencyCodeSchema.safeParse("XXXXX").success).toBe(false);
  });
});

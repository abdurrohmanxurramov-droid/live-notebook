import { z } from "zod";

/**
 * Единый источник правды по валютам.
 * Коды ISO 4217 (3 буквы) + совместимая псевдо-валюта USDT (4 буквы, 1:1 к USD).
 */

export type CurrencyCode = string;

export const CURRENCIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "RUB", name: "Российский рубль" },
  { code: "USD", name: "Доллар США" },
  { code: "USDT", name: "Tether USDT" },
  { code: "EUR", name: "Евро" },
  { code: "EGP", name: "Египетский фунт" },
  { code: "GBP", name: "Фунт стерлингов" },
  { code: "TRY", name: "Турецкая лира" },
  { code: "AED", name: "Дирхам ОАЭ" },
  { code: "KZT", name: "Казахстанский тенге" },
  { code: "UAH", name: "Украинская гривна" },
  { code: "BYN", name: "Белорусский рубль" },
  { code: "GEL", name: "Грузинский лари" },
  { code: "AMD", name: "Армянский драм" },
  { code: "AZN", name: "Азербайджанский манат" },
  { code: "UZS", name: "Узбекский сум" },
  { code: "KGS", name: "Киргизский сом" },
  { code: "TJS", name: "Таджикский сомони" },
  { code: "MDL", name: "Молдавский лей" },
  { code: "RSD", name: "Сербский динар" },
  { code: "PLN", name: "Польский злотый" },
  { code: "CZK", name: "Чешская крона" },
  { code: "HUF", name: "Венгерский форинт" },
  { code: "RON", name: "Румынский лей" },
  { code: "BGN", name: "Болгарский лев" },
  { code: "CHF", name: "Швейцарский франк" },
  { code: "SEK", name: "Шведская крона" },
  { code: "NOK", name: "Норвежская крона" },
  { code: "DKK", name: "Датская крона" },
  { code: "ISK", name: "Исландская крона" },
  { code: "CAD", name: "Канадский доллар" },
  { code: "AUD", name: "Австралийский доллар" },
  { code: "NZD", name: "Новозеландский доллар" },
  { code: "JPY", name: "Японская иена" },
  { code: "CNY", name: "Китайский юань" },
  { code: "HKD", name: "Гонконгский доллар" },
  { code: "TWD", name: "Тайваньский доллар" },
  { code: "KRW", name: "Южнокорейская вона" },
  { code: "SGD", name: "Сингапурский доллар" },
  { code: "MYR", name: "Малайзийский ринггит" },
  { code: "THB", name: "Тайский бат" },
  { code: "IDR", name: "Индонезийская рупия" },
  { code: "PHP", name: "Филиппинское песо" },
  { code: "VND", name: "Вьетнамский донг" },
  { code: "INR", name: "Индийская рупия" },
  { code: "PKR", name: "Пакистанская рупия" },
  { code: "BDT", name: "Бангладешская така" },
  { code: "LKR", name: "Шри-ланкийская рупия" },
  { code: "NPR", name: "Непальская рупия" },
  { code: "ILS", name: "Израильский шекель" },
  { code: "SAR", name: "Саудовский риял" },
  { code: "QAR", name: "Катарский риал" },
  { code: "KWD", name: "Кувейтский динар" },
  { code: "BHD", name: "Бахрейнский динар" },
  { code: "OMR", name: "Оманский риал" },
  { code: "JOD", name: "Иорданский динар" },
  { code: "LBP", name: "Ливанский фунт" },
  { code: "IQD", name: "Иракский динар" },
  { code: "IRR", name: "Иранский риал" },
  { code: "AFN", name: "Афгани" },
  { code: "MAD", name: "Марокканский дирхам" },
  { code: "DZD", name: "Алжирский динар" },
  { code: "TND", name: "Тунисский динар" },
  { code: "LYD", name: "Ливийский динар" },
  { code: "SDG", name: "Суданский фунт" },
  { code: "ETB", name: "Эфиопский быр" },
  { code: "KES", name: "Кенийский шиллинг" },
  { code: "TZS", name: "Танзанийский шиллинг" },
  { code: "UGX", name: "Угандийский шиллинг" },
  { code: "NGN", name: "Нигерийская найра" },
  { code: "GHS", name: "Ганский седи" },
  { code: "XOF", name: "Франк КФА BCEAO" },
  { code: "XAF", name: "Франк КФА BEAC" },
  { code: "ZAR", name: "Южноафриканский рэнд" },
  { code: "BWP", name: "Ботсванская пула" },
  { code: "MUR", name: "Маврикийская рупия" },
  { code: "BRL", name: "Бразильский реал" },
  { code: "ARS", name: "Аргентинское песо" },
  { code: "CLP", name: "Чилийское песо" },
  { code: "COP", name: "Колумбийское песо" },
  { code: "PEN", name: "Перуанский соль" },
  { code: "UYU", name: "Уругвайское песо" },
  { code: "BOB", name: "Боливиано" },
  { code: "PYG", name: "Парагвайский гуарани" },
  { code: "MXN", name: "Мексиканское песо" },
  { code: "CRC", name: "Костариканский колон" },
  { code: "GTQ", name: "Гватемальский кетсаль" },
  { code: "DOP", name: "Доминиканское песо" },
  { code: "JMD", name: "Ямайский доллар" },
  { code: "TTD", name: "Доллар Тринидада и Тобаго" },
  { code: "CUP", name: "Кубинское песо" },
  { code: "MNT", name: "Монгольский тугрик" },
  { code: "MMK", name: "Мьянманский кьят" },
  { code: "KHR", name: "Камбоджийский риель" },
  { code: "LAK", name: "Лаосский кип" },
  { code: "MOP", name: "Патака Макао" },
  { code: "BND", name: "Брунейский доллар" },
  { code: "FJD", name: "Доллар Фиджи" },
  { code: "PGK", name: "Кина" },
  { code: "MKD", name: "Македонский денар" },
  { code: "ALL", name: "Албанский лек" },
  { code: "BAM", name: "Конвертируемая марка" },
  { code: "TMT", name: "Туркменский манат" },
  { code: "SYP", name: "Сирийский фунт" },
  { code: "YER", name: "Йеменский риал" },
  { code: "ZMW", name: "Замбийская квача" },
  { code: "AOA", name: "Ангольская кванза" },
  { code: "MZN", name: "Мозамбикский метикал" },
  { code: "NAD", name: "Доллар Намибии" },
  { code: "RWF", name: "Франк Руанды" },
  { code: "SOS", name: "Сомалийский шиллинг" },
  { code: "SCR", name: "Сейшельская рупия" },
  { code: "XCD", name: "Восточнокарибский доллар" },
  { code: "BSD", name: "Багамский доллар" },
  { code: "BBD", name: "Барбадосский доллар" },
  { code: "BZD", name: "Белизский доллар" },
  { code: "HNL", name: "Гондурасская лемпира" },
  { code: "NIO", name: "Никарагуанская кордоба" },
  { code: "PAB", name: "Панамский бальбоа" },
  { code: "SRD", name: "Суринамский доллар" },
  { code: "GYD", name: "Гайанский доллар" },
  { code: "VES", name: "Венесуэльский боливар" },
  { code: "MVR", name: "Мальдивская руфия" },
  { code: "BTN", name: "Бутанский нгултрум" },
  { code: "MGA", name: "Малагасийский ариари" },
  { code: "MWK", name: "Малавийская квача" },
  { code: "GMD", name: "Даласи" },
  { code: "GNF", name: "Гвинейский франк" },
  { code: "SLE", name: "Леоне" },
  { code: "LRD", name: "Либерийский доллар" },
  { code: "CDF", name: "Конголезский франк" },
  { code: "BIF", name: "Бурундийский франк" },
  { code: "DJF", name: "Франк Джибути" },
  { code: "ERN", name: "Эритрейская накфа" },
  { code: "SSP", name: "Южносуданский фунт" },
  { code: "CVE", name: "Эскудо Кабо-Верде" },
  { code: "STN", name: "Добра" },
  { code: "SZL", name: "Свазилендский лилангени" },
  { code: "LSL", name: "Лоти" },
  { code: "TOP", name: "Паанга" },
  { code: "WST", name: "Тала" },
  { code: "VUV", name: "Вату" },
  { code: "SBD", name: "Доллар Соломоновых Островов" },
  { code: "KYD", name: "Доллар Каймановых Островов" },
  { code: "BMD", name: "Бермудский доллар" },
  { code: "ANG", name: "Нидерландский антильский гульден" },
  { code: "AWG", name: "Арубанский флорин" },
  { code: "HTG", name: "Гаитянский гурд" },
  { code: "XPF", name: "Франк КФП" },
  { code: "GIP", name: "Гибралтарский фунт" },
  { code: "FKP", name: "Фунт Фолклендских островов" },
  { code: "SHP", name: "Фунт Святой Елены" },
  { code: "KMF", name: "Коморский франк" },
  { code: "MRU", name: "Мавританская угия" },
  { code: "KPW", name: "Северокорейская вона" },
  { code: "CUC", name: "Кубинское конвертируемое песо" },
  { code: "SVC", name: "Сальвадорский колон" },
  { code: "ZWG", name: "Зимбабвийское золото" },
  { code: "XDR", name: "СДР (МВФ)" },
  { code: "XSU", name: "Сукре" },
  { code: "XUA", name: "Расчётная единица АфБР" },
  { code: "XAU", name: "Золото (тройская унция)" },
  { code: "XAG", name: "Серебро (тройская унция)" },
  { code: "XPT", name: "Платина (тройская унция)" },
  { code: "XPD", name: "Палладий (тройская унция)" },
  { code: "CLF", name: "Условная расчётная единица Чили" },
  { code: "BOV", name: "Боливийский мвдол" },
  { code: "CHE", name: "WIR евро" },
  { code: "CHW", name: "WIR франк" },
  { code: "COU", name: "Единица реальной стоимости (Колумбия)" },
  { code: "MXV", name: "Мексиканская инвестиционная единица" },
  { code: "USN", name: "Доллар США (следующий день)" },
  { code: "UYI", name: "Уругвайское песо (индексируемое)" },
  { code: "UYW", name: "Уругвайская номинальная единица" },
  { code: "XXX", name: "Без валюты" },
];

const CURRENCY_SET = new Set(CURRENCIES.map((c) => c.code));

/** Валидны только ISO 4217 (3 буквы) и совместимый USDT. */
export const CURRENCY_CODE_RE = /^([A-Z]{3}|USDT)$/;

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === "string" && CURRENCY_SET.has(code.toUpperCase());
}

export function normalizeCurrency(code: unknown, fallback = "RUB"): string {
  if (typeof code !== "string") return fallback;
  const upper = code.trim().toUpperCase();
  return CURRENCY_CODE_RE.test(upper) && CURRENCY_SET.has(upper) ? upper : fallback;
}

/** Zod-схема кода валюты: строка, а не enum из 4 значений. */
export const currencyCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => CURRENCY_CODE_RE.test(v) && CURRENCY_SET.has(v), {
    message: "Неподдерживаемый код валюты",
  });

export type RateMap = Record<string, number>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Оставляет только конечные положительные числовые курсы (без коэрсинга строк),
 * гарантирует USD=1 и USDT=1.
 */
export function buildRateMap(raw: unknown): RateMap {
  const map: RateMap = { USD: 1, USDT: 1 };
  if (isPlainObject(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const code = key.toUpperCase();
      if (!CURRENCY_CODE_RE.test(code) || !CURRENCY_SET.has(code)) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      map[code] = value;
    }
  }
  map.USD = 1;
  map.USDT = 1;
  return map;
}


export type ConvertResult =
  | { ok: true; value: number }
  | { ok: false; reason: "missing_rate" | "invalid_amount" };

/**
 * Конвертация amount из `from` в `to` по карте курсов (курс = единиц валюты за 1 USD).
 * Если курса нет — возвращается ошибка, а НЕ исходная сумма.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  map: RateMap | null | undefined,
): ConvertResult {
  if (!Number.isFinite(amount)) return { ok: false, reason: "invalid_amount" };
  const src = normalizeCurrency(from, "");
  const dst = normalizeCurrency(to, "");
  if (!src || !dst) return { ok: false, reason: "missing_rate" };
  if (src === dst) return { ok: true, value: amount };
  const rateFrom = map?.[src];
  const rateTo = map?.[dst];
  if (!Number.isFinite(rateFrom as number) || (rateFrom as number) <= 0)
    return { ok: false, reason: "missing_rate" };
  if (!Number.isFinite(rateTo as number) || (rateTo as number) <= 0)
    return { ok: false, reason: "missing_rate" };
  const value = (amount / (rateFrom as number)) * (rateTo as number);
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid_amount" };
  return { ok: true, value };
}

export type SumConvertedResult = {
  /** Сумма только успешно сконвертированных записей, в валюте `target`. */
  total: number;
  /** Количество записей, которые не удалось сконвертировать. */
  unconvertedCount: number;
  /** Несконвертированные суммы, сгруппированные по исходной валюте. */
  unconverted: Record<string, number>;
};

export function sumConverted(
  rows: ReadonlyArray<{ amount: number; currency: string }>,
  target: string,
  map: RateMap | null | undefined,
): SumConvertedResult {
  let total = 0;
  let unconvertedCount = 0;
  const unconverted: Record<string, number> = {};
  for (const row of rows) {
    const amount = Number(row.amount);
    const res = convert(amount, row.currency, target, map);
    if (res.ok) {
      total += res.value;
    } else {
      unconvertedCount += 1;
      const code = normalizeCurrency(row.currency, row.currency ?? "?");
      unconverted[code] = (unconverted[code] ?? 0) + (Number.isFinite(amount) ? amount : 0);
    }
  }
  return { total, unconvertedCount, unconverted };
}

/** Текстовое представление несконвертированного остатка для UI. */
export function describeUnconverted(
  unconverted: Record<string, number>,
  locale = "ru-RU",
): string {
  return Object.entries(unconverted)
    .map(([code, amount]) => formatMoney(amount, code, locale))
    .join(" + ");
}

export function formatMoney(amount: number, currency: string, locale = "ru-RU"): string {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const value = Number.isFinite(amount) ? amount : 0;
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      // Без maximumFractionDigits: Intl сам применяет minor units валюты
      // (0 для JPY, 2 для USD, 3 для KWD).
      return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
    } catch {
      /* неизвестный ISO-код — падаем на общий формат ниже */
    }
  }
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${code || ""}`.trim();
}


/** Карта курсов, восстановленная из legacy-колонок таблицы rates. */
export function legacyMapFromRates(
  row:
    | {
        usd_to_rub?: number | null;
        usdt_to_egp?: number | null;
        usd_to_egp?: number | null;
      }
    | null
    | undefined,
): RateMap {
  const map: RateMap = { USD: 1, USDT: 1 };
  const rub = Number(row?.usd_to_rub);
  if (Number.isFinite(rub) && rub > 0) map.RUB = rub;
  const egp = Number(row?.usd_to_egp ?? row?.usdt_to_egp);
  if (Number.isFinite(egp) && egp > 0) map.EGP = egp;
  return map;
}

/** Итоговая карта курсов: сохранённая карта → legacy-колонки → минимальный набор. */
export function resolveRateMap(
  row:
    | {
        rates_map?: unknown;
        usd_to_rub?: number | null;
        usdt_to_egp?: number | null;
        usd_to_egp?: number | null;
      }
    | null
    | undefined,
): RateMap {
  const stored = buildRateMap(row?.rates_map);
  if (Object.keys(stored).length > 2) {
    // сохранённая карта содержит что-то помимо USD/USDT
    return { ...legacyMapFromRates(row), ...stored };
  }
  return legacyMapFromRates(row);
}

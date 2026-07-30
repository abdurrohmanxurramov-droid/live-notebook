# Мультивалютность Live Notebook (ISO 4217)

Цель: любая валюта ISO 4217 при добавлении платежа, в валюте по умолчанию и в итогах. Дизайн и разметка существующих кнопок не меняются — правки только в валютной логике и в самих `select` со списком валют.

## 1. База данных (additive-миграция)

Таблица `rates` дополняется, legacy-колонки (`usd_to_rub`, `usdt_to_egp`, `usd_to_egp`) остаются нетронутыми:

- `base_currency text not null default 'USD'`
- `rates_map jsonb not null default '{}'::jsonb` — карта `{ "USD": 1, "RUB": 92.1, ... }`
- `rates_fetched_at timestamptz` — когда карта последний раз успешно получена

RLS/политики/гранты не меняются (таблица уже owner-scoped). После миграции обновляются `src/integrations/supabase/types.ts`.

### 1.1 Обязательное снятие 4-валютных CHECK (иначе EUR/TRY/AED падают с check_violation)

В уже применённой миграции `20260730135521` зашиты два ограничения. Та же additive-миграция их пересоздаёт:

- `finance_currency_check`: `DROP CONSTRAINT` → `ADD CONSTRAINT ... CHECK (currency ~ '^[A-Z]{3,4}$') NOT VALID` → `VALIDATE`.
- `user_settings_values_check`: `DROP` и пересоздание с тем же составом, где заменяется только валютная часть:
  `default_currency ~ '^[A-Z]{3,4}$' AND default_lesson_duration BETWEEN 5 AND 600 AND default_lesson_price BETWEEN 0 AND 10000000 AND week_starts_on BETWEEN 0 AND 6 AND remind_before_min BETWEEN 0 AND 10000` — остальные проверки сохраняются без ослабления.

Дополнительно `supabase/preflight/security_hardening_preflight.sql` (строки с `currency NOT IN ('RUB','USD','USDT','EGP')` и `default_currency NOT IN (...)`) и SQL/security-тесты переводятся на проверку формата кода вместо списка из 4 валют.

## 2. Новый модуль `src/lib/currency.ts`

Единая точка валютной логики:

- `CURRENCIES` — список ISO 4217 кодов с названиями (генерируется статически, ~160 позиций) + `USDT` как совместимая псевдо-валюта.
- `currencyCodeSchema` — Zod: строка `/^[A-Z]{3,4}$/`, приведение к upper-case, проверка по списку. Никаких enum из 4 значений.
- `buildRateMap(raw)` — принимает только конечные положительные числа, гарантирует `USD = 1` и `USDT = 1`.
- `convert(amount, from, to, map)` — возвращает `{ ok: true, value }` или `{ ok: false, reason: "missing_rate" }`. Формула `amount / rate[from] * rate[to]`. Если `from === to` — сумма возвращается как есть (`ok: true`). При отсутствующем курсе исходная сумма НЕ выдаётся как успешная конвертация.
- `sumConverted(rows, target, map)` — складывает только успешно сконвертированные записи и отдельно возвращает список несконвертированных (сумма по исходным валютам) для показа в UI.
- `formatMoney(amount, currency, locale)` — через `Intl.NumberFormat` со `style: "currency"`, с graceful fallback на `USDT`/неизвестный код (форматирование числа + код). Ручные тернарники символов (`₽ / $ / £`) удаляются.
- `legacyMapFromRates(row)` — строит карту из legacy-колонок для старых записей.

## 3. Курсы: получение и fallback

Источник прежний: `https://open.er-api.com/v6/latest/USD`.

Проверка ответа: `result === "success"`, наличие `rates`, каждое значение — конечное положительное число. Валидная карта сохраняется в `rates.rates_map` + `rates_fetched_at`.

Порядок fallback при чтении:
1. свежая карта из сети (при ручном обновлении/периодически);
2. сохранённая `rates_map` из БД;
3. карта, восстановленная из legacy-колонок (`USD`, `RUB`, `EGP`, `USDT`);
4. минимальная карта `{ USD: 1, USDT: 1 }`.

## 4. Правки по файлам

- `src/lib/db.ts` — тип `Finance.currency: string`; `Rates` расширяется `base_currency`/`rates_map`/`rates_fetched_at`; `convertToRUB/USDT/EGP` заменяются на `convert` (тонкие обёртки временно сохраняются, чтобы не ломать вызовы); `formatMoney` реэкспортируется из `currency.ts`.
- `src/routes/_authenticated/finance.tsx` — select валют заполняется полным списком ISO; «Итого получено» считается конвертацией каждой записи в валюту по умолчанию, затем суммой; блок курсов пишет в `rates_map` и оставляет legacy-поля для совместимости.
- `src/routes/_authenticated/analytics.tsx` — агрегаты по графику и топ-ученикам считаются через `convert` в валюту по умолчанию (сейчас жёстко RUB).
- `src/routes/_authenticated/index.tsx` — доход за месяц, «ожидается сегодня/за неделю» и просроченные: конвертация каждой записи, потом сумма; вывод в валюте по умолчанию вместо `overdueRows[0].currency`.
- `src/routes/_authenticated/reports.tsx` — убираются `finance[0]?.currency ?? "RUB"` и `inRange[0]?.currency`; строки сначала конвертируются, потом складываются; итог показывается в валюте по умолчанию.
- `src/components/StudentRoom.tsx` — select валют из общего списка; удаляется тернарник символов; суммы форматируются через `formatMoney`.
- `src/components/settings/UserSettingsSection.tsx` — `default_currency` выбирается из полного списка ISO (select без изменения стилей).
- `src/lib/schemas.ts` — `paymentSchema.currency` и `userSettingsSchema.default_currency` переходят на `currencyCodeSchema`.
- `src/lib/backup.functions.ts` — валютные поля импорта на `currencyCodeSchema`; в схеме `rates` добавляются новые опциональные поля, legacy остаются обязательными как сейчас.
- `src/lib/ai.functions.ts` — описание инструмента и Zod-валидация валюты через `currencyCodeSchema`; дефолт берётся из настроек пользователя, а не хардкод `"RUB"`.

Не трогаются: PWA/offline, MCP, push, auth, секреты, дизайн кнопок.

## 5. Обратная совместимость

- Старые записи `RUB/USD/EGP/USDT` остаются валидными: их коды входят в список, конвертация работает по карте, `USDT = 1` относительно USD.
- Пока `rates_map` пуст, карта строится из legacy-колонок — приложение считает как раньше.
- Legacy-колонки продолжают обновляться при сохранении курсов, поэтому бэкапы/импорт старого формата не ломаются.

## 6. Проверки

- Unit-проверки `currency.ts`: `convert` симметрична и возвращает исходную сумму при `from === to`; отказ от некорректных курсов (0, отрицательные, NaN, строки); `formatMoney` для RUB/USD/EGP/USDT/JPY (нулевые знаки после запятой) и неизвестного кода.
- Ручная проверка: добавление платежа в новой валюте (например, TRY), корректный пересчёт итогов на «Финансы», «Аналитика», «Отчёты», главной и в карточке ученика.
- Проверка fallback: имитация недоступного API — берётся сохранённая карта, затем legacy.
- `bunx vitest run` и типизация после регенерации типов Supabase.

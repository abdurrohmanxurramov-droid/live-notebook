import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  Button,
  Input,
  Select,
  Avatar,
  Badge,
  Empty,
  SectionTitle,
} from "@/components/ui-bits";
import {
  useStudents,
  useFinance,
  useRates,
  useMut,
  initials,
  rateMapOf,
  type Finance,
} from "@/lib/db";
import {
  CURRENCIES,
  buildRateMap,
  convert,
  describeUnconverted,
  formatMoney,
  normalizeCurrency,
  sumConverted,
} from "@/lib/currency";
import { useDefaultCurrency } from "@/lib/use-settings";
import { AmountPresets } from "@/components/AmountPresets";
import { readPaymentMemory, rememberPayment } from "@/lib/package-price";
import { sb } from "@/lib/sb";
import { getErrorMessage } from "@/lib/utils";
import { RefreshCw, Trash2, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance")({ component: FinancePage });

function FinancePage() {
  const { data: students = [] } = useStudents();
  const { data: finance = [] } = useFinance();
  const { data: rates } = useRates();
  const studentsById = useMemo(() => {
    const m = new Map<string, (typeof students)[number]>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const displayCurrency = useDefaultCurrency();
  const rateMap = useMemo(() => rateMapOf(rates), [rates]);

  const totals = useMemo(() => {
    const paid = finance
      .filter((f) => f.is_paid)
      .map((f) => ({ amount: Number(f.amount), currency: f.currency }));
    return sumConverted(paid, displayCurrency, rateMap);
  }, [finance, rateMap, displayCurrency]);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Финансы</h1>
      <p className="mt-1 text-sm text-muted-foreground">Курсы валют и платежи учеников</p>

      <RatesCard />

      <SectionTitle>Итого получено</SectionTitle>
      <Card className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          В валюте {displayCurrency}
        </div>
        <div className="num mt-1 text-2xl text-foreground">
          {formatMoney(totals.total, displayCurrency)}
        </div>
        {totals.unconvertedCount > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            Курс недоступен для {describeUnconverted(totals.unconverted)} — не включено в сумму
          </div>
        )}
      </Card>

      <SectionTitle>Ученики</SectionTitle>
      {students.length === 0 ? (
        <Empty
          icon={<Wallet className="h-8 w-8" />}
          title="Нет учеников"
          hint="Сначала добавьте ученика"
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {students.map((s) => (
            <StudentFinanceCard
              key={s.id}
              studentId={s.id}
              name={s.name}
              lessonPrice={s.lesson_price}
              lessonCurrency={s.lesson_currency}
            />
          ))}
        </div>
      )}

      <SectionTitle>Все платежи</SectionTitle>
      {finance.length === 0 ? (
        <Empty icon={<Wallet className="h-8 w-8" />} title="Платежей пока нет" />
      ) : (
        <div className="space-y-2">
          {finance.map((f) => {
            const s = studentsById.get(f.student_id);
            return <PaymentRow key={f.id} f={f} name={s?.name ?? "—"} />;
          })}
        </div>
      )}
    </div>
  );
}

type RateRow = { code: string; value: string };

export function RatesCard() {
  const { data: rates } = useRates();
  const displayCurrency = useDefaultCurrency();
  const [fetchedMap, setFetchedMap] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);

  const currentMap = useMemo(() => rateMapOf(rates), [rates]);

  // Компактный список пар: 1 USD = X <валюта>. Показываем только нужные валюты,
  // остальные курсы хранятся в базе и подтягиваются автоматически.
  const [rows, setRows] = useState<RateRow[] | null>(null);
  const effectiveRows: RateRow[] =
    rows ??
    Array.from(new Set([displayCurrency, "RUB", "EGP"]))
      .filter((code) => code && code !== "USD" && code !== "USDT")
      .map((code) => {
        const value = currentMap[code];
        return { code, value: value ? String(Math.round(value * 10000) / 10000) : "" };
      });


  const setRow = (i: number, patch: Partial<RateRow>) =>
    setRows(effectiveRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows(effectiveRows.filter((_, idx) => idx !== i));
  const addRow = () => {
    const used = new Set(effectiveRows.map((r) => r.code));
    const next = CURRENCIES.find((c) => !used.has(c.code) && c.code !== "USD" && c.code !== "USDT");
    setRows([...effectiveRows, { code: next?.code ?? "EUR", value: "" }]);
  };

  const save = useMut(async () => {
    if (!rates) return;
    const manual: Record<string, number> = {};
    for (const r of effectiveRows) {
      const code = normalizeCurrency(r.code, "");
      const num = Number(r.value);
      if (!code || !Number.isFinite(num) || num <= 0) continue;
      manual[code] = num;
    }
    const nextMap: Record<string, number> = {
      ...currentMap,
      ...(fetchedMap ?? {}),
      ...manual,
      USD: 1,
      USDT: 1,
    };
    const nextRub = nextMap.RUB ?? Number(rates.usd_to_rub);
    const nextEgp = nextMap.EGP ?? Number(rates.usd_to_egp);
    const { error } = await (
      await sb()
    )
      .from("rates")
      .update({
        usd_to_rub: nextRub,
        usdt_to_egp: nextEgp,
        usd_to_egp: nextEgp,
        base_currency: "USD",
        rates_map: nextMap,
        rates_fetched_at: fetchedMap ? new Date().toISOString() : rates.rates_fetched_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rates.id);
    if (error) throw error;
    setRows(null);
    setFetchedMap(null);
  }, ["rates"]);

  async function fetchLive() {
    setLoading(true);
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error("Сервис курсов недоступен");
      const j: unknown = await res.json();
      const payload = (j ?? {}) as {
        result?: unknown;
        base_code?: unknown;
        rates?: unknown;
      };
      const ratesRaw = payload.rates;
      const isPlainRates =
        typeof ratesRaw === "object" && ratesRaw !== null && !Array.isArray(ratesRaw);
      if (payload.result !== "success" || payload.base_code !== "USD" || !isPlainRates) {
        throw new Error("Некорректный ответ сервиса курсов");
      }
      const map = buildRateMap(ratesRaw);
      if (Object.keys(map).length <= 2) throw new Error("Нет данных курса");
      setFetchedMap(map);
      setRows(
        effectiveRows.map((r) => {
          const fresh = map[normalizeCurrency(r.code, "")];
          return fresh ? { ...r, value: String(Math.round(fresh * 10000) / 10000) } : r;
        }),
      );
      toast.success(`Курсы обновлены (${Object.keys(map).length} валют)`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось получить курс"));
    } finally {
      setLoading(false);
    }
  }

  const knownCount = Object.keys(fetchedMap ?? currentMap).length;

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-foreground">Курсы валют</h3>
        <Button variant="outline" onClick={fetchLive} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">
        База USD · доступно курсов: {knownCount} · валюта отображения: {displayCurrency}
      </div>

      <div className="space-y-2">
        {effectiveRows.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Курсов пока нет — нажмите «Обновить» или добавьте пару вручную.
          </div>
        )}
        {effectiveRows.map((row, i) => (
          <div
            key={`${row.code}-${i}`}
            className="grid grid-cols-[auto_6.5rem_1fr_auto] items-center gap-2"
          >
            <span className="text-xs text-muted-foreground">1 USD =</span>
            <Select
              value={row.code}
              onChange={(e) => setRow(i, { code: e.target.value })}
              aria-label="Валюта"
            >
              {CURRENCIES.filter((c) => c.code !== "USD").map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
            <Input
              inputMode="decimal"
              placeholder="Курс"
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Удалить курс"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button variant="outline" className="mt-2 w-full" onClick={addRow}>
        Добавить валюту
      </Button>

      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={async () => {
          try {
            await save.mutateAsync(undefined as never);
            toast.success("Сохранено");
          } catch (error: unknown) {
            toast.error(getErrorMessage(error));
          }
        }}
      >
        Сохранить курсы
      </Button>
    </Card>
  );
}

function StudentFinanceCard({
  studentId,
  name,
  lessonPrice,
  lessonCurrency,
}: {
  studentId: string;
  name: string;
  lessonPrice: number | null;
  lessonCurrency: string | null;
}) {
  const { data: rates } = useRates();
  const defaultCurrency = useDefaultCurrency();
  const memory = useMemo(() => readPaymentMemory(studentId), [studentId]);
  const [currency, setCurrency] = useState<string | null>(
    memory?.currency ?? (lessonCurrency ? normalizeCurrency(lessonCurrency) : null),
  );
  const activeCurrency = currency ?? defaultCurrency;
  const [amount, setAmount] = useState(memory?.amount ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPaid, setIsPaid] = useState(true);

  const add = useMut(async () => {
    const num = Number(amount);
    if (!num || num <= 0) throw new Error("Введите сумму");
    const { error } = await (await sb()).from("finance").insert({
      student_id: studentId,
      amount: num,
      currency: activeCurrency,
      is_paid: isPaid,
      pay_date: date,
    });
    if (error) throw error;
    rememberPayment(studentId, amount, activeCurrency);
  }, ["finance"]);

  const n = Number(amount) || 0;
  const rateMap = rateMapOf(rates);
  const preview = n > 0 ? convert(n, activeCurrency, defaultCurrency, rateMap) : null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar initials={initials(name)} />
        <div className="min-w-0 flex-1">
          <div className="name-italic truncate text-[15px] font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">Новый платёж</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Select value={activeCurrency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </Select>
        <Input
          inputMode="decimal"
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="col-span-2"
        />
      </div>

      <AmountPresets
        lessonPrice={lessonPrice}
        currency={activeCurrency}
        value={amount}
        onPick={setAmount}
      />

      {preview && activeCurrency !== defaultCurrency && (
        <div className="mt-2 text-center text-[11px] text-muted-foreground">
          {preview.ok
            ? `≈ ${formatMoney(preview.value, defaultCurrency)}`
            : `Курс ${activeCurrency} → ${defaultCurrency} недоступен`}
        </div>
      )}

      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2" />

      <button
        onClick={() => setIsPaid((p) => !p)}
        className={`mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
          isPaid
            ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
            : "bg-destructive/15 text-destructive"
        }`}
      >
        {isPaid ? "✓ Оплачено" : "✗ Не оплачено"}
      </button>

      <Button
        variant="gold"
        className="mt-3 w-full"
        disabled={!amount || add.isPending}
        onClick={async () => {
          try {
            await add.mutateAsync(undefined as never);
            toast.success("Платёж добавлен");
            setAmount("");
          } catch (error: unknown) {
            toast.error(getErrorMessage(error));
          }
        }}
      >
        Добавить платёж
      </Button>
    </Card>
  );
}

function PaymentRow({ f, name }: { f: Finance; name: string }) {
  const del = useMut(async () => {
    const { error } = await (await sb())
      .from("finance")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", f.id);
    if (error) throw error;
  }, ["finance"]);
  const toggle = useMut(async () => {
    const { error } = await (await sb())
      .from("finance")
      .update({ is_paid: !f.is_paid })
      .eq("id", f.id);
    if (error) throw error;
  }, ["finance"]);

  return (
    <Card className="flex items-center gap-3 p-3">
      <Avatar initials={initials(name)} />
      <div className="min-w-0 flex-1">
        <div className="name-italic truncate text-[14px] font-semibold">{name}</div>
        <div className="text-xs text-muted-foreground">
          {f.entry_type === "lesson_cycle" ? `Пакет №${f.cycle_number}` : "Ручная запись"}
          {" · "}
          {f.pay_date ? new Date(f.pay_date).toLocaleDateString("ru-RU") : "—"}
        </div>
      </div>
      <div className="text-right">
        <div className="num text-base text-foreground">
          {formatMoney(Number(f.amount), normalizeCurrency(f.currency, f.currency))}
        </div>
        <button
          onClick={() => toggle.mutateAsync(undefined as never)}
          className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            f.is_paid
              ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          {f.is_paid ? "Оплачено" : "Долг"}
        </button>
      </div>
      <button
        onClick={async () => {
          await del.mutateAsync(undefined as never);
          toast.success("Удалено");
        }}
        className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Удалить"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Card>
  );
}

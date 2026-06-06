import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, Button, Input, Select, Avatar, Badge, Empty, SectionTitle } from "@/components/ui-bits";
import {
  useStudents,
  useFinance,
  useRates,
  useMut,
  initials,
  convertToRUB,
  convertToUSDT,
  convertToEGP,
} from "@/lib/db";
import { sb } from "@/lib/sb";
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

  const totalsRUB = useMemo(() => {
    if (!rates) return { rub: 0, usdt: 0, egp: 0 };
    let rub = 0;
    for (const f of finance) if (f.is_paid) rub += convertToRUB(Number(f.amount), f.currency, rates);
    return {
      rub: Math.round(rub),
      usdt: Math.round((rub / rates.usd_to_rub) * 100) / 100,
      egp: Math.round((rub / rates.usd_to_rub) * rates.usdt_to_egp),
    };
  }, [finance, rates]);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Финансы</h1>
      <p className="mt-1 text-sm text-muted-foreground">Курсы валют и платежи учеников</p>

      <RatesCard />

      <SectionTitle>Итого получено</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <SumCard label="₽" value={totalsRUB.rub.toLocaleString("ru-RU")} />
        <SumCard label="USDT" value={totalsRUB.usdt.toLocaleString("ru-RU")} />
        <SumCard label="£" value={totalsRUB.egp.toLocaleString("ru-RU")} />
      </div>

      <SectionTitle>Ученики</SectionTitle>
      {students.length === 0 ? (
        <Empty icon={<Wallet className="h-8 w-8" />} title="Нет учеников" hint="Сначала добавьте ученика" />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {students.map((s) => (
            <StudentFinanceCard key={s.id} studentId={s.id} name={s.name} />
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

function SumCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num mt-1 text-xl text-foreground">{value}</div>
    </Card>
  );
}

export function RatesCard() {
  const { data: rates } = useRates();
  const [usdRub, setUsdRub] = useState("");
  const [usdtEgp, setUsdtEgp] = useState("");
  const [usdEgp, setUsdEgp] = useState("");
  const [loading, setLoading] = useState(false);

  const save = useMut(async () => {
    if (!rates) return;
    const { error } = await (await sb())
      .from("rates")
      .update({
        usd_to_rub: Number(usdRub || rates.usd_to_rub),
        usdt_to_egp: Number(usdtEgp || rates.usdt_to_egp),
        usd_to_egp: Number(usdEgp || rates.usd_to_egp),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rates.id);
    if (error) throw error;
  }, ["rates"]);

  async function fetchLive() {
    setLoading(true);
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await res.json();
      const rub = j?.rates?.RUB;
      const egp = j?.rates?.EGP;
      if (!rub || !egp) throw new Error("Нет данных курса");
      setUsdRub(String(Math.round(rub * 100) / 100));
      setUsdEgp(String(Math.round(egp * 100) / 100));
      if (!usdtEgp) setUsdtEgp(String(Math.round(egp * 100) / 100));
      toast.success("Курс обновлён");
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось получить курс");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-foreground">Курсы валют</h3>
        <Button variant="outline" onClick={fetchLive} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RateInput label="1 USD = ₽" value={usdRub} onChange={setUsdRub} placeholder={String(rates?.usd_to_rub ?? "")} />
        <RateInput label="1 USDT = £" value={usdtEgp} onChange={setUsdtEgp} placeholder={String(rates?.usdt_to_egp ?? "")} />
        <RateInput label="1 USD = £" value={usdEgp} onChange={setUsdEgp} placeholder={String(rates?.usd_to_egp ?? "")} />
      </div>
      <Button
        variant="primary"
        className="mt-3 w-full"
        onClick={async () => {
          try { await save.mutateAsync(undefined as never); toast.success("Сохранено"); }
          catch (e: any) { toast.error(e?.message ?? "Ошибка"); }
        }}
      >
        Сохранить курсы
      </Button>
    </Card>
  );
}

function RateInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function StudentFinanceCard({ studentId, name }: { studentId: string; name: string }) {
  const { data: rates } = useRates();
  const [currency, setCurrency] = useState<"RUB" | "USD" | "EGP">("RUB");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPaid, setIsPaid] = useState(true);

  const add = useMut(async () => {
    const num = Number(amount);
    if (!num || num <= 0) throw new Error("Введите сумму");
    const { error } = await (await sb()).from("finance").insert({
      student_id: studentId,
      amount: num,
      currency,
      is_paid: isPaid,
      pay_date: date,
    });
    if (error) throw error;
  }, ["finance"]);

  const n = Number(amount) || 0;
  const conv = rates
    ? {
        rub: Math.round(convertToRUB(n, currency, rates)),
        usdt: Math.round(convertToUSDT(n, currency, rates) * 100) / 100,
        egp: Math.round(convertToEGP(n, currency, rates)),
      }
    : null;

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
        <Select value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
          <option value="RUB">₽ RUB</option>
          <option value="USD">$ USD</option>
          <option value="EGP">£ EGP</option>
        </Select>
        <Input
          inputMode="decimal"
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="col-span-2"
        />
      </div>

      {conv && n > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <span>≈ {conv.rub.toLocaleString("ru-RU")} ₽</span>
          <span>≈ {conv.usdt} USDT</span>
          <span>≈ {conv.egp.toLocaleString("ru-RU")} £</span>
        </div>
      )}

      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2" />

      <button
        onClick={() => setIsPaid((p) => !p)}
        className={`mt-2 w-full rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
          isPaid ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : "bg-destructive/15 text-destructive"
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
          } catch (e: any) {
            toast.error(e?.message ?? "Ошибка");
          }
        }}
      >
        Добавить платёж
      </Button>
    </Card>
  );
}

function PaymentRow({ f, name }: { f: any; name: string }) {
  const del = useMut(async () => {
    const { error } = await (await sb()).from("finance").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
    if (error) throw error;
  }, ["finance"]);
  const toggle = useMut(async () => {
    const { error } = await (await sb()).from("finance").update({ is_paid: !f.is_paid }).eq("id", f.id);
    if (error) throw error;
  }, ["finance"]);

  const sym = f.currency === "RUB" ? "₽" : f.currency === "USD" ? "$" : "£";

  return (
    <Card className="flex items-center gap-3 p-3">
      <Avatar initials={initials(name)} />
      <div className="min-w-0 flex-1">
        <div className="name-italic truncate text-[14px] font-semibold">{name}</div>
        <div className="text-xs text-muted-foreground">
          {f.pay_date ? new Date(f.pay_date).toLocaleDateString("ru-RU") : "—"}
        </div>
      </div>
      <div className="text-right">
        <div className="num text-base text-foreground">
          {Number(f.amount).toLocaleString("ru-RU")} {sym}
        </div>
        <button
          onClick={() => toggle.mutateAsync(undefined as never)}
          className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            f.is_paid ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : "bg-destructive/15 text-destructive"
          }`}
        >
          {f.is_paid ? "Оплачено" : "Долг"}
        </button>
      </div>
      <button
        onClick={async () => { await del.mutateAsync(undefined as never); toast.success("Удалено"); }}
        className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Удалить"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </Card>
  );
}

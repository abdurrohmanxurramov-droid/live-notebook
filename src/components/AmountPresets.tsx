import { formatMoney } from "@/lib/currency";
import { amountSuggestions, PACKAGE_SIZE } from "@/lib/package-price";

export function AmountPresets({
  lessonPrice,
  currency,
  value,
  onPick,
}: {
  lessonPrice: number | null | undefined;
  currency: string;
  value: string;
  onPick: (v: string) => void;
}) {
  const suggestions = amountSuggestions(lessonPrice);
  const hasPackage = lessonPrice != null && lessonPrice > 0;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {suggestions.map((amount, i) => {
        const active = Number(value) === amount;
        return (
          <button
            key={amount}
            type="button"
            onClick={() => onPick(String(amount))}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all active:scale-95 ${
              active
                ? "border-accent/60 bg-accent/15 text-foreground"
                : "border-white/60 bg-white/50 text-muted-foreground dark:border-white/10 dark:bg-white/5"
            }`}
            title={
              i === 0 && hasPackage ? `Пакет из ${PACKAGE_SIZE} уроков этого ученика` : undefined
            }
          >
            {formatMoney(amount, currency)}
          </button>
        );
      })}
    </div>
  );
}

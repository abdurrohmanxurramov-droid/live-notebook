import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, Button, Input, Select, ListSkeleton } from "@/components/ui-bits";
import { Switch } from "@/components/ui/switch";
import { getSettings, updateSettings } from "@/lib/settings.functions";

export function UserSettingsSection() {
  const getFn = useServerFn(getSettings);
  const updFn = useServerFn(updateSettings);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => getFn({}),
  });
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) return <ListSkeleton rows={2} />;

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      await updFn({ data: patch });
      await qc.invalidateQueries({ queryKey: ["user_settings"] });
      toast.success("Сохранено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <Row label="Валюта по умолчанию">
        <Select
          value={data.default_currency}
          disabled={busy}
          onChange={(e) => save({ default_currency: e.target.value })}
        >
          <option value="RUB">RUB ₽</option>
          <option value="USD">USD $</option>
          <option value="EGP">EGP £</option>
        </Select>
      </Row>
      <Row label="Длительность урока, мин">
        <Input
          type="number"
          min={15}
          max={240}
          step={5}
          defaultValue={data.default_lesson_duration}
          disabled={busy}
          onBlur={(e) => save({ default_lesson_duration: Number(e.target.value) })}
        />
      </Row>
      <Row label="Цена урока по умолчанию">
        <Input
          type="number"
          min={0}
          step={50}
          defaultValue={data.default_lesson_price}
          disabled={busy}
          onBlur={(e) => save({ default_lesson_price: Number(e.target.value) })}
        />
      </Row>
      <Row label="Напомнить за, мин">
        <Input
          type="number"
          min={5}
          max={1440}
          step={5}
          defaultValue={data.remind_before_min}
          disabled={busy}
          onBlur={(e) => save({ remind_before_min: Number(e.target.value) })}
        />
      </Row>
      <Row label="Начало недели">
        <Select
          value={String(data.week_starts_on)}
          disabled={busy}
          onChange={(e) => save({ week_starts_on: Number(e.target.value) })}
        >
          <option value="1">Понедельник</option>
          <option value="0">Воскресенье</option>
        </Select>
      </Row>

      <div className="pt-2">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Напоминания
        </div>
        <div className="space-y-2">
          <ToggleRow
            label="Об уроках"
            hint="Push за указанное время до начала"
            checked={data.remind_lessons ?? true}
            disabled={busy}
            onChange={(v) => save({ remind_lessons: v })}
          />
          <ToggleRow
            label="Об оплатах"
            hint="Напомнить о неоплаченных счетах"
            checked={data.remind_payments ?? true}
            disabled={busy}
            onChange={(v) => save({ remind_payments: v })}
          />
          <ToggleRow
            label="О домашках"
            hint="Напомнить о сроке сдачи"
            checked={data.remind_homework ?? true}
            disabled={busy}
            onChange={(v) => save({ remind_homework: v })}
          />
        </div>
      </div>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/40 dark:bg-white/5 dark:border-white/10 px-3 py-2 backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

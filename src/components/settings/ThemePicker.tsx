import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui-bits";
import { getSettings, updateSettings } from "@/lib/settings.functions";

type Theme = "classic" | "bloom";
type Gender = "male" | "female";

export function ThemePicker() {
  const fetchSettings = useServerFn(getSettings);
  const save = useServerFn(updateSettings);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["user_settings"],
    queryFn: () => fetchSettings(),
    staleTime: 60_000,
  });

  const gender = (data as { gender?: Gender | null } | undefined)?.gender ?? null;

  async function setGender(g: Gender) {
    if (busy) return;
    setBusy(true);
    const nextTheme: Theme = g === "female" ? "bloom" : "classic";
    try {
      await save({ data: { gender: g, theme: nextTheme } });
      document.documentElement.setAttribute("data-theme", nextTheme);
      await qc.invalidateQueries({ queryKey: ["user_settings"] });
      toast.success(
        g === "female" ? "Оформление Bloom 🌸" : "Оформление Classic",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-6 mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Пол
      </div>
      <Card className="p-4">
        <div className="mb-3 text-sm text-muted-foreground">
          Оформление подбирается по полу: «Женский» — Bloom, «Мужской» — Classic.
        </div>
        <div className="flex gap-2">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              disabled={busy}
              onClick={() => setGender(g)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm transition no-anim ${
                gender === g
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {g === "male" ? "Мужской" : "Женский"}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

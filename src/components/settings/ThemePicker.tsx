import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui-bits";
import { getSettings, updateSettings } from "@/lib/settings.functions";
import { Sparkles, Flower2 } from "lucide-react";

type Theme = "classic" | "bloom";

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

  const current: Theme = (data as { theme?: Theme } | undefined)?.theme ?? "classic";
  const gender = (data as { gender?: "male" | "female" | null } | undefined)?.gender ?? null;

  async function setTheme(next: Theme) {
    if (next === current || busy) return;
    setBusy(true);
    try {
      await save({ data: { theme: next } });
      document.documentElement.setAttribute("data-theme", next);
      await qc.invalidateQueries({ queryKey: ["user_settings"] });
      toast.success(next === "bloom" ? "Тема Bloom включена 🌸" : "Классика возвращена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function setGender(g: "male" | "female") {
    setBusy(true);
    try {
      await save({ data: { gender: g } });
      await qc.invalidateQueries({ queryKey: ["user_settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-6 mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Оформление
      </div>
      <Card className="p-4">
        <div className="mb-3 text-sm text-muted-foreground">
          Выберите визуальную тему. Влияет только на внешний вид.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setTheme("classic")}
            className={`relative overflow-hidden rounded-2xl border p-3 text-left transition no-anim ${
              current === "classic" ? "border-accent ring-2 ring-accent/40" : "border-border"
            }`}
            style={{ background: "linear-gradient(160deg, #1B263B 0%, #14213D 100%)" }}
          >
            <Sparkles className="h-4 w-4" style={{ color: "#C6A969" }} />
            <div className="mt-2 text-sm font-semibold text-[#F8F4EC]">Classic</div>
            <div className="text-[11px] text-[#C9C3B5]">Тёмно-синий, золото</div>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => setTheme("bloom")}
            className={`relative overflow-hidden rounded-2xl border p-3 text-left transition no-anim ${
              current === "bloom" ? "border-accent ring-2 ring-accent/40" : "border-border"
            }`}
            style={{
              background: "linear-gradient(160deg, #FFF4F7 0%, #FFE0EA 60%, #FFC8DA 100%)",
            }}
          >
            <Flower2 className="h-4 w-4" style={{ color: "#C2548A" }} />
            <div
              className="mt-2 text-sm font-semibold"
              style={{ color: "#6A2A4A", fontFamily: "Caveat, cursive" }}
            >
              Bloom
            </div>
            <div className="text-[11px]" style={{ color: "#8A6B7A" }}>
              Цветочный, пастельный
            </div>
          </button>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Пол</div>
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
        </div>
      </Card>
    </>
  );
}

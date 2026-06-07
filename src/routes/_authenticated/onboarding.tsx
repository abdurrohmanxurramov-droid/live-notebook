import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/lib/settings.functions";
import { BloomBackdrop } from "@/components/BloomBackdrop";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

type Choice = "male" | "female";

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(updateSettings);
  const [busy, setBusy] = useState<Choice | null>(null);
  const [hover, setHover] = useState<Choice | null>(null);

  async function pick(gender: Choice) {
    setBusy(gender);
    try {
      const theme = gender === "female" ? "bloom" : "classic";
      await save({ data: { gender, theme, onboarding_completed: true } });
      // Apply theme immediately so the transition feels instant.
      document.documentElement.setAttribute("data-theme", theme);
      await qc.invalidateQueries({ queryKey: ["user_settings"] });
      toast.success(theme === "bloom" ? "Добро пожаловать 🌸" : "Добро пожаловать");
      navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-[100svh] px-4 pb-16 pt-10">
      {hover === "female" && <BloomBackdrop />}
      <div className="relative z-10 mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Подберём оформление под вас
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Это влияет только на внешний вид. Можно сменить в настройках в любой момент.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy !== null}
            onMouseEnter={() => setHover("male")}
            onMouseLeave={() => setHover(null)}
            onClick={() => pick("male")}
            className="glass group relative overflow-hidden rounded-3xl p-6 text-left no-anim"
            style={{ background: "linear-gradient(160deg, #1B263B 0%, #14213D 100%)" }}
          >
            <div className="text-5xl">♂</div>
            <div className="mt-3 text-lg font-semibold text-[#F8F4EC]">Мужской</div>
            <div className="mt-1 text-xs text-[#C9C3B5]">
              Классика — тёмно-синий, золото, жидкое стекло
            </div>
            <div className="mt-5 flex gap-1.5">
              <span className="h-6 w-6 rounded-full" style={{ background: "#14213D" }} />
              <span className="h-6 w-6 rounded-full" style={{ background: "#B38B59" }} />
              <span className="h-6 w-6 rounded-full" style={{ background: "#EEE8DC" }} />
            </div>
            {busy === "male" && <div className="mt-4 text-xs text-[#C9C3B5]">Применяем…</div>}
          </button>

          <button
            type="button"
            disabled={busy !== null}
            onMouseEnter={() => setHover("female")}
            onMouseLeave={() => setHover(null)}
            onClick={() => pick("female")}
            className="glass group relative overflow-hidden rounded-3xl p-6 text-left no-anim"
            style={{
              background: "linear-gradient(160deg, #FFF4F7 0%, #FFE0EA 60%, #FFC8DA 100%)",
            }}
          >
            <div className="text-5xl" style={{ color: "#C2548A" }}>
              ❀
            </div>
            <div
              className="mt-3 text-2xl font-semibold"
              style={{ fontFamily: "Caveat, cursive", color: "#6A2A4A" }}
            >
              Женский · Bloom
            </div>
            <div className="mt-1 text-xs" style={{ color: "#8A6B7A" }}>
              Цветочный, пастельный, рукописные заголовки, лепестки
            </div>
            <div className="mt-5 flex gap-1.5">
              <span className="h-6 w-6 rounded-full" style={{ background: "#FFC8DA" }} />
              <span className="h-6 w-6 rounded-full" style={{ background: "#E58FB4" }} />
              <span className="h-6 w-6 rounded-full" style={{ background: "#C2548A" }} />
            </div>
            {busy === "female" && (
              <div className="mt-4 text-xs" style={{ color: "#8A6B7A" }}>
                Применяем…
              </div>
            )}
          </button>
        </div>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => pick("male")}
          className="mt-6 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Пропустить — оставить классику
        </button>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Button, SectionTitle } from "@/components/ui-bits";
import { RatesCard } from "./finance";
import { Moon, Sun, Info, Heart, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { pushSupported, isSubscribed, subscribePush, unsubscribePush, getRegistration } from "@/lib/push";
import { sendTestPush } from "@/lib/push.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const [dark, setDark] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const testFn = useServerFn(sendTestPush);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDark(isDark);
    const s = pushSupported();
    setSupported(s);
    if (s) isSubscribed().then(setSubscribed).catch(() => {});
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  async function togglePush() {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribePush();
        setSubscribed(false);
        toast.success("Уведомления отключены");
      } else {
        await subscribePush();
        setSubscribed(true);
        toast.success("Уведомления включены — за 10 минут до урока");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось");
    } finally {
      setBusy(false);
    }
  }

  async function testPush() {
    setBusy(true);
    try {
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error("Сначала включите уведомления");
      await testFn({ data: { endpoint: sub.endpoint } });
      toast.success("Отправлено");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Настройки</h1>
      <p className="mt-1 text-sm text-muted-foreground">Тема, уведомления, курсы</p>

      <SectionTitle>Внешний вид</SectionTitle>
      <Card>
        <button
          type="button"
          onClick={toggle}
          aria-label="Переключить тему"
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold text-foreground">Тёмная тема</span>
              <span className="text-xs text-muted-foreground">Сменить оформление</span>
            </span>
          </span>
          <span
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${dark ? "bg-accent" : "bg-secondary"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                dark ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </Card>

      <SectionTitle>Уведомления</SectionTitle>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${subscribed ? "bg-emerald-500/15 text-emerald-500" : "bg-accent/15 text-accent"}`}>
              {subscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>
            <div>
              <div className="text-[15px] font-semibold text-foreground">Push за 10 минут до урока</div>
              <div className="text-xs text-muted-foreground">
                {!supported
                  ? "Браузер не поддерживает (на iOS установите PWA на главный экран)"
                  : subscribed
                  ? "Включено на этом устройстве"
                  : "Получать напоминания по расписанию"}
              </div>
            </div>
          </div>
          <button
            onClick={togglePush}
            disabled={!supported || busy}
            className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${subscribed ? "bg-accent" : "bg-secondary"}`}
            aria-label="Push"
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                subscribed ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {subscribed && (
          <Button onClick={testPush} disabled={busy} variant="outline" className="mt-3 w-full">
            Отправить тестовое уведомление
          </Button>
        )}
      </Card>

      <SectionTitle>Курсы валют</SectionTitle>
      <RatesCard />

      <SectionTitle>О приложении</SectionTitle>
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Info className="h-6 w-6" />
          </div>
          <div>
            <div className="text-base font-bold text-foreground">Живой Блокнот</div>
            <div className="text-xs text-muted-foreground">v1.0 · CRM для преподавателей</div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Премиум-блокнот для учёта учеников, посещаемости и оплат. Работает на телефоне,
          планшете и компьютере. Все данные сохраняются в облаке.
        </p>
        <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
          Сделано с <Heart className="h-3 w-3 text-destructive" /> в Lovable
        </div>
      </Card>
    </div>
  );
}

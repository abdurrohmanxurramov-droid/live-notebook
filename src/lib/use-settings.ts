import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSettings } from "@/lib/settings.functions";
import { withSnapshot } from "@/lib/offline";
import { normalizeCurrency } from "@/lib/currency";

/** Настройки пользователя (кэш + offline snapshot). */
export function useUserSettings() {
  const getSettingsFn = useServerFn(getSettings);
  return useQuery({
    queryKey: ["user_settings"],
    queryFn: () => withSnapshot("user_settings", "user_settings", () => getSettingsFn({})),
  });
}

/** Валюта по умолчанию из настроек, с безопасным фолбэком. */
export function useDefaultCurrency(): string {
  const { data } = useUserSettings();
  return normalizeCurrency(data?.default_currency, "RUB");
}

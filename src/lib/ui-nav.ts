/**
 * Правило показа нижней навигации.
 *
 * Навигация — клиентское дерево: на сервере её не рендерим вовсе, иначе
 * первый клиентский рендер отличается от серверного (hydration mismatch,
 * React error #418). Кроме того, меню не должно появляться раньше контента:
 * на странице входа, на экранах ошибок и пока маршрут ещё загружается.
 */
export function shouldShowBottomNav(input: {
  pathname: string;
  hydrated: boolean;
  booting: boolean;
  hasFailedMatch: boolean;
  statusCode: number;
}): boolean {
  const { pathname, hydrated, booting, hasFailedMatch, statusCode } = input;
  if (!hydrated) return false;
  if (booting) return false;
  if (hasFailedMatch || statusCode >= 400) return false;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return false;
  return true;
}

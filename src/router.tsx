import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installStaleBuildRecovery } from "./lib/recover";

// Ставим перехват ошибок загрузки чанков как можно раньше — до монтирования React,
// иначе ранняя ошибка бандла приводит к белому экрану без восстановления.
installStaleBuildRecovery();

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Данные меняются редко: избегаем шторма повторных запросов
        // при каждом фокусе/возврате на вкладку и при переходах между страницами.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

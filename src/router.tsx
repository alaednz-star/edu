import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isRetriableError } from "./lib/errors";

/** Retry transient failures only; a 403 or a validation error will never succeed. */
const MAX_QUERY_RETRIES = 3;

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reference data (levels, subjects) changes rarely; without this every
        // mount and every window focus refetched it.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => failureCount < MAX_QUERY_RETRIES && isRetriableError(error),
        // Exponential backoff, capped so a slow network never stalls the UI.
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Writes are not idempotent across the board, so retry only failures
        // that cannot have been applied (connection lost, deadlock).
        retry: (failureCount, error) => failureCount < 1 && isRetriableError(error),
        retryDelay: 1000,
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

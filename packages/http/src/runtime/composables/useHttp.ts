import { createUseFetch, type useFetch, useRuntimeConfig } from '#imports'

export const useHttp: typeof useFetch = createUseFetch(callerOptions => ({
  baseURL: callerOptions.baseURL ?? (useRuntimeConfig().public.laravelizeHttp.baseURL || undefined),
}))

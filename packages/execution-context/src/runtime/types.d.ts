declare module 'nuxt/schema' {
  interface RuntimeConfig { laravelizeExecutionContext: { correlationHeader: string, trustIncomingCorrelationHeader: boolean } }
}
export {}

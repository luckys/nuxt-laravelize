declare module '#laravelize/i18n-plural' {
  export function plural(key: string, count: number, params: Readonly<Record<string, string | number | boolean>>, locale: string, getter: (key: string, params?: Readonly<Record<string, string | number | boolean>>, defaultValue?: string) => unknown): string | null
}
declare module '#i18n-internal/strategy' { export function getI18nConfig(): unknown }
declare module '#i18n-internal/payload-source' { export function readPayload(path: string): Promise<Record<string, unknown>> }
declare module '#laravelize/i18n-locale-detector' { export function detectCurrentLocale(event: import('h3').H3Event, config: Record<string, unknown>, defaultLocale?: string): string }
declare module '#laravelize/i18n-source' {
  export const locales: readonly import('./ServerLocalization').ServerLocaleDefinition[]
  export function loadDictionary(code: string): Promise<Record<string, unknown>>
}

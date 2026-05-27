export type TranslationParams = Readonly<Record<string, string | number>>

export interface Translator {
  locale(): string
  setLocale(locale: string): void
  __(key: string, params?: TranslationParams): string
  choice(key: string, count: number, params?: TranslationParams): string
}

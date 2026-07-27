import type { H3Event } from 'h3'
import { createServerLocalizationFromSource, type ServerLocalization, type ServerLocalizationSource, type ServerPlural } from './ServerLocalization'

interface RuntimeI18nConfig {
  defaultLocale?: string
  fallbackLocale?: string | readonly string[]
  localeCookie?: string | false | null | Record<string, unknown>
  autoDetectLanguage?: boolean
}

function fallbackLocales(value: RuntimeI18nConfig): readonly string[] {
  const fallback = value.fallbackLocale
  return [...new Set([...(Array.isArray(fallback) ? fallback : fallback ? [fallback] : []), value.defaultLocale ?? 'en'])]
}

function detectionLocales(source: ServerLocalizationSource): Array<{ code: string }> {
  const codes = source.locales.flatMap(locale => [locale.code, locale.locale, ...(locale.aliases ?? [])])
  return [...new Set(codes)].map(code => ({ code }))
}

async function nitro(): Promise<{ config: RuntimeI18nConfig, source: ServerLocalizationSource, detectCurrentLocale: (event: H3Event, config: Record<string, unknown>, defaultLocale?: string) => string }> {
  const [strategy, pluralModule, detector, generated] = await Promise.all([
    import('#i18n-internal/strategy'),
    import('#laravelize/i18n-plural'),
    import('#laravelize/i18n-locale-detector'),
    import('#laravelize/i18n-source'),
  ])
  const config = strategy.getI18nConfig() as RuntimeI18nConfig
  return {
    config,
    detectCurrentLocale: detector.detectCurrentLocale,
    source: { locales: generated.locales, defaultLocale: config.defaultLocale ?? 'en', fallbackLocales: fallbackLocales(config), plural: pluralModule.plural as ServerPlural, loadDictionary: generated.loadDictionary },
  }
}

export async function createServerLocalization(explicitLocale: string, source?: ServerLocalizationSource): Promise<ServerLocalization> {
  if (source) return createServerLocalizationFromSource(source, explicitLocale)
  const generated = await nitro()
  return createServerLocalizationFromSource(generated.source, explicitLocale)
}

export async function useServerLocalization(event: H3Event, explicitLocale?: string): Promise<ServerLocalization> {
  const generated = await nitro()
  if (explicitLocale !== undefined) return createServerLocalizationFromSource(generated.source, explicitLocale)
  const detected = generated.detectCurrentLocale(event, {
    fallbackLocale: Array.isArray(generated.config.fallbackLocale) ? generated.config.fallbackLocale[0] : generated.config.fallbackLocale,
    defaultLocale: generated.config.defaultLocale,
    locales: detectionLocales(generated.source),
    localeCookie: generated.config.localeCookie,
    autoDetectLanguage: generated.config.autoDetectLanguage,
  }, generated.config.defaultLocale)
  return createServerLocalizationFromSource(generated.source, detected)
}

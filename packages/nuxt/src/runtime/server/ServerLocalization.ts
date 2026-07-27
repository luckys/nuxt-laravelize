import { interpolate, resolveTranslation } from '@i18n-micro/core'

export type TranslationParams = Readonly<Record<string, string | number | boolean>>
export type ServerPlural = (key: string, count: number, params: TranslationParams, locale: string, getter: (key: string, params?: TranslationParams, defaultValue?: string) => unknown) => string | null
export type TranslationDictionary = Readonly<Record<string, unknown>>
export interface ServerLocaleDefinition {
  readonly code: string
  readonly locale: string
  readonly aliases?: readonly string[]
  readonly fallbackLocales?: readonly string[]
}
export interface ServerLocalizationSource {
  readonly locales: readonly ServerLocaleDefinition[]
  readonly defaultLocale: string
  readonly fallbackLocales?: readonly string[]
  readonly plural: ServerPlural
  loadDictionary(code: string): Promise<TranslationDictionary>
}

export interface ServerLocalizationOptions {
  readonly locale: string
  readonly localeCode: string
  readonly formatLocale?: string
  readonly defaultLocale: string
  readonly fallbackLocales: readonly string[]
  readonly availableLocales: readonly string[]
  readonly dictionaries: Readonly<Record<string, TranslationDictionary>>
  readonly plural: ServerPlural
}

export class ServerLocalization {
  readonly locale: string
  readonly localeCode: string
  readonly defaultLocale: string
  readonly fallbackLocales: readonly string[]
  readonly availableLocales: readonly string[]
  readonly #formatLocale: string
  readonly #dictionaries: Readonly<Record<string, TranslationDictionary>>
  readonly #plural: ServerPlural

  constructor(options: ServerLocalizationOptions) {
    this.locale = options.locale
    this.localeCode = options.localeCode
    this.defaultLocale = options.defaultLocale
    this.fallbackLocales = Object.freeze([...options.fallbackLocales])
    this.availableLocales = Object.freeze([...options.availableLocales])
    this.#formatLocale = options.formatLocale ?? options.locale
    this.#dictionaries = options.dictionaries
    this.#plural = options.plural
  }

  get fallbackLocale(): string { return this.fallbackLocales[0] ?? this.defaultLocale }

  t(key: string, params?: TranslationParams, defaultValue?: string): string {
    const value = this.#resolve(key)
    if (value !== null && value !== undefined) return typeof value === 'string' ? (params ? interpolate(value, params) : value) : String(value)
    return defaultValue === undefined ? key : defaultValue
  }

  tc(key: string, count: number, params: TranslationParams = {}, defaultValue?: string): string {
    if (!Number.isFinite(count)) return defaultValue === undefined ? key : defaultValue
    if (this.#resolve(key) === null) return defaultValue === undefined ? key : defaultValue
    const normalizedCount = Number.parseInt(count.toString(), 10)
    const translated = this.#plural(key, normalizedCount, params, this.localeCode, (candidate, candidateParams, candidateDefault) => this.t(candidate, candidateParams, candidateDefault))
    return translated === null ? (defaultValue === undefined ? key : defaultValue) : (params ? interpolate(translated, params) : translated)
  }

  tn(number: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.#formatLocale, options).format(number)
  }

  td(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? 'Invalid Date' : new Intl.DateTimeFormat(this.#formatLocale, options).format(date)
  }

  tdr(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string {
    return new Intl.RelativeTimeFormat(this.#formatLocale, options).format(value, unit)
  }

  #lookupLocales(): readonly string[] {
    return [...new Set([this.locale, ...this.fallbackLocales, this.defaultLocale])]
  }

  #resolve(key: string): unknown | null {
    for (const locale of this.#lookupLocales()) {
      const value = resolveTranslation(this.#dictionaries[locale] ?? {}, key)
      if (value !== null && value !== undefined) return value
    }
    return null
  }
}

function canonical(value: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(value)[0]
  }
  catch {
    return undefined
  }
}

function validateDefinition(definition: ServerLocaleDefinition): void {
  if (!/^[a-z0-9][\w-]{0,34}$/i.test(definition.code)) throw new TypeError('Invalid server localization dictionary code')
  if (canonical(definition.locale) !== definition.locale) throw new TypeError('Invalid canonical server localization locale')
}

function resolveDefinition(input: string, source: ServerLocalizationSource): ServerLocaleDefinition | undefined {
  const normalized = canonical(input)
  return source.locales.find((definition) => {
    if (input === definition.code) return true
    return normalized !== undefined && [definition.locale, ...(definition.aliases ?? [])].some(alias => canonical(alias) === normalized)
  })
}

function validateFallbackReferences(source: ServerLocalizationSource): void {
  const references = [source.defaultLocale, ...(source.fallbackLocales ?? []), ...source.locales.flatMap(definition => definition.fallbackLocales ?? [])]
  if (references.some(reference => !resolveDefinition(reference, source))) throw new TypeError('Unsupported fallback server localization locale')
}

function appendFallbackChain(reference: string, source: ServerLocalizationSource, visited: Set<string>, definitions: ServerLocaleDefinition[]): void {
  const definition = resolveDefinition(reference, source)
  if (!definition) throw new TypeError('Unsupported fallback server localization locale')
  if (visited.has(definition.locale)) return
  visited.add(definition.locale)
  definitions.push(definition)
  for (const fallback of definition.fallbackLocales ?? []) appendFallbackChain(fallback, source, visited, definitions)
}

export async function createServerLocalizationFromSource(source: ServerLocalizationSource, explicitLocale: string): Promise<ServerLocalization> {
  if (!source.locales.length) throw new TypeError('Server localization source has no locales')
  source.locales.forEach(validateDefinition)
  validateFallbackReferences(source)
  const selected = resolveDefinition(explicitLocale, source)
  if (!selected) throw new TypeError('Unsupported server localization locale')
  const defaultDefinition = resolveDefinition(source.defaultLocale, source)
  if (!defaultDefinition) throw new TypeError('Unsupported default server localization locale')
  const fallbackDefinitions: ServerLocaleDefinition[] = []
  const visited = new Set([selected.locale])
  for (const fallback of selected.fallbackLocales ?? []) appendFallbackChain(fallback, source, visited, fallbackDefinitions)
  for (const fallback of source.fallbackLocales ?? []) appendFallbackChain(fallback, source, visited, fallbackDefinitions)
  appendFallbackChain(source.defaultLocale, source, visited, fallbackDefinitions)
  const dictionaries: Record<string, TranslationDictionary> = {}
  for (const definition of [selected, ...fallbackDefinitions]) dictionaries[definition.locale] ??= await source.loadDictionary(definition.code)
  return new ServerLocalization({
    locale: selected.locale,
    localeCode: selected.code,
    formatLocale: selected.locale,
    defaultLocale: defaultDefinition.locale,
    fallbackLocales: fallbackDefinitions.map(definition => definition.locale),
    availableLocales: source.locales.map(definition => definition.locale),
    dictionaries,
    plural: source.plural,
  })
}

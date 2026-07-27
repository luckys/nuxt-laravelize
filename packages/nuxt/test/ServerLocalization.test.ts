import { describe, expect, it } from 'vitest'
import { createServerLocalizationFromSource, ServerLocalization, type ServerPlural } from '../src/runtime/server/ServerLocalization'

const plural: ServerPlural = (key, count, params, _locale, getter) => {
  const value = getter(key, params)
  if (typeof value !== 'string') return null
  const choices = value.split('|')
  return (choices[count === 1 ? 0 : 1] ?? choices.at(-1) ?? '').trim().replace('{count}', String(count))
}

function localization(locale = 'es') {
  return new ServerLocalization({
    locale,
    localeCode: locale,
    defaultLocale: 'en',
    fallbackLocales: ['en'],
    availableLocales: ['en', 'es'],
    formatLocale: locale === 'es' ? 'es-ES' : 'en-US',
    plural,
    dictionaries: {
      es: { greeting: { named: 'Hola, {name}' }, apples: 'Una {fruit} | {count} {fruit}', empty: '' },
      en: { fallback: { only: 'Fallback value' }, apples: 'One apple | {count} apples' },
    },
  })
}

describe('ServerLocalization', () => {
  it('translates nested keys, interpolation, fallbacks, missing keys and empty defaults', () => {
    const value = localization()
    expect(value.t('greeting.named', { name: 'Ada' })).toBe('Hola, Ada')
    expect(value.t('fallback.only')).toBe('Fallback value')
    expect(value.t('missing')).toBe('missing')
    expect(value.t('missing', undefined, '')).toBe('')
    expect(value.t('empty')).toBe('')
  })

  it('uses the generated plural function and interpolation parameters', () => {
    const value = localization()
    expect(value.tc('apples', 1, { fruit: 'manzana' })).toBe('Una manzana')
    expect(value.tc('apples', 3, { fruit: 'manzanas' })).toBe('3 manzanas')
    expect(value.tc('missing', 2, {}, '')).toBe('')
  })

  it('formats numbers, dates and relative time with the locale ISO code', () => {
    const value = localization()
    expect(value.tn(1234.5, { useGrouping: false, minimumFractionDigits: 2 })).toBe('1234,50')
    expect(value.td('2026-01-02T03:04:05.000Z', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })).toBe('02/01/2026')
    expect(value.tdr(-2, 'day', { numeric: 'always' })).toBe('hace 2 días')
  })

  it('loads an exact legacy dictionary code while exposing its canonical locale', async () => {
    const loadedCodes: string[] = []
    const value = await createServerLocalizationFromSource({
      locales: [
        { code: 'en_US', locale: 'en-US', aliases: ['en'] },
        { code: 'es', locale: 'es-ES', aliases: ['es-ES'] },
      ],
      defaultLocale: 'en_US',
      fallbackLocales: ['en'],
      plural,
      async loadDictionary(code) {
        loadedCodes.push(code)
        return code === 'en_US' ? { greeting: 'Hello' } : { greeting: 'Hola' }
      },
    }, 'en-US')

    expect(value.locale).toBe('en-US')
    expect(value.defaultLocale).toBe('en-US')
    expect(value.availableLocales).toEqual(['en-US', 'es-ES'])
    expect(value.t('greeting')).toBe('Hello')
    expect(loadedCodes).toEqual(['en_US'])
  })

  it('passes the exact configured dictionary code to custom plural rules', async () => {
    let pluralLocale: string | undefined
    const value = await createServerLocalizationFromSource({
      locales: [{ code: 'en_US', locale: 'en-US' }],
      defaultLocale: 'en_US',
      plural(key, count, params, locale, getter) {
        pluralLocale = locale
        const choices = String(getter(key, params)).split('|')
        return (choices[count === 1 ? 0 : 1] ?? '').trim().replace('{count}', String(count))
      },
      async loadDictionary() {
        return { items: 'One item | {count} custom items' }
      },
    }, 'en-US')

    expect(value.tc('items', 2)).toBe('2 custom items')
    expect(pluralLocale).toBe('en_US')
  })

  it('rejects an unconfigured locale before loading a dictionary', async () => {
    let loaded = false
    const promise = createServerLocalizationFromSource({
      locales: [{ code: 'en_US', locale: 'en-US' }],
      defaultLocale: 'en_US',
      plural,
      async loadDictionary() {
        loaded = true
        return {}
      },
    }, '../../secrets')

    await expect(promise).rejects.toThrow('Unsupported server localization locale')
    expect(loaded).toBe(false)
  })

  it('uses locale-specific fallback chains before global fallback without cycling or duplicate loads', async () => {
    const loadedCodes: string[] = []
    const dictionaries = {
      es: {},
      fr: { regional: 'Français' },
      en: { regional: 'English' },
    }
    const value = await createServerLocalizationFromSource({
      locales: [
        { code: 'es', locale: 'es-ES', fallbackLocales: ['fr'] },
        { code: 'fr', locale: 'fr-FR', fallbackLocales: ['es'] },
        { code: 'en', locale: 'en-US' },
      ],
      defaultLocale: 'en',
      fallbackLocales: ['en'],
      plural,
      async loadDictionary(code) {
        loadedCodes.push(code)
        return dictionaries[code as keyof typeof dictionaries]
      },
    }, 'es')

    expect(value.fallbackLocales).toEqual(['fr-FR', 'en-US'])
    expect(value.t('regional')).toBe('Français')
    expect(loadedCodes).toEqual(['es', 'fr', 'en'])
  })

  it('rejects an unconfigured locale-specific fallback before loading dictionaries', async () => {
    let loaded = false
    const promise = createServerLocalizationFromSource({
      locales: [{ code: 'es', locale: 'es-ES', fallbackLocales: ['../../fr'] }],
      defaultLocale: 'es',
      plural,
      async loadDictionary() {
        loaded = true
        return {}
      },
    }, 'es')

    await expect(promise).rejects.toThrow('Unsupported fallback server localization locale')
    expect(loaded).toBe(false)
  })
})

import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import Authorization from '@nuxt-laravelize/authorization'
import ReliabilityQueue from '@nuxt-laravelize/reliability-queue'
import { addServerImports, addServerPlugin, addTemplate, createResolver, defineNuxtModule, installModule } from '@nuxt/kit'
import type { ModuleOptions as I18nModuleOptions } from 'nuxt-i18n-micro'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    i18n?: Partial<I18nModuleOptions> | false
  }

  interface NuxtOptions {
    i18n: I18nModuleOptions | false
  }
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    i18n?: Partial<I18nModuleOptions> | false
  }

  interface NuxtOptions {
    i18n: I18nModuleOptions | false
  }
}

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/nuxt', configKey: 'laravelize', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: {
    '@nuxt-laravelize/audit': {},
    '@nuxt-laravelize/broadcasting': {},
    '@nuxt-laravelize/cache': {},
    '@nuxt-laravelize/core': {},
    '@nuxt-laravelize/execution-context': {},
    '@nuxt-laravelize/execution-context-queue': {},
    '@nuxt-laravelize/database': {},
    '@nuxt-laravelize/events': {},
    '@nuxt-laravelize/encryption': {},
    '@nuxt-laravelize/queue': {},
    '@nuxt-laravelize/rate-limiter': {},
    '@nuxt-laravelize/routes': {},
    '@nuxt-laravelize/events-queue': {},
    '@nuxt-laravelize/filesystem': {},
    '@nuxt-laravelize/mail': {},
    '@nuxt-laravelize/http': {},
    '@nuxt-laravelize/hashing': {},
    '@nuxt-laravelize/notifications': {},
    '@nuxt-laravelize/observability': {},
    '@nuxt-laravelize/pennant': {},
    '@nuxt-laravelize/scout': {},
    '@nuxt-laravelize/validation': {},
  },
  async setup(_options, nuxt) {
    await installModule(Authorization, {}, nuxt)
    await installModule(ReliabilityQueue, {}, nuxt)
    const initialI18nOptions = nuxt.options.i18n
    const hasUsableLocales = initialI18nOptions !== false && (initialI18nOptions?.locales ?? []).some(locale => typeof locale === 'string' || locale.disabled !== true)
    if (hasUsableLocales) await installModule('nuxt-i18n-micro', {}, nuxt)
    const h3Entry = createRequire(import.meta.url).resolve('h3')
    const packageRoot = dirname(dirname(createRequire(import.meta.url).resolve('nuxt-i18n-micro')))
    const localizationResolver = createResolver(import.meta.url)
    let localizationLoader: ReturnType<typeof addTemplate> | undefined
    let localizationEnabled = false
    ;(nuxt.hooks as { hook(name: 'nitro:config', callback: (config: { alias?: Record<string, string>, externals?: { inline?: Array<string | RegExp> } }) => void): void }).hook('nitro:config', (nitroConfig) => {
      nitroConfig.alias ??= {}
      nitroConfig.alias.h3 ??= h3Entry
      if (localizationEnabled) {
        // The packed preset is otherwise externalized, leaving Nitro virtual imports unresolved during prerender.
        nitroConfig.externals ??= {}
        nitroConfig.externals.inline ??= []
        if (!nitroConfig.externals.inline.includes('@nuxt-laravelize/nuxt')) nitroConfig.externals.inline.push('@nuxt-laravelize/nuxt')
        nitroConfig.alias['#laravelize/i18n-plural'] = resolve(nuxt.options.buildDir, 'i18n.plural.mjs')
        nitroConfig.alias['#laravelize/i18n-locale-detector'] = resolve(packageRoot, 'dist/runtime/server/utils/locale-detector.js')
        nitroConfig.alias['#laravelize/i18n-source'] = localizationLoader!.dst
      }
    })
    if (hasUsableLocales) {
      nuxt.hook('modules:done', () => {
        if (nuxt.options.i18n === false) return
        const configuredLocales = (nuxt.options.i18n?.locales ?? []).filter(locale => typeof locale === 'string' || locale.disabled !== true).map((locale) => {
          const value = typeof locale === 'string' ? { code: locale } : locale
          if (!/^[a-z0-9][\w-]{0,34}$/i.test(value.code)) throw new TypeError('Invalid configured i18n locale code')
          const configuredAliases = [value.iso, 'language' in value ? value.language : undefined].filter((alias): alias is string => typeof alias === 'string')
          const canonicalAliases = configuredAliases.flatMap((alias) => {
            try {
              return Intl.getCanonicalLocales(alias)
            }
            catch {
              return []
            }
          })
          const formatCandidate = [...canonicalAliases, value.code].find((candidate) => {
            try {
              return Intl.getCanonicalLocales(candidate).length === 1
            }
            catch {
              return false
            }
          })
          if (!formatCandidate) throw new TypeError(`Configured i18n locale "${value.code}" requires a valid BCP-47 code, iso, or language`)
          const configuredFallback = 'fallbackLocale' in value ? value.fallbackLocale : undefined
          const fallbackLocales = (Array.isArray(configuredFallback) ? configuredFallback : [configuredFallback]).filter((fallback): fallback is string => typeof fallback === 'string' && fallback.length > 0)
          return { code: value.code, locale: Intl.getCanonicalLocales(formatCandidate)[0]!, aliases: canonicalAliases, fallbackLocales }
        })
        if (!configuredLocales.length) return
        const resolvesConfiguredLocale = (reference: string): boolean => {
          let normalized: string | undefined
          try {
            normalized = Intl.getCanonicalLocales(reference)[0]
          }
          catch {
            normalized = undefined
          }
          return configuredLocales.some(locale => reference === locale.code || (normalized !== undefined && [locale.locale, ...locale.aliases].includes(normalized)))
        }
        const globalFallback = nuxt.options.i18n?.fallbackLocale
        const fallbackReferences = [nuxt.options.i18n?.defaultLocale, ...(Array.isArray(globalFallback) ? globalFallback : [globalFallback]), ...configuredLocales.flatMap(locale => locale.fallbackLocales)].filter((reference): reference is string => typeof reference === 'string')
        if (fallbackReferences.some(reference => !resolvesConfiguredLocale(reference))) throw new TypeError('Configured i18n fallback locale must reference an enabled locale code, iso, or language')
        localizationEnabled = true
        const payloadMode = nuxt.options.i18n?.translationPayloads?.mode ?? 'premerged'
        const storagePrefix = payloadMode === 'source' ? 'assets:i18n:' : 'assets:i18n:pages:index:'
        const storageKeys = Object.fromEntries(configuredLocales.map(locale => [locale.code, `${storagePrefix}${locale.code}.json`]))
        localizationLoader = addTemplate({
          filename: 'laravelize/server-localization-source.mjs',
          write: true,
          getContents: () => `import { useStorage } from 'nitropack/runtime'\nexport const locales = ${JSON.stringify(configuredLocales)}\nconst storageKeys = ${JSON.stringify(storageKeys)}\nexport async function loadDictionary(code) {\n  const key = storageKeys[code]\n  if (!key) return {}\n  const value = await useStorage().getItem(key)\n  if (value == null) return {}\n  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Generated server localization dictionary must be an object')\n  return value\n}\n`,
        })
        addServerPlugin(localizationResolver.resolve('./runtime/server/locale-context-plugin'))
        addServerImports([
          { name: 'useServerLocalization', from: localizationResolver.resolve('./runtime/server/useServerLocalization') },
          { name: 'createServerLocalization', from: localizationResolver.resolve('./runtime/server/useServerLocalization') },
        ])
      })
    }
  },
})

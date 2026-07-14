import { addImportsDir, addPlugin, addServerImportsDir, addServerPlugin, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NitroConfig } from 'nitropack/types'

import { discoverProvidersByConvention } from './discovery/byConvention'
import { getLaravelizeProviderContributions } from './kit'
import { ProviderCollector, type ProviderTarget } from './discovery/ProviderCollector'
import { renderProvidersModule } from './templates'

export interface ModuleOptions {
  providers: Array<{ path: string, target: ProviderTarget }>
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@nuxt-laravelize/core',
    configKey: 'laravelizeCore',
    compatibility: { nuxt: '>=4.3.0 <5' },
  },
  defaults: { providers: [] },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const collect = (): ReturnType<ProviderCollector['collect']> => {
      const collector = new ProviderCollector()
      collector.addFromConvention(discoverProvidersByConvention(nuxt.options.rootDir))
      for (const provider of options.providers) collector.addFromConfig([provider.path], provider.target)
      for (const provider of getLaravelizeProviderContributions(nuxt)) collector.addFromApi(provider.path, provider.target)
      return collector.collect()
    }

    const serverTemplate = addTemplate({
      filename: 'laravelize/server-providers.ts',
      getContents: () => renderProvidersModule(collect().server),
      write: true,
    })
    const clientTemplate = addTemplate({
      filename: 'laravelize/client-providers.ts',
      getContents: () => renderProvidersModule(collect().client),
      write: true,
    })

    nuxt.options.alias['#laravelize/server-providers'] = serverTemplate.dst
    nuxt.options.alias['#laravelize/client-providers'] = clientTemplate.dst
    ;(nuxt.hooks as { hook(name: 'nitro:config', callback: (config: NitroConfig) => void): void }).hook('nitro:config', (nitroConfig) => {
      nitroConfig.alias ??= {}
      nitroConfig.alias['#laravelize/server-providers'] = serverTemplate.dst
      nitroConfig.alias['#laravelize/client-providers'] = clientTemplate.dst
    })

    addPlugin(resolver.resolve('./runtime/plugin'))
    addServerPlugin(resolver.resolve('./runtime/server/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerImportsDir(resolver.resolve('./runtime/server/logging'))
    addServerImportsDir(resolver.resolve('./runtime/server/i18n'))
  },
})

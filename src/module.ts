import { addImportsDir, addPlugin, addServerImportsDir, addServerPlugin, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NitroConfig } from 'nitropack/types'

import { discoverProvidersByConvention } from './discovery/byConvention'
import { ProviderCollector, type ProviderTarget } from './discovery/ProviderCollector'
import { drainLaravelizeProviderQueue } from './kit'
import { renderProvidersModule } from './templates'

export interface ModuleOptions {
  container: boolean
  providers: Array<{ path: string, target: ProviderTarget }>
  queue?: {
    driver?: 'memory' | 'bullmq'
    redis?: { url?: string, host?: string, port?: number, password?: string }
    queues?: readonly string[]
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-laravelize',
    configKey: 'laravelize',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    container: true,
    providers: [],
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const collector = new ProviderCollector()

    collector.addFromConvention(discoverProvidersByConvention(nuxt.options.rootDir))

    for (const provider of options.providers) {
      collector.addFromConfig([provider.path], provider.target)
    }

    for (const entry of drainLaravelizeProviderQueue(nuxt)) {
      collector.addFromApi(entry.path, entry.target)
    }

    const collected = collector.collect()

    const serverTemplate = addTemplate({
      filename: 'laravelize/server-providers.ts',
      getContents: () => renderProvidersModule(collected.server),
      write: true,
    })

    const clientTemplate = addTemplate({
      filename: 'laravelize/client-providers.ts',
      getContents: () => renderProvidersModule(collected.client),
      write: true,
    })

    nuxt.options.alias['#laravelize/server-providers'] = serverTemplate.dst
    nuxt.options.alias['#laravelize/client-providers'] = clientTemplate.dst

    ;(nuxt.hooks as { hook(name: string, cb: (config: NitroConfig) => void): void }).hook('nitro:config', (nitroConfig) => {
      nitroConfig.alias = nitroConfig.alias ?? {}
      nitroConfig.alias['#laravelize/server-providers'] = serverTemplate.dst
      nitroConfig.alias['#laravelize/client-providers'] = clientTemplate.dst
    })

    addPlugin(resolver.resolve('./runtime/plugin'))
    addServerPlugin(resolver.resolve('./nitro/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerImportsDir(resolver.resolve('./runtime/server/http'))
    addServerImportsDir(resolver.resolve('./runtime/server/events'))
    addServerImportsDir(resolver.resolve('./runtime/server/queue'))
  },
})

import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export interface ModuleOptions { driver?: 'fail-closed' | 'memory', memoryCapacity?: number }
export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/broadcasting', configKey: 'laravelizeBroadcasting', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { driver: 'fail-closed', memoryCapacity: 100 },
  moduleDependencies: { '@nuxt-laravelize/core': {}, '@nuxt-laravelize/events': {} },
  setup(options, nuxt) {
    nuxt.options.runtimeConfig.laravelizeBroadcasting = { driver: options.driver, memoryCapacity: options.memoryCapacity, ...(typeof nuxt.options.runtimeConfig.laravelizeBroadcasting === 'object' ? nuxt.options.runtimeConfig.laravelizeBroadcasting : {}) }
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/BroadcastingServiceProvider'), 'server')
    addServerImports(['useBroadcasting', 'useBroadcastChannels', 'broadcasterToken', 'broadcastingManagerToken', 'channelRegistryToken'].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

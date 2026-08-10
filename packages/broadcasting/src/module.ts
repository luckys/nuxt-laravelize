import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions { driver?: 'fail-closed' | 'memory', memoryCapacity?: number }
const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-broadcasting', configKey: 'laravelizeBroadcasting', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { driver: 'fail-closed', memoryCapacity: 100 },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {}, '@luckys_luis/nuxt-laravelize-events': {} },
  setup(options, nuxt) {
    nuxt.options.runtimeConfig.laravelizeBroadcasting = { driver: options.driver, memoryCapacity: options.memoryCapacity, ...(typeof nuxt.options.runtimeConfig.laravelizeBroadcasting === 'object' ? nuxt.options.runtimeConfig.laravelizeBroadcasting : {}) }
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/BroadcastingServiceProvider'), 'server')
    addServerImports(['useBroadcasting', 'useBroadcastChannels', 'broadcasterToken', 'broadcastingManagerToken', 'channelRegistryToken'].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

export default module

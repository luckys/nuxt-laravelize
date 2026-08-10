import { addServerImports, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions { trustIncomingTraceContext: boolean }
const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-observability', configKey: 'laravelizeObservability', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {}, '@luckys_luis/nuxt-laravelize-execution-context': {} }, defaults: { trustIncomingTraceContext: false },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.runtimeConfig.laravelizeObservability = { trustIncomingTraceContext: options.trustIncomingTraceContext }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/ObservabilityServiceProvider'), 'server')
    addServerPlugin(resolver.resolve('./runtime/server/plugin'))
    addServerImports([{ name: 'useObservability', from: resolver.resolve('./runtime/server/useObservability') }, { name: 'observabilityToken', from: resolver.resolve('./runtime/index') }])
  },
})

export default module

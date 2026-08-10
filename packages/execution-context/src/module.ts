import { addServerImports, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  correlationHeader: string
  trustIncomingCorrelationHeader: boolean
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-execution-context', configKey: 'laravelizeExecutionContext', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
  defaults: { correlationHeader: 'x-correlation-id', trustIncomingCorrelationHeader: false },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.runtimeConfig.laravelizeExecutionContext = {
      correlationHeader: options.correlationHeader,
      trustIncomingCorrelationHeader: options.trustIncomingCorrelationHeader,
      ...(typeof nuxt.options.runtimeConfig.laravelizeExecutionContext === 'object' ? nuxt.options.runtimeConfig.laravelizeExecutionContext : {}),
    }
    addServerPlugin(resolver.resolve('./runtime/server/plugin'))
    addServerImports({ name: 'useExecutionContext', from: resolver.resolve('./runtime/server/useExecutionContext') })
  },
})

export default module

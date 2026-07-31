import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  iterations?: number
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/hashing', configKey: 'laravelizeHashing', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { iterations: 600_000 },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeOptions = nuxt.options.runtimeConfig.laravelizeHashing
    nuxt.options.runtimeConfig.laravelizeHashing = {
      iterations: options.iterations ?? 600_000,
      ...(typeof runtimeOptions === 'object' && runtimeOptions !== null ? runtimeOptions : {}),
    }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/HashingServiceProvider'), 'server')
    addServerImports([
      { name: 'hasherToken', from: resolver.resolve('./runtime/server') },
      { name: 'useHasher', from: resolver.resolve('./runtime/server') },
    ])
  },
})

export default module

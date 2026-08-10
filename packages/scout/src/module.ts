import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions { driver?: string }

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-scout', configKey: 'laravelizeScout', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
  defaults: { driver: 'memory' },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeOptions = nuxt.options.runtimeConfig.laravelizeScout
    nuxt.options.runtimeConfig.laravelizeScout = {
      driver: options.driver ?? 'memory',
      ...(typeof runtimeOptions === 'object' && runtimeOptions !== null ? runtimeOptions : {}),
    }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/ScoutServiceProvider'), 'server')
    addServerImports(['useScout', 'scoutManagerToken'].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

export default module

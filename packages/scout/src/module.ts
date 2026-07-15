import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export interface ModuleOptions { driver?: string }

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/scout', configKey: 'laravelizeScout', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
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

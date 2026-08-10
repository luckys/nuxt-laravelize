import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export type ModuleOptions = Record<string, never>

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-queue', configKey: 'laravelizeQueue', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: {},
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/QueueServiceProvider'), 'server')
    addServerImports({ name: 'useQueue', from: resolver.resolve('./runtime/server') })
  },
})

export default module

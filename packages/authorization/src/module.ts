import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@luckys_luis/nuxt-laravelize-authorization', configKey: 'laravelizeAuthorization', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {}, '@luckys_luis/nuxt-laravelize-execution-context': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/AuthorizationServiceProvider'), 'server')
    addServerImports({ name: 'useAuthorization', from: resolver.resolve('./runtime/server/useAuthorization') })
  },
})

export default module

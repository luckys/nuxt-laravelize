import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/authorization', configKey: 'laravelizeAuthorization', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {}, '@nuxt-laravelize/execution-context': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/AuthorizationServiceProvider'), 'server')
    addServerImports({ name: 'useAuthorization', from: resolver.resolve('./runtime/server/useAuthorization') })
  },
})

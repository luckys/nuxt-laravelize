import { addServerImportsDir, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/http', configKey: 'laravelizeHttp', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup() {
    const resolver = createResolver(import.meta.url)
    addServerImportsDir(resolver.resolve('./runtime/server'))
  },
})

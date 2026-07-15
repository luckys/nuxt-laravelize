import { addImportsDir, addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  baseURL?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/http', configKey: 'laravelizeHttp', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { baseURL: '' },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeOptions = nuxt.options.runtimeConfig.public.laravelizeHttp

    nuxt.options.runtimeConfig.public.laravelizeHttp = {
      baseURL: options.baseURL ?? '',
      ...(typeof runtimeOptions === 'object' && runtimeOptions !== null ? runtimeOptions : {}),
    }

    addImportsDir(resolver.resolve('./runtime/composables'))
    addServerImports([
      'FormRequest',
      'defineLaravelizedHandler',
      'globalMiddlewareToken',
      'Resource',
      'ResourceCollection',
      'PaginatedResourceCollection',
      'InMemoryGate',
      'gateToken',
      'CursorPaginator',
      'LengthAwarePaginator',
      'SimplePaginator',
    ].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

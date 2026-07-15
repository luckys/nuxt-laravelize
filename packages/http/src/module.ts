import { addImportsDir, addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export interface ModuleOptions {
  baseURL?: string
  signingKey?: string
  signingOrigin?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/http', configKey: 'laravelizeHttp', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { baseURL: '', signingKey: '', signingOrigin: '' },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const privateRuntimeOptions = nuxt.options.runtimeConfig.laravelizeHttp
    const runtimeOptions = nuxt.options.runtimeConfig.public.laravelizeHttp

    nuxt.options.runtimeConfig.laravelizeHttp = {
      signingKey: options.signingKey ?? '',
      signingOrigin: options.signingOrigin ?? '',
      ...(typeof privateRuntimeOptions === 'object' && privateRuntimeOptions !== null ? privateRuntimeOptions : {}),
    }

    nuxt.options.runtimeConfig.public.laravelizeHttp = {
      baseURL: options.baseURL ?? '',
      ...(typeof runtimeOptions === 'object' && runtimeOptions !== null ? runtimeOptions : {}),
    }

    addImportsDir(resolver.resolve('./runtime/composables'))
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/HttpServiceProvider'), 'server')
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
      'HmacUrlSigner',
      'MissingUrlSigningKeyError',
      'ValidateSignature',
      'urlSignerToken',
      'validateSignatureToken',
      'useUrlSigner',
    ].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

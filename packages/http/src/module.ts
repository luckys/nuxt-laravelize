import { addImportsDir, addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  baseURL?: string
  signingKey?: string
  signingOrigin?: string
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-http', configKey: 'laravelizeHttp', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { baseURL: '', signingKey: '', signingOrigin: '' },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {}, '@luckys_luis/nuxt-laravelize-validation': {} },
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

export default module

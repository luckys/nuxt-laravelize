import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  /** Volatile storage must be explicitly selected. Use a custom token binding in production. */
  driver?: 'none' | 'memory'
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/idempotency', configKey: 'laravelizeIdempotency', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { driver: 'none' },
  moduleDependencies: {
    '@nuxt-laravelize/core': {},
    '@nuxt-laravelize/http': {},
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    nuxt.options.runtimeConfig.laravelizeIdempotency = { driver: options.driver ?? 'none' }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/IdempotencyServiceProvider'), 'server')
    addServerImports(['createIdempotencyMiddleware', 'IdempotencyMiddleware', 'idempotencyStoreToken', 'useIdempotencyStore'].map(name => ({ name, from: resolver.resolve('./runtime/server') })))
  },
})

export default module

declare module 'nuxt/schema' {
  interface RuntimeConfig { laravelizeIdempotency: { driver: 'none' | 'memory' } }
}

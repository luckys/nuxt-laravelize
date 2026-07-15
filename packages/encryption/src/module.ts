import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export interface ModuleOptions {
  key?: string
  previousKeys?: string[]
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/encryption', configKey: 'laravelizeEncryption', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { key: '', previousKeys: [] },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeOptions = nuxt.options.runtimeConfig.laravelizeEncryption
    nuxt.options.runtimeConfig.laravelizeEncryption = {
      key: options.key ?? '',
      previousKeys: options.previousKeys ?? [],
      ...(typeof runtimeOptions === 'object' && runtimeOptions !== null ? runtimeOptions : {}),
    }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/EncryptionServiceProvider'), 'server')
    addServerImports([
      { name: 'encrypterToken', from: resolver.resolve('./runtime/server') },
      { name: 'useEncrypter', from: resolver.resolve('./runtime/server') },
    ])
  },
})

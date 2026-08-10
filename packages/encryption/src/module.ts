import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  key?: string
  previousKeys?: string[]
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-encryption', configKey: 'laravelizeEncryption', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { key: '', previousKeys: [] },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
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

export default module

import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  defaultConnection?: string
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-ai-sdk', configKey: 'laravelizeAiSdk', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const configured = typeof nuxt.options.runtimeConfig.laravelizeAiSdk === 'object' ? nuxt.options.runtimeConfig.laravelizeAiSdk : {}
    nuxt.options.runtimeConfig.laravelizeAiSdk = {
      defaultConnection: options.defaultConnection ?? 'default',
      ...configured,
    }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/AiSdkServiceProvider'), 'server')
    addServerImports({ name: 'useAi', from: resolver.resolve('./runtime/server/useAi') })
  },
})

export default module

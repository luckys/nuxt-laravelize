import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions { defaultRuntime?: string }
const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@luckys_luis/nuxt-laravelize-agent-sdk', configKey: 'laravelizeAgentSdk', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const configured = typeof nuxt.options.runtimeConfig.laravelizeAgentSdk === 'object' ? nuxt.options.runtimeConfig.laravelizeAgentSdk : {}
    nuxt.options.runtimeConfig.laravelizeAgentSdk = { defaultRuntime: options.defaultRuntime ?? 'default', ...configured }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/AgentSdkServiceProvider'), 'server')
    addServerImports({ name: 'useAgentRuntime', from: resolver.resolve('./runtime/server/useAgentRuntime') })
  },
})

export default module

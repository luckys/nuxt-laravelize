import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export interface ModuleOptions { defaultRuntime?: string }
export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/agent-sdk', configKey: 'laravelizeAgentSdk', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const configured = typeof nuxt.options.runtimeConfig.laravelizeAgentSdk === 'object' ? nuxt.options.runtimeConfig.laravelizeAgentSdk : {}
    nuxt.options.runtimeConfig.laravelizeAgentSdk = { defaultRuntime: options.defaultRuntime ?? 'default', ...configured }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/AgentSdkServiceProvider'), 'server')
    addServerImports({ name: 'useAgentRuntime', from: resolver.resolve('./runtime/server/useAgentRuntime') })
  },
})

import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import type { NuxtModule } from 'nuxt/schema'

export interface ModuleOptions {
  driver?: 'memory' | 'null'
  memoryCapacity?: number
  requireTenantId?: boolean
}

const module: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/audit', configKey: 'laravelizeAudit', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {}, '@nuxt-laravelize/execution-context': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const configured = typeof nuxt.options.runtimeConfig.laravelizeAudit === 'object' ? nuxt.options.runtimeConfig.laravelizeAudit : {}
    nuxt.options.runtimeConfig.laravelizeAudit = {
      driver: options.driver ?? (nuxt.options.dev ? 'memory' : 'null'),
      memoryCapacity: options.memoryCapacity ?? 1_000,
      requireTenantId: options.requireTenantId ?? false,
      ...configured,
    }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/AuditServiceProvider'), 'server')
    addServerImports({ name: 'useAudit', from: resolver.resolve('./runtime/server/useAudit') })
  },
})

export default module

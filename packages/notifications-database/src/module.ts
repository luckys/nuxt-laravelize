import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export interface ModuleOptions {
  driver?: 'memory' | 'null'
  memoryCapacity?: number
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/notifications-database', configKey: 'laravelizeNotificationsDatabase', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/execution-context': {}, '@nuxt-laravelize/notifications': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const configured = typeof nuxt.options.runtimeConfig.laravelizeNotificationsDatabase === 'object' ? nuxt.options.runtimeConfig.laravelizeNotificationsDatabase : {}
    nuxt.options.runtimeConfig.laravelizeNotificationsDatabase = {
      driver: options.driver ?? (nuxt.options.dev ? 'memory' : 'null'),
      memoryCapacity: options.memoryCapacity ?? 1_000,
      ...configured,
    }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/NotificationsDatabaseServiceProvider'), 'server')
    addServerImports({ name: 'useDatabaseNotifications', from: resolver.resolve('./runtime/server') })
  },
})

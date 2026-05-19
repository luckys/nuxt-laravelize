import { addImportsDir, addPlugin, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export type LaravelizeModuleOptions = {
  container: boolean
}

export default defineNuxtModule<LaravelizeModuleOptions>({
  meta: {
    name: 'nuxt-laravelize',
    configKey: 'laravelize',
  },
  defaults: {
    container: true,
  },
  setup(options) {
    const resolver = createResolver(import.meta.url)

    addPlugin(resolver.resolve('./runtime/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))

    if (!options.container) {
      return
    }

    addServerPlugin(resolver.resolve('./nitro/plugin'))
  },
})

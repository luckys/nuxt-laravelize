import { addImportsDir, addPlugin, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  container: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-laravelize',
    configKey: 'laravelize',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    container: true,
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./runtime/plugin'))
    addServerPlugin(resolver.resolve('./nitro/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
  },
})

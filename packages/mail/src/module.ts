import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'

export default defineNuxtModule({
  meta: { name: '@nuxt-laravelize/mail', configKey: 'laravelizeMail', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@nuxt-laravelize/core': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/MailServiceProvider'), 'server')
    addServerImports({ name: 'useMailer', from: resolver.resolve('./runtime/server') })
  },
})

import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@luckys_luis/nuxt-laravelize-core/kit'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule = defineNuxtModule({
  meta: { name: '@luckys_luis/nuxt-laravelize-mail', configKey: 'laravelizeMail', compatibility: { nuxt: '>=4.3.0 <5' } },
  moduleDependencies: { '@luckys_luis/nuxt-laravelize-core': {} },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/MailServiceProvider'), 'server')
    addServerImports({ name: 'useMailer', from: resolver.resolve('./runtime/server') })
  },
})

export default module

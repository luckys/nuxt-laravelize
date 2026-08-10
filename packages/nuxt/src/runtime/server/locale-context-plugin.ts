import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { defineNitroPlugin } from 'nitropack/runtime'
import { useServerLocalization } from './useServerLocalization'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    if (event.path.startsWith('/_locales') || event.path.startsWith('/_nuxt') || event.path.startsWith('/__')) return
    const container = event.context.laravelizeContainer
    if (!container || !container.has(executionContextToken)) throw new Error('Laravelize execution context is unavailable for locale propagation')
    const localization = await useServerLocalization(event)
    container.override(executionContextToken, container.make(executionContextToken).enrich({ locale: localization.locale }))
  })
})

declare module 'h3' {
  interface H3EventContext { laravelizeContainer?: import('@luckys_luis/nuxt-laravelize-core/runtime').Container }
}

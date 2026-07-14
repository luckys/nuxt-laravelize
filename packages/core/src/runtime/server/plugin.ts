import { defineNitroPlugin } from 'nitropack/runtime'

import serverProviders from '#laravelize/server-providers'
import { LaravelizeApplication } from '../../core/LaravelizeApplication'

export default defineNitroPlugin((nitroApp) => {
  const application = new LaravelizeApplication(serverProviders)
  const boot = application.boot()

  nitroApp.hooks.hook('request', async (event) => {
    await boot
    event.context.laravelizeContainer = await application.createScope()
  })

  nitroApp.hooks.hook('afterResponse', async (event) => {
    await event.context.laravelizeContainer?.dispose()
  })

  nitroApp.hooks.hook('close', async () => {
    await application.close()
  })
})

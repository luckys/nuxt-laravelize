import { defineNitroPlugin } from 'nitropack/runtime'

import serverProviders from '#laravelize/server-providers'
import { createContainer } from '../core/container/Container'
import { Kernel } from '../core/providers/Kernel'

import '../runtime/server/laravelize-context'

export default defineNitroPlugin(async (nitroApp) => {
  const rootContainer = createContainer()
  const kernel = new Kernel(rootContainer, serverProviders)
  await kernel.boot()

  nitroApp.hooks.hook('request', (event) => {
    event.context.laravelizeContainer = rootContainer.createScope()
  })
})

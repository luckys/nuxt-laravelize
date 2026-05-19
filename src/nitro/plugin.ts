import { defineNitroPlugin } from 'nitropack/runtime'

import { createNuxtLaravelizeContainer } from '../core/container/NuxtLaravelizeContainer'

type NitroAppLike = {
  hooks: {
    hook: (name: string, callback: (event: { context: Record<string, unknown> }) => void) => void
  }
}

export default defineNitroPlugin((nitroApp: NitroAppLike) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.laravelizeContainer = createNuxtLaravelizeContainer()
  })
})

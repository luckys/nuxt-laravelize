import { defineNuxtPlugin } from '#app'

import clientProviders from '#laravelize/client-providers'
import { createContainer } from '../core/container/Container'
import { Kernel } from '../core/providers/Kernel'

export default defineNuxtPlugin(async (nuxtApp) => {
  const container = createContainer()
  const kernel = new Kernel(container, clientProviders)
  await kernel.boot()

  nuxtApp.provide('laravelizeContainer', container)
})

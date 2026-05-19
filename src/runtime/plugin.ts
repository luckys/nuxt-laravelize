import { defineNuxtPlugin } from '#app'

type NuxtAppLike = {
  provide: (name: string, value: unknown) => void
}

export default defineNuxtPlugin((nuxtApp: NuxtAppLike) => {
  nuxtApp.provide('laravelize', {
    enabled: true,
  })
})

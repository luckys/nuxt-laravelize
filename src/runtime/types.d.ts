declare module '#app' {
  import type { Container } from '../core/container/Container'

  interface NuxtApp {
    $laravelizeContainer: Container
  }
}

export {}

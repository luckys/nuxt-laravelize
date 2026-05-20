import type { Container } from '../../core/container/Container'

declare module 'h3' {
  interface H3EventContext {
    laravelizeContainer?: Container
  }
}

export {}

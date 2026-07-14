import type { Container } from '../container/Container'

export interface ServiceProvider {
  register(container: Container): void
  boot?(container: Container): void | Promise<void>
}

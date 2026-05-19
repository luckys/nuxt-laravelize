import type { NuxtLaravelizeContainer } from '../container/NuxtLaravelizeContainer'

export type ProviderContext = {
  container: NuxtLaravelizeContainer
}

export interface ServiceProvider {
  register(context: ProviderContext): void
  boot?(context: ProviderContext): Promise<void>
}

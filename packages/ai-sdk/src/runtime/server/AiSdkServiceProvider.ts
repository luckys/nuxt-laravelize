import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

import { AiConnectionRegistry, AiSdkClient, aiClientToken, aiConnectionsToken } from '../index'

export default class AiSdkServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(aiConnectionsToken)) {
      container.singleton(aiConnectionsToken, () => new AiConnectionRegistry())
    }
    if (!container.has(aiClientToken)) {
      container.scoped(aiClientToken, (resolver) => {
        const config = useRuntimeConfig().laravelizeAiSdk as { defaultConnection: string }
        return new AiSdkClient(resolver.make(aiConnectionsToken), config.defaultConnection)
      })
    }
  }
}

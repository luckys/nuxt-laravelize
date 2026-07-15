import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

import { AesGcmEncrypter } from '../AesGcmEncrypter'
import { encrypterToken } from '../tokens'

export default class EncryptionServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(encrypterToken)) {
      container.singleton(encrypterToken, () => {
        const config = useRuntimeConfig().laravelizeEncryption as { key: string, previousKeys: string[] }
        return new AesGcmEncrypter(config.key, config.previousKeys)
      })
    }
  }
}

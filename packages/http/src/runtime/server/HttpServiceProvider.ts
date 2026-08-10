import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

import { HmacUrlSigner } from '../../signed-urls/HmacUrlSigner'
import { ValidateSignature } from '../../signed-urls/ValidateSignature'
import { urlSignerToken, validateSignatureToken } from '../../signed-urls/tokens'

export default class HttpServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(urlSignerToken, () => new HmacUrlSigner(useRuntimeConfig().laravelizeHttp.signingKey))
    container.singleton(validateSignatureToken, (resolver) => {
      const { signingOrigin } = useRuntimeConfig().laravelizeHttp
      if (!signingOrigin) {
        throw new Error('validateSignatureToken requires laravelizeHttp.signingOrigin to be configured.')
      }
      return new ValidateSignature(resolver.make(urlSignerToken), {
        origin: signingOrigin,
      })
    })
  }
}

import { createToken } from '@nuxt-laravelize/core/runtime'

import type { Middleware } from '../http/Middleware'
import type { UrlSigner } from './UrlSigner'

export const urlSignerToken = createToken<UrlSigner>('laravelize.http.url-signer')
export const validateSignatureToken = createToken<Middleware>('laravelize.http.validate-signature')

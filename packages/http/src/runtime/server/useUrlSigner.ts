import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { UrlSigner } from '../../signed-urls/UrlSigner'
import { urlSignerToken } from '../../signed-urls/tokens'

export function useUrlSigner(event: H3Event): UrlSigner {
  return useContainer(event).make(urlSignerToken)
}

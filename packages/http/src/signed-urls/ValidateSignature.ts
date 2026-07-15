import { createError, getRequestURL, type H3Event } from 'h3'

import type { Middleware } from '../http/Middleware'
import type { UrlSigner } from './UrlSigner'

export interface ValidateSignatureOptions {
  readonly absolute?: boolean
  readonly bindMethod?: boolean
  readonly origin?: string | URL
  readonly requireExpiration?: boolean
}

export class ValidateSignature implements Middleware {
  constructor(
    private readonly signer: UrlSigner,
    private readonly options: ValidateSignatureOptions = {},
  ) {
    if (options.origin !== undefined) new URL(options.origin)
  }

  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const requestUrl = getRequestURL(event)
    const url = this.options.origin === undefined
      ? requestUrl
      : new URL(`${requestUrl.pathname}${requestUrl.search}`, this.options.origin)
    if (!await this.signer.hasValidSignature(url, {
      absolute: this.options.absolute,
      method: this.options.bindMethod === true ? event.method : undefined,
      requireExpiration: this.options.requireExpiration,
    })) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Invalid Signature',
        data: { message: 'This URL has an invalid or expired signature.' },
      })
    }
    return await next()
  }
}

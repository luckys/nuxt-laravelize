import type { WebhookTransport } from './index.js'

export class WebhookTransportFake implements WebhookTransport {
  readonly requests: Array<{
    url: string
    init: RequestInit
  }> = []

  constructor(private readonly responses: Array<{
    status: number
    headers?: HeadersInit
  }> = [{ status: 204 }]) { }

  async send(url: string, init: RequestInit) {
    this.requests.push({ url, init: structuredClone(init) })
    const response = this.responses.shift() ?? { status: 204 }
    return { status: response.status, headers: new Headers(response.headers) }
  }
}

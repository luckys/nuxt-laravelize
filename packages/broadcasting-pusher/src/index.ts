import { createHmac, createHash } from 'node:crypto'
import type { Broadcaster, BroadcastMessage } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'
import { validateMessage } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

export interface PusherOptions { appId: string, key: string, secret: string, cluster?: string, host?: string, useTLS?: boolean }
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class PusherBroadcaster implements Broadcaster {
  readonly #options: Required<Omit<PusherOptions, 'host'>> & { host: string }
  constructor(options: PusherOptions, private readonly fetcher: Fetch = globalThis.fetch) {
    for (const [name, value] of Object.entries({ appId: options.appId, key: options.key, secret: options.secret })) if (!value) throw new TypeError(`Pusher ${name} is required.`)
    this.#options = { ...options, cluster: options.cluster ?? 'mt1', useTLS: options.useTLS ?? true, host: options.host ?? `api-${options.cluster ?? 'mt1'}.pusher.com` }
  }

  async broadcast(input: BroadcastMessage): Promise<void> {
    const message = validateMessage(input)
    if (message.channels.some(channel => channel.name.startsWith('private-encrypted-'))) throw new TypeError('Encrypted Pusher channels are not supported by this adapter.')
    const body = JSON.stringify({ name: message.event, channels: message.channels.map(channel => channel.name), data: JSON.stringify(message.payload), ...(message.exceptSocket ? { socket_id: message.exceptSocket } : {}) })
    const path = `/apps/${encodeURIComponent(this.#options.appId)}/events`
    const query = this.#signedQuery('POST', path, body)
    const response = await this.fetcher(`${this.#options.useTLS ? 'https' : 'http'}://${this.#options.host}${path}?${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    if (!response.ok) throw new Error(`Pusher broadcast failed with status ${response.status}.`)
  }

  authorizeChannel(socketId: string, channelName: string, presence?: { user_id: string | number, user_info?: Record<string, unknown> }): { auth: string, channel_data?: string } {
    if (!/^\d+\.\d+$/.test(socketId)) throw new TypeError('Invalid Pusher socket id.')
    if (!/^(?:private|presence)-/.test(channelName)) throw new TypeError('Only private and presence channels require Pusher authorization.')
    if (channelName.startsWith('private-encrypted-')) throw new TypeError('Encrypted Pusher channels are not supported by this adapter.')
    const isPresence = channelName.startsWith('presence-')
    if (isPresence !== (presence !== undefined)) throw new TypeError(isPresence ? 'Presence channel authorization requires member data.' : 'Private channels cannot include presence member data.')
    if (presence && ((typeof presence.user_id === 'string' && !presence.user_id.trim()) || (typeof presence.user_id === 'number' && !Number.isFinite(presence.user_id)))) throw new TypeError('Presence user_id must be a non-empty string or finite number.')
    const channelData = presence === undefined ? undefined : JSON.stringify(presence)
    if (channelData && new TextEncoder().encode(channelData).byteLength > 1_000) throw new TypeError('Pusher presence member data exceeds 1000 bytes.')
    const signature = this.#hmac(`${socketId}:${channelName}${channelData ? `:${channelData}` : ''}`)
    return { auth: `${this.#options.key}:${signature}`, ...(channelData ? { channel_data: channelData } : {}) }
  }

  #signedQuery(method: string, path: string, body: string): string {
    const params = new URLSearchParams({ auth_key: this.#options.key, auth_timestamp: String(Math.floor(Date.now() / 1000)), auth_version: '1.0', body_md5: createHash('md5').update(body).digest('hex') })
    params.sort()
    params.set('auth_signature', this.#hmac(`${method}\n${path}\n${params.toString()}`))
    return params.toString()
  }

  #hmac(value: string): string { return createHmac('sha256', this.#options.secret).update(value).digest('hex') }
}

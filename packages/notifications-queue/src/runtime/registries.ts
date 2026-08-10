import { NonRetryableJobError } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import type { JsonValue } from '@luckys_luis/nuxt-laravelize-reliability'
import type { Notifiable, Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'
import type { NotificationCodec, RecipientResolver, ResolvedRecipient } from './contracts'
import { assertJson } from './json'

const TYPE = /^[a-z0-9][a-z0-9._-]{0,127}$/
const REFERENCE = /^[A-Z0-9][\w.:-]{0,127}$/i

export interface EncodedNotification { readonly type: string, readonly version: number, readonly payload: JsonValue }
export interface RecipientReference { readonly type: string, readonly version: number, readonly id: string }

export class NotificationCodecRegistry {
  readonly #codecs = new Map<string, NotificationCodec>()
  register<T extends Notification>(codec: NotificationCodec<T>): void {
    validateRegistration(codec.type, codec.version)
    const key = codecKey(codec.type, codec.version)
    if (this.#codecs.has(key)) throw new TypeError(`Notification codec already registered: ${key}`)
    this.#codecs.set(key, codec as NotificationCodec)
  }

  encode(notification: Notification): EncodedNotification {
    const codec = [...this.#codecs.values()].find(item => item.supports(notification))
    if (!codec) throw new TypeError('Notification codec is not registered')
    const payload = codec.encode(notification)
    assertJson(payload)
    return { type: codec.type, version: codec.version, payload }
  }

  decode(encoded: EncodedNotification): Notification {
    const codec = this.#codecs.get(codecKey(encoded.type, encoded.version))
    if (!codec) throw new NonRetryableJobError('NOTIFICATION_CODEC_MISMATCH', 'Notification codec type or version is not registered')
    try {
      return codec.decode(encoded.payload)
    }
    catch (error) { throw new NonRetryableJobError('NOTIFICATION_DECODE_FAILED', 'Notification codec rejected its payload', { cause: error }) }
  }
}

export class RecipientResolverRegistry {
  readonly #resolvers = new Map<string, RecipientResolver>()
  register<T extends Notifiable>(resolver: RecipientResolver<T>): void {
    validateRegistration(resolver.type, resolver.version)
    const key = codecKey(resolver.type, resolver.version)
    if (this.#resolvers.has(key)) throw new TypeError(`Recipient resolver already registered: ${key}`)
    this.#resolvers.set(key, resolver as RecipientResolver)
  }

  reference(notifiable: Notifiable): RecipientReference {
    const resolver = [...this.#resolvers.values()].find(item => item.supports(notifiable))
    if (!resolver) throw new TypeError('Recipient resolver is not registered')
    const id = resolver.reference(notifiable)
    validateReference(id)
    return { type: resolver.type, version: resolver.version, id }
  }

  async resolve(reference: RecipientReference): Promise<ResolvedRecipient | null> {
    const resolver = this.#resolvers.get(codecKey(reference.type, reference.version))
    if (!resolver) throw new NonRetryableJobError('RECIPIENT_RESOLVER_MISMATCH', 'Recipient resolver type or version is not registered')
    return resolver.resolve(reference.id)
  }
}

export function validateType(value: unknown, field: string): string {
  if (typeof value !== 'string' || !TYPE.test(value)) throw new TypeError(`Invalid ${field}`)
  return value
}
export function validateVersion(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1000) throw new TypeError(`Invalid ${field}`)
  return value as number
}
export function validateReference(value: unknown): string {
  if (typeof value !== 'string' || !REFERENCE.test(value) || value.includes('@')) throw new TypeError('Invalid recipient reference')
  return value
}
function validateRegistration(type: string, version: number): void {
  validateType(type, 'codec type')
  validateVersion(version, 'codec version')
}
function codecKey(type: string, version: number): string {
  return `${type}@${version}`
}

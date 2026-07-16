import { assertJsonObject } from './Broadcasting'

export type ChannelAuthorizer<User = unknown> = (user: User, params: Readonly<Record<string, string>>) => boolean | Record<string, unknown> | Promise<boolean | Record<string, unknown>>
export interface ChannelAuthorization { authorized: true, presence?: Record<string, unknown> }

export class ChannelRegistry<User = unknown> {
  readonly #entries: Array<{ pattern: string, regex: RegExp, keys: string[], authorize: ChannelAuthorizer<User> }> = []
  channel(pattern: string, authorize: ChannelAuthorizer<User>): this {
    const keys: string[] = []
    const source = pattern.split('.').map((part) => {
      const match = /^\{([A-Z]\w*)\}$/i.exec(part)
      if (match) {
        keys.push(match[1]!)
        return '([^.]+)'
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }).join('\\.')
    this.#entries.push({ pattern, regex: new RegExp(`^${source}$`), keys, authorize })
    return this
  }

  async authorize(channel: string, user: User): Promise<ChannelAuthorization | null> {
    for (const entry of this.#entries) {
      const match = entry.regex.exec(channel)
      if (!match) continue
      const params = Object.fromEntries(entry.keys.map((key, index) => [key, decodeURIComponent(match[index + 1]!)]))
      const result = await entry.authorize(user, params)
      if (result === false) return null
      if (result === true) return { authorized: true }
      if (result && typeof result === 'object') return { authorized: true, presence: assertPresence(result) }
      return null
    }
    return null
  }
}
function assertPresence(value: Record<string, unknown>): Record<string, unknown> {
  return assertJsonObject(value)
}

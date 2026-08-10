/* eslint-disable @stylistic/max-statements-per-line */
import { authorizationToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { MemoryDeadLetterAdapter } from '@luckys_luis/nuxt-laravelize-dead-letter/testing'
import { deadLetterAdapterRegistryToken } from '../../../../../src/runtime/tokens'

export default class FixtureProvider implements ServiceProvider {
  register(container: Container): void {
    void container
  }

  boot(container: Container): void {
    const allowed = new Set(['dead-letters.list', 'dead-letters.view', 'dead-letters.view-payload', 'dead-letters.view-error-summary', 'dead-letters.retry', 'dead-letters.discard', 'dead-letters.retry-inbox'])
    const permits = (ability: string, options?: { args?: readonly unknown[] }) => {
      const context = options?.args?.[0] as { source?: string, key?: { source?: string } } | undefined
      return allowed.has(ability) && (context?.source ?? context?.key?.source) !== 'hidden'
    }
    container.scoped(authorizationToken, () => ({ authorize: async (ability: string, options?: { args?: readonly unknown[] }) => { if (!permits(ability, options)) throw new Error('forbidden'); return { allowed: true } }, allows: async (ability: string, options?: { args?: readonly unknown[] }) => permits(ability, options) }) as never)
    container.make(deadLetterAdapterRegistryToken).register(new MemoryDeadLetterAdapter('queue', [
      { key: { source: 'queue', namespace: 'jobs', id: 'fixture' }, type: 'mail', disposition: 'active', attempts: 1, terminalAt: '2026-01-01T00:00:00.000Z', revision: '1', error: 'token=secret failure', payload: { html: '<script>alert("secret")</script>' } },
      { key: { source: 'queue', namespace: 'jobs', id: 'discard' }, type: 'mail', disposition: 'active', attempts: 2, terminalAt: '2026-01-02T00:00:00.000Z', revision: '1', payload: { secret: true } },
    ])).register(new MemoryDeadLetterAdapter('hidden'))
  }
}

import type { Nuxt } from '@nuxt/schema'

import type { ProviderTarget } from './discovery/ProviderCollector'

const collectorKey = Symbol.for('nuxt-laravelize.collector')

interface CollectorHost {
  [collectorKey]?: {
    queue: Array<{ path: string, target: ProviderTarget }>
  }
}

export function addLaravelizeProvider(nuxt: Nuxt, path: string, target: ProviderTarget): void {
  const host = nuxt as unknown as CollectorHost
  const store = host[collectorKey] ?? { queue: [] }
  store.queue.push({ path, target })
  host[collectorKey] = store
}

export function drainLaravelizeProviderQueue(nuxt: Nuxt): Array<{ path: string, target: ProviderTarget }> {
  const host = nuxt as unknown as CollectorHost
  const store = host[collectorKey]
  if (!store) {
    return []
  }

  const queue = store.queue.slice()
  store.queue.length = 0
  return queue
}

export type { ProviderTarget } from './discovery/ProviderCollector'

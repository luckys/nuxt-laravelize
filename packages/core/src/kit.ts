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

export function getLaravelizeProviderContributions(nuxt: Nuxt): readonly { path: string, target: ProviderTarget }[] {
  const host = nuxt as unknown as CollectorHost
  const store = host[collectorKey]
  if (!store) {
    return []
  }

  return store.queue.slice()
}

/** @deprecated Use getLaravelizeProviderContributions. */
export function drainLaravelizeProviderQueue(nuxt: Nuxt): Array<{ path: string, target: ProviderTarget }> {
  return [...getLaravelizeProviderContributions(nuxt)]
}

export type { ProviderTarget } from './discovery/ProviderCollector'

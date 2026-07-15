import { InMemoryCache } from '../InMemoryCache'

export class CacheFake extends InMemoryCache {
  async assertHas(key: string): Promise<void> {
    if (!await this.has(key)) throw new Error(`Expected cache to contain "${key}".`)
  }

  async assertMissing(key: string): Promise<void> {
    if (await this.has(key)) throw new Error(`Expected cache not to contain "${key}".`)
  }

  reset(): Promise<void> {
    return this.flush()
  }
}

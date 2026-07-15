export type FeatureValue = unknown
export type FeatureResolver = (scope: unknown) => FeatureValue | Promise<FeatureValue>

export interface FeatureScopeable { toFeatureIdentifier(): string }
export interface StoredFeature { readonly found: boolean, readonly value?: FeatureValue }
export interface FeatureStore {
  get(feature: string, scope: string): Promise<StoredFeature>
  set(feature: string, scope: string, value: FeatureValue): Promise<void>
  delete(feature: string, scope: string): Promise<void>
  purge(features?: readonly string[]): Promise<void>
}

export class FeatureNotDefinedError extends Error {
  constructor(readonly feature: string) {
    super(`Feature "${feature}" is not defined.`)
    this.name = 'FeatureNotDefinedError'
  }
}

export class InMemoryFeatureStore implements FeatureStore {
  readonly #values = new Map<string, FeatureValue>()
  async get(feature: string, scope: string): Promise<StoredFeature> {
    const key = `${feature}\0${scope}`
    return this.#values.has(key) ? { found: true, value: this.#values.get(key) } : { found: false }
  }

  async set(feature: string, scope: string, value: FeatureValue): Promise<void> { this.#values.set(`${feature}\0${scope}`, value) }
  async delete(feature: string, scope: string): Promise<void> { this.#values.delete(`${feature}\0${scope}`) }
  async purge(features?: readonly string[]): Promise<void> {
    if (!features) return void this.#values.clear()
    for (const key of this.#values.keys()) if (features.some(feature => key.startsWith(`${feature}\0`))) this.#values.delete(key)
  }
}

export class FeatureManager {
  readonly #definitions = new Map<string, FeatureResolver>()
  readonly #cache = new Map<string, FeatureValue>()
  constructor(private readonly store: FeatureStore, private readonly defaultScope: () => unknown = () => null) {}
  define(name: string, resolver: FeatureResolver | FeatureValue): this {
    assertName(name)
    this.#definitions.set(name, typeof resolver === 'function' ? resolver as FeatureResolver : () => resolver)
    return this
  }

  for(scope: unknown): ScopedFeatures { return new ScopedFeatures(this, scope) }
  value(name: string): Promise<FeatureValue> { return this.valueFor(name, this.defaultScope()) }
  active(name: string): Promise<boolean> { return this.activeFor(name, this.defaultScope()) }
  values(names: readonly string[]): Promise<Record<string, FeatureValue>> { return this.valuesFor(names, this.defaultScope()) }
  async valueFor(name: string, scope: unknown): Promise<FeatureValue> {
    assertName(name)
    const scopeId = identifyScope(scope)
    const key = `${name}\0${scopeId}`
    if (this.#cache.has(key)) return this.#cache.get(key)
    const stored = await this.store.get(name, scopeId)
    if (stored.found) {
      this.#cache.set(key, stored.value)
      return stored.value
    }
    const definition = this.#definitions.get(name)
    if (!definition) throw new FeatureNotDefinedError(name)
    const value = await definition(scope)
    if (value === undefined) throw new Error('Feature definitions cannot resolve to undefined.')
    await this.store.set(name, scopeId, value)
    this.#cache.set(key, value)
    return value
  }

  async activeFor(name: string, scope: unknown): Promise<boolean> { return await this.valueFor(name, scope) !== false }
  async valuesFor(names: readonly string[], scope: unknown): Promise<Record<string, FeatureValue>> {
    return Object.fromEntries(await Promise.all(names.map(async name => [name, await this.valueFor(name, scope)] as const)))
  }

  async setFor(name: string, scope: unknown, value: FeatureValue): Promise<void> {
    if (value === undefined) throw new Error('Feature values cannot be undefined.')
    const id = identifyScope(scope)
    await this.store.set(name, id, value)
    this.#cache.set(`${name}\0${id}`, value)
  }

  async forgetFor(name: string, scope: unknown): Promise<void> {
    const id = identifyScope(scope)
    await this.store.delete(name, id)
    this.#cache.delete(`${name}\0${id}`)
  }

  async purge(features?: readonly string[]): Promise<void> {
    await this.store.purge(features)
    this.#cache.clear()
  }

  flushCache(): void { this.#cache.clear() }
}

export class ScopedFeatures {
  constructor(private readonly manager: FeatureManager, private readonly scope: unknown) {}
  value(name: string): Promise<FeatureValue> { return this.manager.valueFor(name, this.scope) }
  active(name: string): Promise<boolean> { return this.manager.activeFor(name, this.scope) }
  async inactive(name: string): Promise<boolean> { return !await this.active(name) }
  values(names: readonly string[]): Promise<Record<string, FeatureValue>> { return this.manager.valuesFor(names, this.scope) }
  async allAreActive(names: readonly string[]): Promise<boolean> { return (await Promise.all(names.map(name => this.active(name)))).every(Boolean) }
  async someAreActive(names: readonly string[]): Promise<boolean> { return (await Promise.all(names.map(name => this.active(name)))).some(Boolean) }
  activate(name: string, value: FeatureValue = true): Promise<void> { return this.manager.setFor(name, this.scope, value) }
  deactivate(name: string): Promise<void> { return this.manager.setFor(name, this.scope, false) }
  forget(name: string): Promise<void> { return this.manager.forgetFor(name, this.scope) }
}

function identifyScope(scope: unknown): string {
  if (scope === null) return 'null'
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof scope)) return `${typeof scope}:${String(scope)}`
  if (typeof scope === 'object' && scope && 'toFeatureIdentifier' in scope && typeof scope.toFeatureIdentifier === 'function') return `object:${scope.toFeatureIdentifier()}`
  throw new Error('Feature scopes must be primitive values, null, or implement toFeatureIdentifier().')
}
function assertName(name: string): void {
  if (!name.trim() || name.includes('\0')) throw new Error('Feature name is invalid.')
}

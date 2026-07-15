import { describe, expect, it, vi } from 'vitest'
import { FeatureManager, InMemoryFeatureStore } from '../../src/runtime/Pennant'

describe('FeatureManager', () => {
  it('resolves once per scope and stores rich values', async () => {
    const resolve = vi.fn((scope: unknown) => `variant-${scope}`)
    const manager = new FeatureManager(new InMemoryFeatureStore()).define('button', resolve)
    await expect(manager.for('a').value('button')).resolves.toBe('variant-a')
    manager.flushCache()
    await expect(manager.for('a').value('button')).resolves.toBe('variant-a')
    expect(resolve).toHaveBeenCalledOnce()
  })
  it('supports checks and manual values', async () => {
    const manager = new FeatureManager(new InMemoryFeatureStore()).define('api', false)
    await expect(manager.for(1).active('api')).resolves.toBe(false)
    await manager.for(1).activate('api')
    await expect(manager.for(1).active('api')).resolves.toBe(true)
    await manager.for(1).forget('api')
    await expect(manager.for(1).active('api')).resolves.toBe(false)
  })
  it('keeps scope types separate', async () => {
    const manager = new FeatureManager(new InMemoryFeatureStore()).define('flag', true)
    await manager.for('1').deactivate('flag')
    await expect(manager.for(1).active('flag')).resolves.toBe(true)
    await expect(manager.for('1').active('flag')).resolves.toBe(false)
  })
  it('purges stored values', async () => {
    const manager = new FeatureManager(new InMemoryFeatureStore()).define('flag', true)
    await manager.for('a').deactivate('flag')
    await manager.purge(['flag'])
    await expect(manager.for('a').active('flag')).resolves.toBe(true)
  })
})

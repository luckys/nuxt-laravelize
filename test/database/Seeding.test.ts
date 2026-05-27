import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Seeder } from '../../src/database/seeding/Seeder'
import {
  DefaultSeederRegistry,
  UnknownSeeder,
} from '../../src/database/seeding/SeederRegistry'
import { discoverSeedersByConvention } from '../../src/database/seeding/discoverSeeders'

class CountingSeeder extends Seeder {
  ran = 0
  async run() { this.ran += 1 }
}

describe('DefaultSeederRegistry', () => {
  it('lists registered names', () => {
    const reg = new DefaultSeederRegistry()
    reg.register('A', () => new CountingSeeder())
    reg.register('B', () => new CountingSeeder())
    expect([...reg.list()].sort()).toEqual(['A', 'B'])
  })

  it('resolves and runs a seeder', async () => {
    const reg = new DefaultSeederRegistry()
    const instance = new CountingSeeder()
    reg.register('demo', () => instance)
    const resolved = await reg.resolve('demo')
    await resolved.run()
    expect(instance.ran).toBe(1)
  })

  it('throws UnknownSeeder when missing', async () => {
    const reg = new DefaultSeederRegistry()
    await expect(reg.resolve('missing')).rejects.toBeInstanceOf(UnknownSeeder)
  })
})

describe('discoverSeedersByConvention', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'nlz-seed-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('returns an empty list when the directory is missing', () => {
    expect(discoverSeedersByConvention(root)).toEqual([])
  })

  it('finds .seeder.ts files in server/database/seeders/', () => {
    const dir = join(root, 'server', 'database', 'seeders')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'DemoInvoice.seeder.ts'), '')
    writeFileSync(join(dir, 'README.md'), '')
    writeFileSync(join(dir, 'Other.seeder.js'), '')

    const discovered = discoverSeedersByConvention(root)
    expect(discovered.map((d) => d.name).sort()).toEqual(['DemoInvoice', 'Other'])
  })
})

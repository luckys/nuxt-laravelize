import { describe, expect, it } from 'vitest'

import { Seeder } from '../../src/database/seeding/Seeder'
import { DefaultSeederRegistry } from '../../src/database/seeding/SeederRegistry'

class SeederA extends Seeder {
  ran = false
  override async run() {
    this.ran = true
    await this.call('B')
  }
}

class SeederB extends Seeder {
  ran = false
  override async run() {
    this.ran = true
    await this.call('C')
  }
}

class SeederC extends Seeder {
  ran = false
  override async run() {
    this.ran = true
  }
}

describe('Seeder.call()', () => {
  it('runs another seeder via the registry', async () => {
    const reg = new DefaultSeederRegistry()
    const a = new SeederA()
    const b = new SeederB()
    const c = new SeederC()
    reg.register('A', () => a)
    reg.register('B', () => b)
    reg.register('C', () => c)

    const resolved = await reg.resolve('A')
    await resolved.run()

    expect(a.ran).toBe(true)
    expect(b.ran).toBe(true)
    expect(c.ran).toBe(true)
  })

  it('throws if no registry is set (direct new without registry)', async () => {
    class LonelySeeder extends Seeder {
      override async run() {
        await this.call('Other')
      }
    }

    const seeder = new LonelySeeder()
    await expect(seeder.run()).rejects.toThrow('Seeder.call() requires a SeederRegistry')
  })

  it('nested calls work (A calls B calls C)', async () => {
    const calls: string[] = []

    class NestedA extends Seeder {
      override async run() {
        calls.push('A')
        await this.call('B')
      }
    }

    class NestedB extends Seeder {
      override async run() {
        calls.push('B')
        await this.call('C')
      }
    }

    class NestedC extends Seeder {
      override async run() {
        calls.push('C')
      }
    }

    const reg = new DefaultSeederRegistry()
    reg.register('A', () => new NestedA())
    reg.register('B', () => new NestedB())
    reg.register('C', () => new NestedC())

    const resolved = await reg.resolve('A')
    await resolved.run()

    expect(calls).toEqual(['A', 'B', 'C'])
  })
})

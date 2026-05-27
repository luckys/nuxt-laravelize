import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InMemoryGate } from '../../src/auth/Gate'
import { Policy } from '../../src/auth/Policy'
import {
  DefaultPolicyRegistry,
} from '../../src/auth/PolicyRegistry'
import { discoverPoliciesByConvention } from '../../src/auth/policiesByConvention'
import { GateRuleNotDefinedError } from '../../src/auth/GateRuleNotDefinedError'

interface UserShape { readonly id: string; readonly admin: boolean }
class Invoice {
  constructor(readonly customerId: string, readonly status: 'paid' | 'draft' = 'draft') {}
}

class InvoicePolicy extends Policy<UserShape, Invoice> {
  override before(user: UserShape) { return user.admin ? true : null }
  view(user: UserShape, invoice: Invoice) { return invoice.customerId === user.id }
  update(user: UserShape, invoice: Invoice) { return invoice.status !== 'paid' && invoice.customerId === user.id }
}

describe('DefaultPolicyRegistry', () => {
  it('registers and resolves policies by model name', () => {
    const reg = new DefaultPolicyRegistry()
    const p = new InvoicePolicy()
    reg.register('Invoice', p)
    expect(reg.resolve('Invoice')).toBe(p)
    expect(reg.resolve('Unknown')).toBeNull()
    expect(reg.list()).toEqual(['Invoice'])
  })
})

describe('InMemoryGate + policies', () => {
  function setup() {
    const registry = new DefaultPolicyRegistry()
    registry.register('Invoice', new InvoicePolicy())
    return new InMemoryGate(registry)
  }

  it('resolves a policy by the model constructor name', async () => {
    const gate = setup()
    const owner: UserShape = { id: 'u-1', admin: false }
    const stranger: UserShape = { id: 'u-2', admin: false }
    const invoice = new Invoice('u-1')

    expect(await gate.allows('view', owner, invoice)).toBe(true)
    expect(await gate.allows('view', stranger, invoice)).toBe(false)
  })

  it('uses before() as a short-circuit (admin override)', async () => {
    const gate = setup()
    const admin: UserShape = { id: 'admin', admin: true }
    const paid = new Invoice('someone-else', 'paid')
    expect(await gate.allows('update', admin, paid)).toBe(true)
  })

  it('respects action results when before() returns null', async () => {
    const gate = setup()
    const user: UserShape = { id: 'u-1', admin: false }
    const paid = new Invoice('u-1', 'paid')
    expect(await gate.allows('update', user, paid)).toBe(false)
  })

  it('falls back to define()d rules when no policy matches', async () => {
    const gate = setup()
    gate.define('publish-anything', () => true)
    expect(await gate.allows('publish-anything')).toBe(true)
  })

  it('throws GateRuleNotDefinedError when no policy and no rule', async () => {
    const gate = setup()
    await expect(gate.allows('nonsense', { id: 'x', admin: false }, new Invoice('y')))
      .rejects.toBeInstanceOf(GateRuleNotDefinedError)
  })

  it('still works as a plain Gate when no PolicyRegistry is provided', async () => {
    const gate = new InMemoryGate()
    gate.define('can-see-dashboard', () => true)
    expect(await gate.allows('can-see-dashboard')).toBe(true)
  })
})

describe('discoverPoliciesByConvention', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'nlz-pol-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('returns empty when the directory is missing', () => {
    expect(discoverPoliciesByConvention(root)).toEqual([])
  })

  it('finds *.policy.ts under server/policies/', () => {
    const dir = join(root, 'server', 'policies')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Invoice.policy.ts'), '')
    writeFileSync(join(dir, 'README.md'), '')
    writeFileSync(join(dir, 'User.policy.js'), '')
    expect(discoverPoliciesByConvention(root).map((d) => d.name).sort()).toEqual(['Invoice', 'User'])
  })
})

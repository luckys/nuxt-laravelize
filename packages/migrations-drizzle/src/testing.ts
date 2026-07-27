import type { FreshOwnership } from '@nuxt-laravelize/migrations'
import { assertIdentifier } from './shared.js'

export interface MigrationTestNamespace {
  readonly prefix: string
  table(name: string): string
  ownership(tables: readonly string[]): FreshOwnership
}

/** Creates an explicit, prefix-constrained namespace manifest for isolated tests. */
export function createTestNamespace(label: string, token = crypto.randomUUID().replaceAll('-', '').slice(0, 8)): MigrationTestNamespace {
  const normalized = label.replace(/\W/g, '_').slice(0, 24)
  const normalizedToken = token.replace(/\W/g, '_').slice(0, 16)
  if (!normalized || !normalizedToken) throw new TypeError('Test namespace label and token must contain identifier characters')
  const prefix = `test_${normalized}_${normalizedToken}_`
  assertIdentifier(`${prefix}x`, 'Test namespace')
  const table = (name: string): string => {
    assertIdentifier(name, 'Test table name')
    const full = `${prefix}${name}`
    assertIdentifier(full, 'Namespaced test table')
    return full
  }
  return Object.freeze({ prefix, table, ownership: (tables: readonly string[]) => ({ owner: `test_${normalized}_${normalizedToken}`, objects: tables.map(name => ({ kind: 'table' as const, name: table(name) })) }) })
}

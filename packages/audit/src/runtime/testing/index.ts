import type { AuditEntry, AuditRecordInput } from '../index'
import { InMemoryAuditStore } from '../index'

export class AuditFake extends InMemoryAuditStore {
  assertRecorded(predicate: Partial<AuditRecordInput> | ((entry: AuditEntry) => boolean)): AuditEntry {
    const found = this.#find(predicate)
    if (!found) throw new Error('Expected audit entry was not recorded')
    return structuredClone(found)
  }

  assertNotRecorded(predicate: Partial<AuditRecordInput> | ((entry: AuditEntry) => boolean)): void {
    if (this.#find(predicate)) throw new Error('Unexpected audit entry was recorded')
  }

  assertCount(expected: number): void { if (this.all().length !== expected) throw new Error(`Expected ${expected} audit entries, received ${this.all().length}`) }

  #find(predicate: Partial<AuditRecordInput> | ((entry: AuditEntry) => boolean)): AuditEntry | undefined {
    return this.all().find(entry => typeof predicate === 'function' ? predicate(entry) : Object.entries(predicate).every(([key, value]) => JSON.stringify(entry[key as keyof AuditEntry]) === JSON.stringify(value)))
  }
}

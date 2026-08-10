import type { FreshOwnership, MigrationRecord } from '@luckys_luis/nuxt-laravelize-migrations'

export const IDENTIFIER = /^[a-z_]\w{0,62}$/i
export const assertIdentifier = (value: string, label: string): void => {
  if (!IDENTIFIER.test(value)) throw new TypeError(`${label} must be a portable SQL identifier of at most 63 characters`)
}
export const quoteIdentifier = (value: string): string => {
  assertIdentifier(value, 'SQL identifier')
  return `"${value.replaceAll('"', '""')}"`
}
export const assertOwnership = (ownership: FreshOwnership, prefix?: string): void => {
  if (!ownership.objects.length) throw new TypeError('Ownership manifest must not be empty')
  for (const object of ownership.objects) {
    assertIdentifier(object.name, 'Owned object name')
    if (prefix && !object.name.startsWith(prefix)) throw new TypeError(`Owned object ${object.name} is outside the configured ownership prefix`)
  }
}
export const mapRecord = (row: Record<string, unknown>): MigrationRecord => ({
  id: String(row.id), namespace: String(row.namespace), name: String(row.name), checksum: String(row.checksum),
  batch: Number(row.batch), appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at),
})
export const pgRows = (result: unknown): readonly Record<string, unknown>[] => {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: Record<string, unknown>[] }).rows
  return []
}

export const failureWithCleanup = (primaryError: unknown, cleanupErrors: readonly unknown[], message: string): unknown => cleanupErrors.length
  ? new AggregateError([primaryError, ...cleanupErrors], message, { cause: primaryError })
  : primaryError

export function normalizeStoragePath(path: string, allowEmpty = false): string {
  if (path.includes('\0')) throw new Error('Filesystem path cannot contain null bytes.')
  const normalized = path.replaceAll('\\', '/').split('/').filter(segment => segment && segment !== '.')
  if (normalized.includes('..')) throw new Error('Filesystem path cannot traverse outside its disk.')
  const result = normalized.join('/')
  if (!allowEmpty && !result) throw new Error('Filesystem path cannot be empty.')
  return result
}

export function toBytes(contents: string | Uint8Array): Uint8Array {
  return typeof contents === 'string' ? new TextEncoder().encode(contents) : contents.slice()
}

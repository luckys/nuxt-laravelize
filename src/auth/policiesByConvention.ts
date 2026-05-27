import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface DiscoveredPolicy {
  readonly name: string
  readonly path: string
}

export function discoverPoliciesByConvention(rootDir: string): readonly DiscoveredPolicy[] {
  const dir = join(rootDir, 'server', 'policies')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.policy.ts') || file.endsWith('.policy.js'))
    .map((file) => {
      const path = join(dir, file)
      if (!statSync(path).isFile()) return null
      const name = file.replace(/\.policy\.(ts|js)$/, '')
      return { name, path }
    })
    .filter((d): d is DiscoveredPolicy => d !== null)
}

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface DiscoveredSeeder {
  readonly name: string
  readonly path: string
}

export function discoverSeedersByConvention(rootDir: string): readonly DiscoveredSeeder[] {
  const dir = join(rootDir, 'server', 'database', 'seeders')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.seeder.ts') || file.endsWith('.seeder.js'))
    .map((file) => {
      const path = join(dir, file)
      if (!statSync(path).isFile()) return null
      const name = file.replace(/\.seeder\.(ts|js)$/, '')
      return { name, path }
    })
    .filter((entry): entry is DiscoveredSeeder => entry !== null)
}

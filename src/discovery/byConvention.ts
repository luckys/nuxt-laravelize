import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface DiscoveredProviders {
  server: string[]
  client: string[]
}

export function discoverProvidersByConvention(rootDir: string): DiscoveredProviders {
  const appProviders = collectTypeScriptFiles(resolve(rootDir, 'app/providers'))
  const serverProviders = collectTypeScriptFiles(resolve(rootDir, 'server/providers'))
  const sharedProviders = collectTypeScriptFiles(resolve(rootDir, 'shared/providers'))

  return {
    server: [...serverProviders, ...sharedProviders],
    client: [...appProviders, ...sharedProviders],
  }
}

function collectTypeScriptFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return []
  }

  const entries = readdirSync(directory)
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directory, entry)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath))
      continue
    }

    if (entry.endsWith('.ts')) {
      files.push(entryPath)
    }
  }

  return files
}

import { existsSync, readdirSync } from 'node:fs'
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

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)

    if (entry.isSymbolicLink()) {
      return []
    }

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(entryPath)
    }

    if (entry.name.endsWith('.ts')) {
      return [entryPath]
    }

    return []
  })
}

import type { RouteDefinition, RouteTree } from './public-runtime'

const reservedNames = new Set(['__proto__', 'prototype', 'constructor'])

function normalizedPath(path: string): string {
  const normalized = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  if (normalized.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Route path contains a forbidden dot segment: "${path}".`)
  }
  return normalized
}

export function validateRouteTree(tree: RouteTree): void {
  const endpoints = new Map<string, string>()
  const names = new Set<string>()
  const visit = (node: RouteTree, prefix = ''): void => {
    for (const [part, value] of Object.entries(node)) {
      if (reservedNames.has(part)) throw new Error(`Reserved route name: "${part}".`)
      const name = prefix ? `${prefix}.${part}` : part
      if (names.has(name) || [...names].some(existing => existing.startsWith(`${name}.`) || name.startsWith(`${existing}.`))) {
        throw new Error(`Route name/prefix collision: "${name}".`)
      }
      if (isDefinition(value)) {
        names.add(name)
        const definition = value as RouteDefinition
        const endpoint = `${definition.method} ${normalizedPath(definition.path)}`
        const previous = endpoints.get(endpoint)
        if (previous) throw new Error(`Duplicate route endpoint ${endpoint}: "${previous}" and "${name}".`)
        endpoints.set(endpoint, name)
      }
      else visit(value, name)
    }
  }
  visit(tree)
}

function isDefinition(value: RouteTree | RouteDefinition): value is RouteDefinition {
  return 'method' in value && 'path' in value
}

export function renderRoutesModule(tree: RouteTree, baseURL = '', runtimeImport = '@nuxt-laravelize/routes/runtime'): string {
  validateRouteTree(tree)
  return `import { defineRoutes } from ${JSON.stringify(runtimeImport)}\n\nexport const routes = defineRoutes(${JSON.stringify(tree, null, 2)}, { baseURL: ${JSON.stringify(baseURL)} })\nexport default routes\n`
}

export function mergeRouteTrees(trees: readonly RouteTree[]): RouteTree {
  const merged: Record<string, RouteTree | RouteDefinition> = Object.create(null) as Record<string, RouteTree | RouteDefinition>
  const merge = (target: Record<string, RouteTree | RouteDefinition>, source: RouteTree, prefix = ''): void => {
    for (const [name, value] of Object.entries(source)) {
      if (reservedNames.has(name)) throw new Error(`Reserved route name: "${name}".`)
      const qualifiedName = prefix ? `${prefix}.${name}` : name
      const hasExisting = Object.hasOwn(target, name)
      const existing = target[name]
      if (!hasExisting) {
        target[name] = value
      }
      else if (existing && !isDefinition(existing) && !isDefinition(value)) {
        merge(existing, value, qualifiedName)
      }
      else {
        throw new Error(`Duplicate route name or name/prefix collision: "${qualifiedName}".`)
      }
    }
  }
  for (const tree of trees) merge(merged, tree)
  validateRouteTree(merged)
  return merged
}

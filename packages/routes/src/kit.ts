import type { Nuxt } from '@nuxt/schema'

const contributions = new WeakMap<Nuxt, Set<string>>()

export function addRoutesDeclaration(nuxt: Nuxt, path: string): void {
  const paths = contributions.get(nuxt) ?? new Set<string>()
  paths.add(path)
  contributions.set(nuxt, paths)
}

export function getRoutesDeclarations(nuxt: Nuxt): readonly string[] {
  return [...(contributions.get(nuxt) ?? [])]
}

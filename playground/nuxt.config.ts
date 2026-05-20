import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { defineNuxtModule, useNuxt } from '@nuxt/kit'
import { defineNuxtConfig } from 'nuxt/config'

// Rollup plugin: strip TypeScript `as const` from generated .mjs virtual modules.
// renderProvidersModule (src/templates.ts) emits TS syntax into .mjs files;
// Rollup does not parse .mjs as TypeScript, so we strip the annotation here.
const stripAsConstPlugin = {
  name: 'strip-as-const',
  transform(code: string, id: string) {
    if (id.endsWith('.mjs') && code.includes('as const')) {
      return { code: code.replace(/\s+as\s+const/g, ''), map: null }
    }
  },
}

// Rollup plugin: resolve and transform .ts provider files in the playground.
// Problem: the virtual server-providers.mjs uses absolute paths without extension.
// Rollup's node-resolve finds CounterProvider.ts but rejects it (invalid ext).
// Additionally, server API files import providers via relative paths which also
// resolve to .ts files that Rollup cannot parse without a TypeScript transform.
// This plugin intercepts both cases, returning the .ts id and transforming via
// esbuild so Rollup receives clean ESM JavaScript.
const resolveTsPlugin = {
  name: 'resolve-ts-providers',
  resolveId(id: string, importer?: string) {
    // Case 1: absolute extensionless path to a playground .ts file
    if (id.startsWith('/') && !id.includes('node_modules') && !id.endsWith('.ts')) {
      const tsId = `${id}.ts`
      if (tsId.includes('/playground/') && existsSync(tsId)) {
        return tsId
      }
    }
    // Case 2: absolute .ts path in playground (already has extension)
    if (id.startsWith('/') && id.endsWith('.ts') && id.includes('/playground/') && existsSync(id)) {
      return id
    }
    // Case 3: relative import that references a playground .ts file.
    // This covers two sub-cases:
    //   3a) relative import from a source file (e.g. laravelize.get.ts)
    //   3b) relative import from a Rollup-generated dist file that externalized
    //       a provider (the relative path may have wrong depth, so we fall back
    //       to re-resolving from the playground root if existsSync fails).
    if (id.startsWith('.') && importer && (id.endsWith('.ts') || !id.includes('.'))) {
      const base = dirname(importer)
      const candidate = id.endsWith('.ts') ? resolve(base, id) : `${resolve(base, id)}.ts`
      if (existsSync(candidate)) {
        return candidate
      }
      // Fallback: extract the tail of the relative path that starts with
      // 'playground/' and resolve it from the project root.
      const match = id.match(/playground[\\/].+/)
      if (match) {
        const PROJ = resolve(import.meta.dirname ?? dirname(new URL(import.meta.url).pathname), '..')
        const abs = resolve(PROJ, match[0])
        const tsAbs = abs.endsWith('.ts') ? abs : `${abs}.ts`
        if (existsSync(tsAbs)) return tsAbs
      }
    }
    return null
  },
  load(id: string) {
    if (id.endsWith('.ts') && id.includes('/playground/') && existsSync(id)) {
      try {
        const source = readFileSync(id, 'utf8')
        const result = transformSync(source, { loader: 'ts', target: 'esnext', format: 'esm' })
        return { code: result.code, map: result.map || null }
      }
      catch {
        return null
      }
    }
    return null
  },
}

// Inline Nuxt module that hooks into nitro:config to inject Rollup plugins.
// Using a module ensures the hook fires at the right time in the Nuxt lifecycle,
// even in @nuxt/test-utils e2e builds.
const playgroundRollupModule = defineNuxtModule({
  meta: { name: 'playground-rollup-fixes' },
  setup() {
    const nuxt = useNuxt()
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.rollupConfig = nitroConfig.rollupConfig ?? {}
      const existing = Array.isArray(nitroConfig.rollupConfig.plugins)
        ? [...nitroConfig.rollupConfig.plugins]
        : []
      // resolveTsPlugin must be first so it intercepts before node-resolve
      nitroConfig.rollupConfig.plugins = [resolveTsPlugin, stripAsConstPlugin, ...existing]
    })
  },
})

export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize', playgroundRollupModule],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  vite: {
    plugins: [stripAsConstPlugin],
  },
})

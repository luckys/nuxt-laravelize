import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, resolve } from 'node:path'
import { addTemplate, defineNuxtModule, updateTemplates } from '@nuxt/kit'
import { createJiti } from 'jiti'
import type { RouteTree } from './public-runtime'
import { getRoutesDeclarations } from './kit'
import { mergeRouteTrees, renderRoutesModule } from './generator'

export interface ModuleOptions {
  declarations: string[]
  baseURL: string
}

export function isMissingDefaultDeclaration(path: string, rootDir: string): boolean {
  return !existsSync(path) && path === resolve(rootDir, 'routes.ts')
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/routes', configKey: 'laravelizeRoutes', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { declarations: ['routes.ts'], baseURL: '' },
  async setup(options, nuxt) {
    const runtimeEntry = createRequire(import.meta.url).resolve('@nuxt-laravelize/routes/runtime')
    const declarationPaths = (): string[] => [...new Set([...options.declarations, ...getRoutesDeclarations(nuxt)])]
      .map(path => isAbsolute(path) ? path : resolve(nuxt.options.rootDir, path))
    const load = async (): Promise<RouteTree> => {
      const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false })
      const declarations: RouteTree[] = []
      for (const path of declarationPaths()) {
        if (isMissingDefaultDeclaration(path, nuxt.options.rootDir)) continue
        declarations.push(await jiti.import<RouteTree>(path, { default: true }))
      }
      return mergeRouteTrees(declarations)
    }
    const template = addTemplate({
      filename: 'laravelize/routes.ts',
      getContents: async () => renderRoutesModule(await load(), options.baseURL, runtimeEntry),
      write: true,
    })
    nuxt.options.alias['#laravelize/routes'] = template.dst
    nuxt.options.alias['@nuxt-laravelize/routes/runtime'] = runtimeEntry
    ;(nuxt.hooks as { hook(name: 'nitro:config', callback: (config: { alias?: Record<string, string> }) => void): void }).hook('nitro:config', (config) => {
      config.alias ??= {}
      config.alias['#laravelize/routes'] = template.dst
      config.alias['@nuxt-laravelize/routes/runtime'] = runtimeEntry
    })
    nuxt.hook('builder:watch', async (_event, path) => {
      const changed = resolve(nuxt.options.srcDir, path)
      if (declarationPaths().includes(changed)) await updateTemplates({ filter: item => item.dst === template.dst })
    })
  },
})

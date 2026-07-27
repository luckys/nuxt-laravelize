/* eslint-disable @stylistic/max-statements-per-line */
import { addComponentsDir, addServerHandler, createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import { resolveOptions, type DeadLetterOperationsRuntimeOptions } from './runtime/options'

export type ModuleOptions = Partial<DeadLetterOperationsRuntimeOptions>
const normalizePath = (value: string) => value.length > 1 ? value.replace(/\/+$/, '') : value
const routeSegments = (value: string) => normalizePath(value).split('/').filter(Boolean)
const catchAll = (segment: string) => segment === '*' || segment === '**' || segment === '(.*)' || segment.includes('...') || /^:[^/]+\*$/.test(segment)
const dynamic = (segment: string) => segment.startsWith(':') || segment.startsWith('[') || catchAll(segment)
export function routePatternsCollide(left: string, right: string): boolean {
  const a = routeSegments(left); const b = routeSegments(right); const maximum = Math.max(a.length, b.length)
  for (let index = 0; index < maximum; index++) {
    const x = a[index]; const y = b[index]
    if (x === undefined || y === undefined) return Boolean(catchAll(x ?? '') || catchAll(y ?? ''))
    if (catchAll(x) || catchAll(y)) return true
    if (!dynamic(x) && !dynamic(y) && x !== y) return false
  }
  return true
}
export function assertNoServerHandlerCollision(handlers: readonly { route?: string, method?: string }[], route: string, method: string): void {
  if (handlers.some(handler => handler.route && routePatternsCollide(handler.route, route) && (handler.method == null || handler.method.toLowerCase() === method.toLowerCase()))) throw new Error(`[dead-letter-operations] Server handler collision for ${method.toUpperCase()} ${normalizePath(route)}`)
}
type PageRoute = { name?: string, path?: string, file?: string, alias?: string | string[], children?: readonly PageRoute[] }
const joinPath = (parent: string, child: string) => child.startsWith('/') ? child : `${normalizePath(parent)}/${child}`
export function assertNoPageCollision(pages: readonly PageRoute[], name: string, path: string, ownedFile?: string): void {
  const inspect = (routes: readonly PageRoute[], parent = ''): boolean => routes.some((page) => {
    if (ownedFile && (page.file === ownedFile || (page.name === name && normalizePath(page.path ?? '') === normalizePath(path)))) return false
    const fullPath = joinPath(parent, page.path ?? '')
    const aliases = page.alias == null ? [] : Array.isArray(page.alias) ? page.alias : [page.alias]
    return page.name === name || routePatternsCollide(fullPath, path) || aliases.some(alias => routePatternsCollide(joinPath(parent, alias), path)) || inspect(page.children ?? [], fullPath)
  })
  if (inspect(pages)) throw new Error(`[dead-letter-operations] Page collision for ${name} at ${normalizePath(path)}`)
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@nuxt-laravelize/dead-letter-operations', configKey: 'laravelizeDeadLetterOperations', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: { enabled: false, pagePath: '/operations/dead-letters', apiPath: '/api/operations/dead-letters', allowedOrigins: [], pageSize: 25, errorSummaries: false },
  moduleDependencies: { '@nuxt-laravelize/core': {}, '@nuxt-laravelize/authorization': {} },
  setup(input, nuxt) {
    const options = resolveOptions(input)
    if (!options.enabled) return
    const resolver = createResolver(import.meta.url)
    nuxt.options.runtimeConfig.laravelizeDeadLetterOperations = { ...options, allowedOrigins: [...options.allowedOrigins] }
    nuxt.options.runtimeConfig.public.laravelizeDeadLetterOperations = { apiPath: options.apiPath }
    addLaravelizeProvider(nuxt, resolver.resolve('./runtime/server/DeadLetterOperationsServiceProvider'), 'server')
    addComponentsDir({ path: resolver.resolve('./runtime/components'), prefix: '' })
    const pageFile = resolver.resolve('./runtime/pages/DeadLetterOperationsPage.vue')
    extendPages((pages) => { assertNoPageCollision(pages, 'laravelize-dead-letter-operations', options.pagePath); pages.push({ name: 'laravelize-dead-letter-operations', path: options.pagePath, file: pageFile }) })
    const item = `${options.apiPath}/:source/:namespace/:deadLetterId`
    const routes = [
      [`${options.apiPath}/bootstrap`, 'GET', 'bootstrap.get'], [`${options.apiPath}`, 'GET', 'list.get'], [item, 'GET', 'detail.get'], [`${item}/payload`, 'GET', 'payload.get'], [`${item}/retry`, 'POST', 'retry.post'], [`${item}/discard`, 'POST', 'discard.post'],
    ] as const
    const ownedHandlers = new Set<string>()
    for (const [route, method, file] of routes) { assertNoServerHandlerCollision(nuxt.options.serverHandlers, route, method); const handler = resolver.resolve(`./runtime/server/api/${file}.ts`); ownedHandlers.add(handler); addServerHandler({ route, method, handler }) }
    nuxt.hook('pages:resolved', pages => assertNoPageCollision(pages, 'laravelize-dead-letter-operations', options.pagePath, pageFile))
    nuxt.hook('nitro:config', (config) => {
      const handlers = (config.handlers ?? []).filter((handler): handler is NonNullable<typeof handler> => handler != null && !ownedHandlers.has(String(handler.handler)))
      for (const [route, method] of routes) assertNoServerHandlerCollision(handlers, route, method)
    })
    ;(nuxt.hooks as { hook(name: 'nitro:init', callback: (nitro: { scannedHandlers?: Array<{ route?: string, method?: string, handler?: string } | undefined>, options: { handlers?: Array<{ route?: string, method?: string, handler?: string } | undefined> } }) => void): void }).hook('nitro:init', (nitro) => {
      const handlers = [...(nitro.scannedHandlers ?? []), ...(nitro.options.handlers ?? [])].filter((handler): handler is NonNullable<typeof handler> => handler != null && !ownedHandlers.has(String(handler.handler)))
      for (const [route, method] of routes) assertNoServerHandlerCollision(handlers, route, method)
    })
  },
})

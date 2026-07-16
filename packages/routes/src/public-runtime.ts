export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'
export type RouteScalar = string | number

export interface Routable {
  toRoute(): RouteScalar
}

export type RouteValue = RouteScalar | Routable
export type QueryValue = RouteValue | boolean | null | undefined
export type RouteQuery = Record<string, QueryValue | readonly QueryValue[]>

export interface RouteDefinition<Method extends HttpMethod = HttpMethod, Path extends string = string> {
  readonly method: Method
  readonly path: Path
}

type StripModifier<Value extends string> = Value extends `${infer Name}?` | `${infer Name}*` | `${infer Name}+` ? Name : Value
type ParameterEntries<Path extends string>
  = Path extends `${string}{${infer Parameter}}${infer Rest}` ? Parameter | ParameterEntries<Rest> : never
type OptionalEntries<Path extends string> = Extract<ParameterEntries<Path>, `${string}?` | `${string}*`>
type RequiredEntries<Path extends string> = Exclude<ParameterEntries<Path>, OptionalEntries<Path>>
type NonEmptyRouteValues = readonly [RouteValue, ...RouteValue[]]
type RequiredParameters<Path extends string> = { [Key in RequiredEntries<Path> as StripModifier<Key>]: Key extends `${string}+` ? RouteValue | NonEmptyRouteValues : RouteValue }
type OptionalParameters<Path extends string> = { [Key in OptionalEntries<Path> as StripModifier<Key>]?: Key extends `${string}*` ? RouteValue | readonly RouteValue[] : RouteValue }
export type RouteParameters<Path extends string> = RequiredParameters<Path> & OptionalParameters<Path>

export interface RouteOptions { readonly query?: RouteQuery }
export interface RouteResult<Method extends HttpMethod = HttpMethod> { readonly url: string, readonly method: Method }

type HasParameters<Path extends string> = [ParameterEntries<Path>] extends [never] ? false : true
type RouteCall<Path extends string, Method extends HttpMethod> = HasParameters<Path> extends true
  ? (parameters: RouteParameters<Path>, options?: RouteOptions) => RouteResult<Method>
  : (options?: RouteOptions) => RouteResult<Method>

export type Route<Path extends string = string, Method extends HttpMethod = HttpMethod> = RouteCall<Path, Method> & {
  readonly definition: RouteDefinition<Method, Path>
  url: RouteCall<Path, Method> extends (...arguments_: infer Arguments) => unknown ? (...arguments_: Arguments) => string : never
}

export type RouteTree = { readonly [name: string]: RouteTree | RouteDefinition }
export type BuiltRoutes<Tree extends RouteTree> = {
  readonly [Key in keyof Tree]: Tree[Key] extends RouteDefinition<infer Method, infer Path>
    ? Route<Path, Method>
    : Tree[Key] extends RouteTree ? BuiltRoutes<Tree[Key]> : never
}

export interface DefineRoutesOptions { readonly baseURL?: string }

export function route<const Method extends HttpMethod, const Path extends string>(method: Method, path: Path): RouteDefinition<Method, Path> {
  return Object.freeze({ method, path })
}

function routeValue(value: RouteValue): RouteScalar {
  return typeof value === 'object' ? value.toRoute() : value
}

function queryString(query?: RouteQuery): string {
  if (!query) return ''
  const entries: Array<[string, string]> = []
  for (const key of Object.keys(query).sort()) {
    const rawValues = Array.isArray(query[key]) ? query[key] : [query[key]]
    for (const rawValue of rawValues) {
      if (rawValue === null || rawValue === undefined) continue
      const value = typeof rawValue === 'boolean' ? (rawValue ? '1' : '0') : String(routeValue(rawValue))
      entries.push([key, value])
    }
  }
  const encoded = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  return encoded ? `?${encoded}` : ''
}

function joinBaseURL(baseURL: string, path: string): string {
  if (!baseURL) return path
  return `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function compilePath(path: string, parameters: Record<string, RouteValue | readonly RouteValue[]>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, token: string) => {
    const modifier = token.at(-1)
    const optional = modifier === '?' || modifier === '*'
    const catchAll = modifier === '*' || modifier === '+'
    const name = optional || modifier === '+' ? token.slice(0, -1) : token
    const value = parameters[name]
    if (value === undefined || value === null) {
      if (optional) return ''
      throw new TypeError(`Missing required route parameter "${name}".`)
    }
    const values = Array.isArray(value) ? value : [value]
    if (!catchAll && values.length !== 1) throw new TypeError(`Route parameter "${name}" does not accept an array.`)
    if (catchAll && values.length === 0) {
      if (optional) return ''
      throw new TypeError(`Required catch-all route parameter "${name}" cannot be empty.`)
    }
    return values.map((item) => {
      const raw = String(routeValue(item))
      if (catchAll && !optional && raw.length === 0) {
        throw new TypeError(`Required catch-all route parameter "${name}" cannot be empty.`)
      }
      const segments = catchAll ? raw.split('/') : [raw]
      if (segments.some(segment => segment === '.' || segment === '..')) {
        throw new TypeError(`Route parameter "${name}" contains a forbidden dot segment.`)
      }
      return segments.map(segment => encodeURIComponent(segment)).join(catchAll ? '/' : '%2F')
    }).join('/')
  }).replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

function buildRoute<const Definition extends RouteDefinition>(definition: Definition, baseURL: string): Route<Definition['path'], Definition['method']> {
  const invoke = ((first?: Record<string, RouteValue | readonly RouteValue[]> | RouteOptions, second?: RouteOptions) => {
    const hasParameters = /\{[^}]+\}/.test(definition.path)
    const parameters = (hasParameters ? first : {}) as Record<string, RouteValue | readonly RouteValue[]>
    const options = (hasParameters ? second : first) as RouteOptions | undefined
    return { url: `${joinBaseURL(baseURL, compilePath(definition.path, parameters))}${queryString(options?.query)}`, method: definition.method }
  }) as Route<Definition['path'], Definition['method']>
  Object.defineProperty(invoke, 'definition', { value: definition, enumerable: true })
  invoke.url = ((...arguments_: unknown[]) => (invoke as (...values: unknown[]) => RouteResult)(...arguments_).url) as typeof invoke.url
  return invoke
}

export function defineRoutes<const Tree extends RouteTree>(tree: Tree, options: DefineRoutesOptions = {}): BuiltRoutes<Tree> {
  const visit = (node: RouteTree): BuiltRoutes<RouteTree> => Object.fromEntries(Object.entries(node).map(([name, value]) => [name,
    isRouteDefinition(value) ? buildRoute(value, options.baseURL ?? '') : visit(value),
  ])) as BuiltRoutes<RouteTree>
  return visit(tree) as BuiltRoutes<Tree>
}

function isRouteDefinition(value: RouteTree | RouteDefinition): value is RouteDefinition {
  return 'method' in value && 'path' in value
}

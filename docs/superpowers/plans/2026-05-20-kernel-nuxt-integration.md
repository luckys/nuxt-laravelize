# F0-B Implementation Plan — Integración Nuxt del Kernel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el núcleo del contenedor (F0-A) al ciclo de vida real de Nuxt, de modo que `useContainer()` devuelva un contenedor con todos los providers registrados y *booted*, tanto en el servidor (Nitro) como en el cliente.

**Architecture:** `module.ts` descubre providers en build-time desde tres fuentes (convención de carpetas, config y API), genera dos módulos virtuales con imports estáticos (`#laravelize/server-providers` y `#laravelize/client-providers`), e inyecta un plugin de Nitro y un plugin de Nuxt que crean su propio `Container`, instancian un `Kernel` con los providers correspondientes y ejecutan `boot()`. En el servidor, cada request HTTP obtiene un `createScope()`; en el cliente el contenedor es único por sesión SPA.

**Tech Stack:** `@nuxt/kit` (`defineNuxtModule`, `addPlugin`, `addServerPlugin`, `addTemplate`, `addImports`, `useLogger`), `nitropack` (`defineNitroPlugin`), `h3` (`H3Event`), Vitest 4, `@nuxt/test-utils` para integración.

---

## Pre-condiciones

Antes de empezar este plan se debe haber completado **F0-A** (`docs/superpowers/plans/2026-05-19-kernel-container-core.md`). Esto significa que en `main` existen:

- `src/core/container/Token.ts`
- `src/core/container/ContainerErrors.ts`
- `src/core/container/Container.ts` (exporta `createContainer`, `Container`, `Resolver`, `ServiceFactory`)
- `src/core/providers/ServiceProvider.ts`
- `src/core/providers/Kernel.ts` (exporta `Kernel`, `ServiceProviderClass`)
- 23 tests verdes en `test/core/`.

Si alguno de los archivos anteriores no existe o sus tests no pasan, **detente** y resuelve F0-A primero.

---

## Task 1: Limpieza preparatoria

Esta tarea no añade funcionalidad nueva: borra código muerto y stubs falsos para que el resto del plan parta de una base limpia. No usa TDD (no hay nuevo comportamiento que probar). Se valida con `pnpm build`, `pnpm lint`, `pnpm typecheck` y los tests existentes de `test/core` siguen verdes.

**Files:**
- Delete: `src/shims.d.ts`
- Delete: `src/core/container/NuxtLaravelizeContainer.ts`
- Delete: `test/basic.test.ts`
- Modify: `src/runtime/plugin.ts` (sustituye el placeholder por un stub mínimo que el Task 5 reescribirá)
- Modify: `src/nitro/plugin.ts` (sustituye el plugin viejo por un stub mínimo que el Task 4 reescribirá)
- Modify: `src/runtime/composables/useContainer.ts` (stub temporal que el Task 5 reescribirá)
- Modify: `src/runtime/server/utils/useContainer.ts` (stub temporal que el Task 4 reescribirá)
- Modify: `src/module.ts` (mantiene el shape mínimo necesario para que el módulo siga registrándose; Task 6 lo completa)
- Modify: `package.json` (elimina el export `./frontend`)

- [ ] **Step 1: Eliminar archivos muertos**

```bash
rm src/shims.d.ts
rm src/core/container/NuxtLaravelizeContainer.ts
rm test/basic.test.ts
```

- [ ] **Step 2: Sustituir `src/nitro/plugin.ts` por stub**

```ts
import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin(() => {})
```

- [ ] **Step 3: Sustituir `src/runtime/plugin.ts` por stub**

```ts
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin(() => {})
```

- [ ] **Step 4: Sustituir `src/runtime/composables/useContainer.ts` por stub**

```ts
import { ContainerNotAvailableError } from '../../core/container/ContainerErrors'

export function useContainer(): never {
  throw new ContainerNotAvailableError('client')
}
```

- [ ] **Step 5: Sustituir `src/runtime/server/utils/useContainer.ts` por stub**

```ts
import type { H3Event } from 'h3'

import { ContainerNotAvailableError } from '../../../core/container/ContainerErrors'

export function useContainer(_event: H3Event): never {
  throw new ContainerNotAvailableError('server')
}
```

- [ ] **Step 6: Simplificar `src/module.ts`**

Sustituye el contenido completo por:

```ts
import { addImportsDir, addPlugin, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  container: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-laravelize',
    configKey: 'laravelize',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    container: true,
  },
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)
    addPlugin(resolver.resolve('./runtime/plugin'))
    addServerPlugin(resolver.resolve('./nitro/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
  },
})
```

- [ ] **Step 7: Eliminar export `./frontend` de `package.json`**

Abre `package.json` y borra la entrada `"./frontend"` del objeto `exports`. La forma exacta depende del estado actual; tras la edición, el bloque `exports` debe conservar solo el export raíz `"."`.

- [ ] **Step 8: Verificar typecheck, lint, build y tests del core**

Run: `pnpm typecheck && pnpm lint && pnpm build && pnpm exec vitest run test/core`
Expected: typecheck limpio, lint limpio, build OK, 23 tests verdes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: remove dead bootstrap, stubs, shims and frontend export"
```

---

## Task 2: Descubrimiento de providers por convención

Función pura que, dado un `rootDir`, devuelve dos listas de rutas absolutas: una para el servidor (`server/providers/**` + `shared/providers/**`) y otra para el cliente (`app/providers/**` + `shared/providers/**`). Se prueba con un fixture en disco.

**Files:**
- Create: `src/discovery/byConvention.ts`
- Create: `test/discovery/byConvention.test.ts`
- Create (fixtures): `test/discovery/__fixtures__/withProviders/` con subcarpetas y archivos vacíos (ver Step 1).

- [ ] **Step 1: Crear el fixture**

Estructura de archivos del fixture (todos los archivos `.ts` están vacíos: el descubrimiento solo mira el path, no el contenido):

```
test/discovery/__fixtures__/withProviders/
  app/providers/AuthProvider.ts
  app/providers/nested/UiProvider.ts
  server/providers/DatabaseProvider.ts
  shared/providers/LoggingProvider.ts
```

Y un fixture vacío:

```
test/discovery/__fixtures__/empty/
  .gitkeep
```

Crea los archivos con `touch` (o equivalente). El contenido es irrelevante.

- [ ] **Step 2: Escribir el test que falla**

Crea `test/discovery/byConvention.test.ts`:

```ts
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { discoverProvidersByConvention } from '../../src/discovery/byConvention'

const fixturesRoot = resolve(__dirname, '__fixtures__')

describe('discoverProvidersByConvention', () => {
  it('finds server providers from server/providers and shared/providers recursively', () => {
    const rootDir = resolve(fixturesRoot, 'withProviders')

    const result = discoverProvidersByConvention(rootDir)

    expect(result.server.sort()).toEqual([
      resolve(rootDir, 'server/providers/DatabaseProvider.ts'),
      resolve(rootDir, 'shared/providers/LoggingProvider.ts'),
    ].sort())
  })

  it('finds client providers from app/providers (recursive) and shared/providers', () => {
    const rootDir = resolve(fixturesRoot, 'withProviders')

    const result = discoverProvidersByConvention(rootDir)

    expect(result.client.sort()).toEqual([
      resolve(rootDir, 'app/providers/AuthProvider.ts'),
      resolve(rootDir, 'app/providers/nested/UiProvider.ts'),
      resolve(rootDir, 'shared/providers/LoggingProvider.ts'),
    ].sort())
  })

  it('returns empty lists when no provider directories exist', () => {
    const rootDir = resolve(fixturesRoot, 'empty')

    const result = discoverProvidersByConvention(rootDir)

    expect(result).toEqual({ server: [], client: [] })
  })
})
```

- [ ] **Step 3: Ejecutar el test y confirmar que falla**

Run: `pnpm exec vitest run test/discovery/byConvention.test.ts`
Expected: FAIL — `Cannot find module '../../src/discovery/byConvention'`.

- [ ] **Step 4: Implementación mínima**

Crea `src/discovery/byConvention.ts`:

```ts
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
```

- [ ] **Step 5: Ejecutar el test y confirmar que pasa**

Run: `pnpm exec vitest run test/discovery/byConvention.test.ts`
Expected: PASS — 3 tests pasan.

- [ ] **Step 6: Lint y typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/discovery/byConvention.ts test/discovery/byConvention.test.ts test/discovery/__fixtures__/
git commit -m "feat: add provider discovery by folder convention"
```

---

## Task 3: Colector de providers (convención + config + API)

Combina las tres fuentes de providers en dos listas finales (servidor y cliente). Aporta el helper público `addLaravelizeProvider(nuxt, path, target)` que otros módulos pueden usar para inyectar sus providers durante el `setup()` de Nuxt.

**Files:**
- Create: `src/discovery/ProviderCollector.ts`
- Create: `src/kit.ts` (export público para consumidores)
- Create: `test/discovery/ProviderCollector.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `test/discovery/ProviderCollector.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { ProviderCollector } from '../../src/discovery/ProviderCollector'

describe('ProviderCollector', () => {
  it('combines convention, config and api inputs into deduplicated server and client lists', () => {
    const collector = new ProviderCollector()

    collector.addFromConvention({
      server: ['/root/server/providers/A.ts'],
      client: ['/root/app/providers/B.ts'],
    })
    collector.addFromConfig([
      '/root/server/providers/A.ts',
      '/root/extra/SharedProvider.ts',
    ], 'shared')
    collector.addFromConfig(['/root/extra/ServerOnly.ts'], 'server')
    collector.addFromApi('/root/extra/ClientOnly.ts', 'client')

    const result = collector.collect()

    expect(result.server.sort()).toEqual([
      '/root/extra/ServerOnly.ts',
      '/root/extra/SharedProvider.ts',
      '/root/server/providers/A.ts',
    ].sort())

    expect(result.client.sort()).toEqual([
      '/root/app/providers/B.ts',
      '/root/extra/ClientOnly.ts',
      '/root/extra/SharedProvider.ts',
    ].sort())
  })

  it('preserves insertion order within each target list when there are no duplicates', () => {
    const collector = new ProviderCollector()

    collector.addFromConfig(['/root/Z.ts'], 'server')
    collector.addFromConfig(['/root/A.ts'], 'server')

    const result = collector.collect()

    expect(result.server).toEqual(['/root/Z.ts', '/root/A.ts'])
  })

  it('skips duplicate entries silently', () => {
    const collector = new ProviderCollector()

    collector.addFromConfig(['/root/A.ts'], 'server')
    collector.addFromApi('/root/A.ts', 'server')

    const result = collector.collect()

    expect(result.server).toEqual(['/root/A.ts'])
  })
})
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm exec vitest run test/discovery/ProviderCollector.test.ts`
Expected: FAIL — `Cannot find module '../../src/discovery/ProviderCollector'`.

- [ ] **Step 3: Implementación mínima del collector**

Crea `src/discovery/ProviderCollector.ts`:

```ts
import type { DiscoveredProviders } from './byConvention'

export type ProviderTarget = 'server' | 'client' | 'shared'

export class ProviderCollector {
  readonly #server = new Set<string>()
  readonly #client = new Set<string>()

  addFromConvention(discovered: DiscoveredProviders): void {
    for (const path of discovered.server) {
      this.#server.add(path)
    }

    for (const path of discovered.client) {
      this.#client.add(path)
    }
  }

  addFromConfig(paths: readonly string[], target: ProviderTarget): void {
    for (const path of paths) {
      this.#addOne(path, target)
    }
  }

  addFromApi(path: string, target: ProviderTarget): void {
    this.#addOne(path, target)
  }

  collect(): DiscoveredProviders {
    return {
      server: [...this.#server],
      client: [...this.#client],
    }
  }

  #addOne(path: string, target: ProviderTarget): void {
    if (target === 'server' || target === 'shared') {
      this.#server.add(path)
    }

    if (target === 'client' || target === 'shared') {
      this.#client.add(path)
    }
  }
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `pnpm exec vitest run test/discovery/ProviderCollector.test.ts`
Expected: PASS — 3 tests pasan.

- [ ] **Step 5: Exponer el helper público `addLaravelizeProvider`**

Crea `src/kit.ts`:

```ts
import type { Nuxt } from '@nuxt/schema'

import type { ProviderTarget } from './discovery/ProviderCollector'

const collectorKey = Symbol.for('nuxt-laravelize.collector')

interface CollectorHost {
  [collectorKey]?: {
    queue: Array<{ path: string, target: ProviderTarget }>
  }
}

export function addLaravelizeProvider(nuxt: Nuxt, path: string, target: ProviderTarget): void {
  const host = nuxt as unknown as CollectorHost
  const store = host[collectorKey] ?? { queue: [] }
  store.queue.push({ path, target })
  host[collectorKey] = store
}

export function drainLaravelizeProviderQueue(nuxt: Nuxt): Array<{ path: string, target: ProviderTarget }> {
  const host = nuxt as unknown as CollectorHost
  const store = host[collectorKey]
  if (!store) {
    return []
  }

  const queue = store.queue.slice()
  store.queue.length = 0
  return queue
}

export type { ProviderTarget } from './discovery/ProviderCollector'
```

**Nota:** el helper guarda los providers en una propiedad simbólica del objeto `nuxt` para evitar usar variables globales. `drainLaravelizeProviderQueue` se llama una sola vez desde `module.ts` (Task 6) para integrar la cola en el collector.

- [ ] **Step 6: Lint y typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/discovery/ProviderCollector.ts src/kit.ts test/discovery/ProviderCollector.test.ts
git commit -m "feat: add provider collector and addLaravelizeProvider helper"
```

---

## Task 4: Plugin de Nitro y server util

Implementa el bootstrap real del servidor: el plugin de Nitro crea el `Container` raíz, instancia el `Kernel` con los providers del módulo virtual `#laravelize/server-providers` y ejecuta `await kernel.boot()`. En el hook `request`, atacha un `createScope()` al `event.context`. El server util `useContainer(event)` lo extrae.

Las pruebas reales del comportamiento de estos archivos se hacen en el Task 7 con `@nuxt/test-utils`. Esta tarea garantiza que typecheck y lint son verdes y que el código está completo.

**Files:**
- Modify: `src/nitro/plugin.ts`
- Modify: `src/runtime/server/utils/useContainer.ts`
- Create: `src/runtime/server/laravelize-context.d.ts` (extiende los tipos de `h3` con la propiedad de contexto)

- [ ] **Step 1: Extender el tipo del contexto de h3**

Crea `src/runtime/server/laravelize-context.d.ts`:

```ts
import type { Container } from '../../core/container/Container'

declare module 'h3' {
  interface H3EventContext {
    laravelizeContainer?: Container
  }
}

export {}
```

- [ ] **Step 2: Reescribir `src/nitro/plugin.ts`**

```ts
import { defineNitroPlugin } from 'nitropack/runtime'

import serverProviders from '#laravelize/server-providers'
import { createContainer } from '../core/container/Container'
import { Kernel } from '../core/providers/Kernel'

import '../runtime/server/laravelize-context'

export default defineNitroPlugin(async (nitroApp) => {
  const rootContainer = createContainer()
  const kernel = new Kernel(rootContainer, serverProviders)
  await kernel.boot()

  nitroApp.hooks.hook('request', (event) => {
    event.context.laravelizeContainer = rootContainer.createScope()
  })
})
```

- [ ] **Step 3: Reescribir `src/runtime/server/utils/useContainer.ts`**

```ts
import type { H3Event } from 'h3'

import type { Container } from '../../../core/container/Container'
import { ContainerNotAvailableError } from '../../../core/container/ContainerErrors'

import '../laravelize-context'

export function useContainer(event: H3Event): Container {
  const container = event.context.laravelizeContainer
  if (!container) {
    throw new ContainerNotAvailableError('server')
  }

  return container
}
```

- [ ] **Step 4: Crear un stub temporal del módulo virtual para que typecheck pase**

`#laravelize/server-providers` se genera en runtime por Task 6, pero el typecheck necesita verlo. Crea `src/types/virtual-modules.d.ts`:

```ts
declare module '#laravelize/server-providers' {
  import type { ServiceProviderClass } from '../core/providers/Kernel'

  const providers: ServiceProviderClass[]
  export default providers
}

declare module '#laravelize/client-providers' {
  import type { ServiceProviderClass } from '../core/providers/Kernel'

  const providers: ServiceProviderClass[]
  export default providers
}
```

- [ ] **Step 5: Lint y typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores. Si typecheck quejas por `nitropack/runtime`, ya está disponible: viene como dependencia transitiva de `@nuxt/kit`. Si typecheck quejas por `defineNitroPlugin`, verifica que el `tsconfig.json` raíz incluye `src/` (que ya lo hace).

- [ ] **Step 6: Commit**

```bash
git add src/nitro/plugin.ts src/runtime/server/utils/useContainer.ts src/runtime/server/laravelize-context.d.ts src/types/virtual-modules.d.ts
git commit -m "feat: bootstrap server container in nitro plugin"
```

---

## Task 5: Plugin de cliente y composable

Implementa el bootstrap del cliente: el plugin Nuxt async crea el `Container`, instancia el `Kernel` con los providers de `#laravelize/client-providers` y ejecuta `await kernel.boot()`. Provee el contenedor en `nuxtApp.$laravelizeContainer`. El composable `useContainer()` lo expone.

**Files:**
- Modify: `src/runtime/plugin.ts`
- Modify: `src/runtime/composables/useContainer.ts`
- Create: `src/runtime/types.d.ts` (extiende los tipos de `#app` con la propiedad inyectada)

- [ ] **Step 1: Extender los tipos del nuxtApp**

Crea `src/runtime/types.d.ts`:

```ts
import type { Container } from '../core/container/Container'

declare module '#app' {
  interface NuxtApp {
    $laravelizeContainer: Container
  }
}

export {}
```

- [ ] **Step 2: Reescribir `src/runtime/plugin.ts`**

```ts
import { defineNuxtPlugin } from '#app'

import clientProviders from '#laravelize/client-providers'
import { createContainer } from '../core/container/Container'
import { Kernel } from '../core/providers/Kernel'

import './types'

export default defineNuxtPlugin(async (nuxtApp) => {
  const container = createContainer()
  const kernel = new Kernel(container, clientProviders)
  await kernel.boot()

  nuxtApp.provide('laravelizeContainer', container)
})
```

- [ ] **Step 3: Reescribir `src/runtime/composables/useContainer.ts`**

```ts
import { useNuxtApp } from '#app'

import type { Container } from '../../core/container/Container'
import { ContainerNotAvailableError } from '../../core/container/ContainerErrors'

import '../types'

export function useContainer(): Container {
  const nuxtApp = useNuxtApp()
  const container = nuxtApp.$laravelizeContainer
  if (!container) {
    throw new ContainerNotAvailableError('client')
  }

  return container
}
```

- [ ] **Step 4: Lint y typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/plugin.ts src/runtime/composables/useContainer.ts src/runtime/types.d.ts
git commit -m "feat: bootstrap client container in nuxt plugin"
```

---

## Task 6: `module.ts` — descubrimiento, virtual modules y wiring

El `module.ts` es la pieza que une todo en build-time: descubre providers por convención, los combina con los del usuario (`laravelize.providers` en `nuxt.config`) y con los registrados vía API, genera los dos módulos virtuales con imports estáticos y registra plugins/imports.

**Files:**
- Modify: `src/module.ts`
- Create: `src/templates.ts` (genera el contenido de los virtual modules)
- Create: `test/templates.test.ts`

- [ ] **Step 1: Escribir el test que falla para los templates**

Crea `test/templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { renderProvidersModule } from '../src/templates'

describe('renderProvidersModule', () => {
  it('returns an empty providers array when there are no providers', () => {
    const content = renderProvidersModule([])

    expect(content).toBe('export default [] as const\n')
  })

  it('imports each provider as a default export and references it in the array', () => {
    const content = renderProvidersModule([
      '/root/app/providers/AuthProvider.ts',
      '/root/shared/providers/LoggingProvider.ts',
    ])

    expect(content).toBe([
      'import provider0 from \'/root/app/providers/AuthProvider.ts\'',
      'import provider1 from \'/root/shared/providers/LoggingProvider.ts\'',
      '',
      'export default [provider0, provider1] as const',
      '',
    ].join('\n'))
  })

  it('strips the .ts extension from import specifiers', () => {
    const content = renderProvidersModule(['/root/app/providers/AuthProvider.ts'])

    expect(content).toContain('import provider0 from \'/root/app/providers/AuthProvider\'')
  })
})
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm exec vitest run test/templates.test.ts`
Expected: FAIL — `Cannot find module '../src/templates'`.

- [ ] **Step 3: Implementación de `src/templates.ts`**

```ts
export function renderProvidersModule(absolutePaths: readonly string[]): string {
  if (absolutePaths.length === 0) {
    return 'export default [] as const\n'
  }

  const imports = absolutePaths.map((path, index) => {
    const specifier = path.replace(/\.ts$/, '')
    return `import provider${index} from '${specifier}'`
  })

  const references = absolutePaths.map((_, index) => `provider${index}`)

  return [
    ...imports,
    '',
    `export default [${references.join(', ')}] as const`,
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Ejecutar el test y confirmar que pasa**

Run: `pnpm exec vitest run test/templates.test.ts`
Expected: PASS — 3 tests pasan.

- [ ] **Step 5: Reescribir `src/module.ts`**

Reemplaza el contenido completo:

```ts
import { addImportsDir, addPlugin, addServerImportsDir, addServerPlugin, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'

import { discoverProvidersByConvention } from './discovery/byConvention'
import { ProviderCollector, type ProviderTarget } from './discovery/ProviderCollector'
import { drainLaravelizeProviderQueue } from './kit'
import { renderProvidersModule } from './templates'

export interface ModuleOptions {
  container: boolean
  providers: Array<{ path: string, target: ProviderTarget }>
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-laravelize',
    configKey: 'laravelize',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    container: true,
    providers: [],
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const collector = new ProviderCollector()

    collector.addFromConvention(discoverProvidersByConvention(nuxt.options.rootDir))

    for (const provider of options.providers) {
      collector.addFromConfig([provider.path], provider.target)
    }

    for (const entry of drainLaravelizeProviderQueue(nuxt)) {
      collector.addFromApi(entry.path, entry.target)
    }

    const collected = collector.collect()

    const serverTemplate = addTemplate({
      filename: 'laravelize/server-providers.mjs',
      getContents: () => renderProvidersModule(collected.server),
      write: true,
    })

    const clientTemplate = addTemplate({
      filename: 'laravelize/client-providers.mjs',
      getContents: () => renderProvidersModule(collected.client),
      write: true,
    })

    nuxt.options.alias['#laravelize/server-providers'] = serverTemplate.dst
    nuxt.options.alias['#laravelize/client-providers'] = clientTemplate.dst

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.alias = nitroConfig.alias ?? {}
      nitroConfig.alias['#laravelize/server-providers'] = serverTemplate.dst
      nitroConfig.alias['#laravelize/client-providers'] = clientTemplate.dst
    })

    addPlugin(resolver.resolve('./runtime/plugin'))
    addServerPlugin(resolver.resolve('./nitro/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
  },
})
```

- [ ] **Step 6: Lint, typecheck y build**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: lint OK, typecheck OK, build OK.

- [ ] **Step 7: Tests del core siguen verdes**

Run: `pnpm exec vitest run test/core test/discovery test/templates`
Expected: PASS — todos los tests verdes.

- [ ] **Step 8: Commit**

```bash
git add src/module.ts src/templates.ts test/templates.test.ts
git commit -m "feat: wire provider discovery and virtual modules in module setup"
```

---

## Task 7: Playground + tests de integración con `@nuxt/test-utils`

Validación end-to-end: providers reales en las tres carpetas de convención, una página que resuelve un servicio en servidor y cliente, y dos tests de integración que verifican los criterios de aceptación 1, 2 y 3 del spec.

**Files:**
- Create: `playground/shared/providers/CounterProvider.ts`
- Create: `playground/shared/providers/tokens.ts`
- Create: `playground/server/providers/RequestIdProvider.ts`
- Create: `playground/server/providers/serverTokens.ts`
- Create: `playground/server/api/laravelize.get.ts`
- Modify: `playground/app.vue`
- Modify: `playground/nuxt.config.ts` (asegúrate de que el módulo está habilitado)
- Create: `test/integration/laravelize.test.ts`

- [ ] **Step 1: Crear tokens compartidos del playground**

Crea `playground/shared/providers/tokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'

export const counterToken = createToken<{ next: () => number }>('playground.counter')
```

Y `playground/server/providers/serverTokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'

export const requestIdToken = createToken<string>('playground.requestId')
```

- [ ] **Step 2: Crear el provider compartido (singleton)**

`playground/shared/providers/CounterProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'
import { counterToken } from './tokens'

export default class CounterProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(counterToken, () => {
      let current = 0
      return {
        next: () => {
          current += 1
          return current
        },
      }
    })
  }
}
```

- [ ] **Step 3: Crear el provider de servidor (scoped)**

`playground/server/providers/RequestIdProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'
import { requestIdToken } from './serverTokens'

export default class RequestIdProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(requestIdToken, () => crypto.randomUUID())
  }
}
```

- [ ] **Step 4: Crear la API que expone los servicios resueltos**

`playground/server/api/laravelize.get.ts`:

```ts
import { defineEventHandler } from 'h3'

import { counterToken } from '../../shared/providers/tokens'
import { requestIdToken } from '../providers/serverTokens'

export default defineEventHandler((event) => {
  const container = useContainer(event)
  const counter = container.make(counterToken)
  const requestId = container.make(requestIdToken)

  return {
    counterValue: counter.next(),
    requestId,
  }
})
```

**Nota:** `useContainer` se obtiene por auto-import gracias a `addServerImportsDir` en Task 6.

- [ ] **Step 5: Actualizar `playground/app.vue` con el composable cliente**

```vue
<script setup lang="ts">
import { counterToken } from './shared/providers/tokens'

const container = useContainer()
const counter = container.make(counterToken)
const firstValue = counter.next()
const secondValue = counter.next()
</script>

<template>
  <div>
    <p data-testid="first-value">{{ firstValue }}</p>
    <p data-testid="second-value">{{ secondValue }}</p>
  </div>
</template>
```

- [ ] **Step 6: Verificar `playground/nuxt.config.ts`**

Asegúrate de que el módulo aparece en `modules: ['../src/module']` (o el path correcto al módulo). No hace falta `laravelize: { ... }` porque las defaults son válidas.

- [ ] **Step 7: Escribir los tests de integración**

Crea `test/integration/laravelize.test.ts`:

```ts
import { fileURLToPath } from 'node:url'

import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({
  rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  server: true,
  browser: false,
})

describe('nuxt-laravelize integration', () => {
  it('exposes resolved services through the server util on each request', async () => {
    const first = await $fetch<{ counterValue: number, requestId: string }>('/api/laravelize')
    const second = await $fetch<{ counterValue: number, requestId: string }>('/api/laravelize')

    expect(first.counterValue).toBe(1)
    expect(second.counterValue).toBe(2)

    expect(first.requestId).not.toBe(second.requestId)
  })

  it('serves a page that uses the client container without errors', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('data-testid="first-value"')
    expect(html).toContain('data-testid="second-value"')
  })
})
```

- [ ] **Step 8: Ejecutar la suite de integración**

Run: `pnpm exec vitest run test/integration/laravelize.test.ts`
Expected: PASS — 2 tests pasan.

Si `@nuxt/test-utils` no está instalado como `devDependency`, instálalo: `pnpm add -D @nuxt/test-utils @vue/test-utils playwright-core`. Verifica que `@vue/test-utils` y `playwright-core` aparezcan también como `peerDependencies` opcionales si la versión de `@nuxt/test-utils` lo requiere.

- [ ] **Step 9: Suite completa verde**

Run: `pnpm exec vitest run`
Expected: PASS — todos los tests (core + discovery + templates + integration) verdes.

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: lint OK, typecheck OK, build OK.

- [ ] **Step 10: Commit**

```bash
git add playground/ test/integration/ package.json pnpm-lock.yaml
git commit -m "feat: validate kernel integration with playground and e2e tests"
```

---

## Cierre de F0-B

- [ ] **Verificación final**

Run: `pnpm exec vitest run`
Expected: la suite entera pasa (core + discovery + templates + integration).

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: sin errores.

- [ ] **Comprobación de criterios de aceptación del spec (sección 9)**

1. `useContainer()` devuelve un contenedor con providers booted — cubierto por Task 7 (api y app.vue).
2. `singleton` vs `scoped` vs `bind` — cubierto por Task 7 (`counter` singleton, `requestId` scoped).
3. `ServiceNotRegisteredError` ya cubierto por F0-A; los stubs de Task 1 lo propagan correctamente.
4. Descubrimiento desde 3 fuentes — cubierto por Tasks 2, 3 y 6.
5. `awilix` no aparece en la API pública — Task 1 borra el container viejo; el resto de tasks importa solo de `core/`.
6. `shims.d.ts` eliminado — Task 1.
7. Export `./frontend` eliminado — Task 1.
8. Suite verde — verificación final.

Tras este plan, F0 completo: el contenedor IoC, los providers, el kernel y la integración con Nuxt están operativos y testeados. F1 (HTTP / controllers / validation) puede arrancar sobre esta base.

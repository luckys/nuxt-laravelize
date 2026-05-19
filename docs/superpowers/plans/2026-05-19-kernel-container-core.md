# Kernel F0-A — Núcleo del contenedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el núcleo del contenedor IoC y el ciclo de vida de Service Providers de `nuxt-laravelize` como lógica pura en `src/core/`, sin tocar aún el bootstrap de Nuxt.

**Architecture:** Una fachada tipada (`Container`) con vocabulario Laravel (`bind` / `singleton` / `scoped` / `instance` / `make`) que encapsula `awilix` como motor — `awilix` solo se importa dentro de `Container.ts`. Tokens tipados dan inferencia de tipos en `make`. El `Kernel` orquesta los providers (`register` de todos → `boot` de todos → `seal`). Todo es lógica pura sin dependencias de Nuxt y se cubre con tests unitarios de Vitest. El plan es **aditivo**: crea archivos nuevos en `src/core/` y no modifica `src/module.ts`, `src/nitro/`, `src/runtime/` ni el antiguo `NuxtLaravelizeContainer.ts` (eso es F0-B).

**Tech Stack:** TypeScript 5.9, awilix 12.1.1, Vitest 4, pnpm.

**Spec de referencia:** `docs/superpowers/specs/2026-05-19-kernel-container-providers-design.md`

**Convenciones de código:** sin punto y coma, comillas simples, comas finales (estilo `@nuxt/eslint-config`); sin comentarios; un nivel de indentación por método; sin `else`.

---

## Task 1: Token tipado

**Files:**
- Create: `src/core/container/Token.ts`
- Test: `test/core/container/Token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/core/container/Token.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createToken } from '../../../src/core/container/Token'

describe('createToken', () => {
  it('creates a token carrying the given key', () => {
    const token = createToken<string>('database.url')

    expect(token.key).toBe('database.url')
  })

  it('creates tokens with independent keys', () => {
    const first = createToken<number>('first')
    const second = createToken<number>('second')

    expect(first.key).not.toBe(second.key)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/core/container/Token.test.ts`
Expected: FAIL — no se puede resolver el módulo `src/core/container/Token`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/container/Token.ts`:

```ts
declare const tokenTypeMarker: unique symbol

export interface Token<T> {
  readonly key: string
  readonly [tokenTypeMarker]?: T
}

export function createToken<T>(key: string): Token<T> {
  return { key } as Token<T>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/core/container/Token.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/core/container/Token.ts test/core/container/Token.test.ts
git commit -m "feat: add typed container token"
```

---

## Task 2: Errores tipados del contenedor

**Files:**
- Create: `src/core/container/ContainerErrors.ts`
- Test: `test/core/container/ContainerErrors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/core/container/ContainerErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  CircularDependencyError,
  ContainerNotAvailableError,
  KernelAlreadyBootedError,
  ProviderBootError,
  ServiceNotRegisteredError,
} from '../../../src/core/container/ContainerErrors'

describe('container errors', () => {
  it('ServiceNotRegisteredError includes the service key', () => {
    const error = new ServiceNotRegisteredError('mailer')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ServiceNotRegisteredError')
    expect(error.message).toContain('mailer')
  })

  it('CircularDependencyError includes the resolution details', () => {
    const error = new CircularDependencyError('a -> b -> a')

    expect(error.name).toBe('CircularDependencyError')
    expect(error.message).toContain('a -> b -> a')
  })

  it('ContainerNotAvailableError has a descriptive message', () => {
    const error = new ContainerNotAvailableError()

    expect(error.name).toBe('ContainerNotAvailableError')
    expect(error.message).toContain('not available')
  })

  it('ProviderBootError keeps the provider name and the original cause', () => {
    const cause = new Error('connection refused')
    const error = new ProviderBootError('DatabaseServiceProvider', cause)

    expect(error.name).toBe('ProviderBootError')
    expect(error.message).toContain('DatabaseServiceProvider')
    expect(error.cause).toBe(cause)
  })

  it('KernelAlreadyBootedError has a descriptive message', () => {
    const error = new KernelAlreadyBootedError()

    expect(error.name).toBe('KernelAlreadyBootedError')
    expect(error.message).toContain('booted')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/core/container/ContainerErrors.test.ts`
Expected: FAIL — no se puede resolver el módulo `src/core/container/ContainerErrors`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/container/ContainerErrors.ts`:

```ts
export class ServiceNotRegisteredError extends Error {
  constructor(serviceKey: string) {
    super(`Service not registered: "${serviceKey}"`)
    this.name = 'ServiceNotRegisteredError'
  }
}

export class CircularDependencyError extends Error {
  constructor(details: string) {
    super(`Circular dependency detected: ${details}`)
    this.name = 'CircularDependencyError'
  }
}

export class ContainerNotAvailableError extends Error {
  constructor() {
    super('Laravelize container is not available in this context')
    this.name = 'ContainerNotAvailableError'
  }
}

export class ProviderBootError extends Error {
  constructor(providerName: string, cause: unknown) {
    super(`Service provider "${providerName}" failed during boot`, { cause })
    this.name = 'ProviderBootError'
  }
}

export class KernelAlreadyBootedError extends Error {
  constructor() {
    super('Cannot register services after the kernel has booted')
    this.name = 'KernelAlreadyBootedError'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/core/container/ContainerErrors.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/core/container/ContainerErrors.ts test/core/container/ContainerErrors.test.ts
git commit -m "feat: add typed container errors"
```

---

## Task 3: Container (fachada sobre awilix)

**Files:**
- Create: `src/core/container/Container.ts`
- Test: `test/core/container/Container.test.ts`

**Notas de diseño:**
- `createContainer()` crea el contenedor raíz.
- El factory recibe un `Resolver` (interfaz estrecha: `make` / `has`). El factory se registra en `awilix` con `asFunction`; `awilix` le pasa su `cradle`, que se envuelve en un `CradleResolver` para que la resolución de dependencias respete el scope y la detección de ciclos de `awilix`.
- `make` traduce los errores de `awilix` a los errores tipados de Task 2; `awilix` nunca aflora en la API pública.
- `seal()` lo invocará el `Kernel` (Task 4); tras sellar, cualquier registro lanza `KernelAlreadyBootedError`.

- [ ] **Step 1: Write the failing test**

Create `test/core/container/Container.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createContainer } from '../../../src/core/container/Container'
import {
  CircularDependencyError,
  KernelAlreadyBootedError,
  ServiceNotRegisteredError,
} from '../../../src/core/container/ContainerErrors'
import { createToken } from '../../../src/core/container/Token'

describe('Container', () => {
  it('resolves a bound service through its factory', () => {
    const container = createContainer()
    const greetingToken = createToken<string>('greeting')

    container.bind(greetingToken, () => 'hello')

    expect(container.make(greetingToken)).toBe('hello')
  })

  it('bind produces a new instance on every make (transient)', () => {
    const container = createContainer()
    const token = createToken<object>('transient.obj')

    container.bind(token, () => ({}))

    expect(container.make(token)).not.toBe(container.make(token))
  })

  it('singleton produces the same instance on every make', () => {
    const container = createContainer()
    const token = createToken<object>('singleton.obj')

    container.singleton(token, () => ({}))

    expect(container.make(token)).toBe(container.make(token))
  })

  it('singleton caches falsy values instead of rebuilding them', () => {
    const container = createContainer()
    const token = createToken<number>('falsy.zero')
    let factoryCalls = 0

    container.singleton(token, () => {
      factoryCalls += 1
      return 0
    })

    expect(container.make(token)).toBe(0)
    expect(container.make(token)).toBe(0)
    expect(factoryCalls).toBe(1)
  })

  it('instance registers an already built value', () => {
    const container = createContainer()
    const token = createToken<{ name: string }>('config')
    const value = { name: 'laravelize' }

    container.instance(token, value)

    expect(container.make(token)).toBe(value)
  })

  it('make throws ServiceNotRegisteredError for an unknown token', () => {
    const container = createContainer()
    const token = createToken<string>('missing')

    expect(() => container.make(token)).toThrow(ServiceNotRegisteredError)
  })

  it('has reports whether a token is registered', () => {
    const container = createContainer()
    const token = createToken<string>('known')

    expect(container.has(token)).toBe(false)
    container.bind(token, () => 'value')
    expect(container.has(token)).toBe(true)
  })

  it('resolves dependencies between services through the factory resolver', () => {
    const container = createContainer()
    const dependencyToken = createToken<number>('dependency')
    const consumerToken = createToken<number>('consumer')

    container.singleton(dependencyToken, () => 21)
    container.singleton(consumerToken, (resolver) => resolver.make(dependencyToken) * 2)

    expect(container.make(consumerToken)).toBe(42)
  })

  it('throws CircularDependencyError when two services depend on each other', () => {
    const container = createContainer()
    const aToken = createToken<string>('cycle.a')
    const bToken = createToken<string>('cycle.b')

    container.singleton(aToken, (resolver) => resolver.make(bToken))
    container.singleton(bToken, (resolver) => resolver.make(aToken))

    expect(() => container.make(aToken)).toThrow(CircularDependencyError)
  })

  it('shares singletons but isolates scoped services across scopes', () => {
    const container = createContainer()
    const singletonToken = createToken<object>('shared')
    const scopedToken = createToken<object>('per-scope')

    container.singleton(singletonToken, () => ({}))
    container.scoped(scopedToken, () => ({}))

    const firstScope = container.createScope()
    const secondScope = container.createScope()

    expect(firstScope.make(singletonToken)).toBe(secondScope.make(singletonToken))
    expect(firstScope.make(scopedToken)).toBe(firstScope.make(scopedToken))
    expect(firstScope.make(scopedToken)).not.toBe(secondScope.make(scopedToken))
  })

  it('rejects registrations after the container is sealed', () => {
    const container = createContainer()
    const token = createToken<string>('late')

    container.seal()

    expect(() => container.bind(token, () => 'too late')).toThrow(KernelAlreadyBootedError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/core/container/Container.test.ts`
Expected: FAIL — no se puede resolver el módulo `src/core/container/Container`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/container/Container.ts`:

```ts
import {
  asFunction,
  asValue,
  AwilixResolutionError,
  createContainer as createAwilixContainer,
  Lifetime,
  type AwilixContainer,
  type LifetimeType,
} from 'awilix'

import {
  CircularDependencyError,
  KernelAlreadyBootedError,
  ServiceNotRegisteredError,
} from './ContainerErrors'
import type { Token } from './Token'

export interface Resolver {
  make<T>(token: Token<T>): T
  has(token: Token<unknown>): boolean
}

export type ServiceFactory<T> = (resolver: Resolver) => T

export interface Container extends Resolver {
  bind<T>(token: Token<T>, factory: ServiceFactory<T>): void
  singleton<T>(token: Token<T>, factory: ServiceFactory<T>): void
  scoped<T>(token: Token<T>, factory: ServiceFactory<T>): void
  instance<T>(token: Token<T>, value: T): void
  createScope(): Container
  seal(): void
}

type Cradle = Record<string, unknown>

function translateResolutionError(error: unknown, serviceKey: string): Error {
  if (error instanceof CircularDependencyError || error instanceof ServiceNotRegisteredError) {
    return error
  }

  if (!(error instanceof AwilixResolutionError)) {
    return error instanceof Error ? error : new Error(String(error))
  }

  if (error.message.includes('Cyclic')) {
    return new CircularDependencyError(error.message)
  }

  return new ServiceNotRegisteredError(serviceKey)
}

class CradleResolver implements Resolver {
  readonly #cradle: Cradle
  readonly #owner: Resolver

  constructor(cradle: Cradle, owner: Resolver) {
    this.#cradle = cradle
    this.#owner = owner
  }

  make<T>(token: Token<T>): T {
    try {
      return this.#cradle[token.key] as T
    } catch (error) {
      throw translateResolutionError(error, token.key)
    }
  }

  has(token: Token<unknown>): boolean {
    return this.#owner.has(token)
  }
}

class AwilixBackedContainer implements Container {
  readonly #awilix: AwilixContainer
  #sealed = false

  constructor(awilixContainer: AwilixContainer) {
    this.#awilix = awilixContainer
  }

  bind<T>(token: Token<T>, factory: ServiceFactory<T>): void {
    this.#register(token, factory, Lifetime.TRANSIENT)
  }

  singleton<T>(token: Token<T>, factory: ServiceFactory<T>): void {
    this.#register(token, factory, Lifetime.SINGLETON)
  }

  scoped<T>(token: Token<T>, factory: ServiceFactory<T>): void {
    this.#register(token, factory, Lifetime.SCOPED)
  }

  instance<T>(token: Token<T>, value: T): void {
    this.#ensureNotSealed()
    this.#awilix.register(token.key, asValue(value))
  }

  make<T>(token: Token<T>): T {
    try {
      return this.#awilix.resolve<T>(token.key)
    } catch (error) {
      throw translateResolutionError(error, token.key)
    }
  }

  has(token: Token<unknown>): boolean {
    return this.#awilix.hasRegistration(token.key)
  }

  createScope(): Container {
    return new AwilixBackedContainer(this.#awilix.createScope())
  }

  seal(): void {
    this.#sealed = true
  }

  #register<T>(token: Token<T>, factory: ServiceFactory<T>, lifetime: LifetimeType): void {
    this.#ensureNotSealed()
    const owner = this
    this.#awilix.register(
      token.key,
      asFunction((cradle: Cradle) => factory(new CradleResolver(cradle, owner))).setLifetime(lifetime),
    )
  }

  #ensureNotSealed(): void {
    if (this.#sealed) {
      throw new KernelAlreadyBootedError()
    }
  }
}

export function createContainer(): Container {
  return new AwilixBackedContainer(createAwilixContainer())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/core/container/Container.test.ts`
Expected: PASS — 11 tests passed.

If the circular-dependency test fails because `awilix` does not surface a message containing `Cyclic`, inspect the actual error message thrown (log it temporarily) and adjust the substring check inside `translateResolutionError` to match the wording of awilix 12.1.1. Do not change the test.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/core/container/Container.ts test/core/container/Container.test.ts
git commit -m "feat: add awilix-backed container facade"
```

---

## Task 4: ServiceProvider y Kernel

**Files:**
- Create: `src/core/providers/ServiceProvider.ts`
- Create: `src/core/providers/Kernel.ts`
- Test: `test/core/providers/Kernel.test.ts`

**Nota:** `ServiceProvider` es solo una interfaz (sin runtime que probar). Se ejercita indirectamente a través de los tests del `Kernel`, que usa providers de prueba que la implementan.

- [ ] **Step 1: Create the ServiceProvider interface**

Create `src/core/providers/ServiceProvider.ts`:

```ts
import type { Container } from '../container/Container'

export interface ServiceProvider {
  register(container: Container): void
  boot?(container: Container): void | Promise<void>
}
```

- [ ] **Step 2: Write the failing test**

Create `test/core/providers/Kernel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createContainer, type Container } from '../../../src/core/container/Container'
import {
  KernelAlreadyBootedError,
  ProviderBootError,
} from '../../../src/core/container/ContainerErrors'
import { createToken } from '../../../src/core/container/Token'
import { Kernel } from '../../../src/core/providers/Kernel'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

describe('Kernel', () => {
  it('runs register on every provider before booting any of them', async () => {
    const events: string[] = []

    class FirstProvider implements ServiceProvider {
      register(): void {
        events.push('register:first')
      }

      boot(): void {
        events.push('boot:first')
      }
    }

    class SecondProvider implements ServiceProvider {
      register(): void {
        events.push('register:second')
      }

      boot(): void {
        events.push('boot:second')
      }
    }

    const kernel = new Kernel(createContainer(), [FirstProvider, SecondProvider])
    await kernel.boot()

    expect(events).toEqual([
      'register:first',
      'register:second',
      'boot:first',
      'boot:second',
    ])
  })

  it('makes registered services resolvable after boot', async () => {
    const clockToken = createToken<string>('clock')

    class ClockProvider implements ServiceProvider {
      register(container: Container): void {
        container.singleton(clockToken, () => 'tick')
      }
    }

    const container = createContainer()
    const kernel = new Kernel(container, [ClockProvider])
    await kernel.boot()

    expect(container.make(clockToken)).toBe('tick')
  })

  it('awaits asynchronous boot methods', async () => {
    const events: string[] = []

    class AsyncProvider implements ServiceProvider {
      register(): void {}

      async boot(): Promise<void> {
        await Promise.resolve()
        events.push('booted')
      }
    }

    const kernel = new Kernel(createContainer(), [AsyncProvider])
    await kernel.boot()

    expect(events).toEqual(['booted'])
  })

  it('wraps a failing boot in ProviderBootError with the provider name', async () => {
    class BrokenProvider implements ServiceProvider {
      register(): void {}

      boot(): void {
        throw new Error('database offline')
      }
    }

    const kernel = new Kernel(createContainer(), [BrokenProvider])

    let caught: unknown
    try {
      await kernel.boot()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ProviderBootError)
    expect((caught as ProviderBootError).message).toContain('BrokenProvider')
  })

  it('seals the container after boot so late registrations fail', async () => {
    const lateToken = createToken<string>('late')

    class EmptyProvider implements ServiceProvider {
      register(): void {}
    }

    const container = createContainer()
    const kernel = new Kernel(container, [EmptyProvider])
    await kernel.boot()

    expect(() => container.bind(lateToken, () => 'nope')).toThrow(KernelAlreadyBootedError)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run test/core/providers/Kernel.test.ts`
Expected: FAIL — no se puede resolver el módulo `src/core/providers/Kernel`.

- [ ] **Step 4: Write minimal implementation**

Create `src/core/providers/Kernel.ts`:

```ts
import type { Container } from '../container/Container'
import { ProviderBootError } from '../container/ContainerErrors'
import type { ServiceProvider } from './ServiceProvider'

export type ServiceProviderClass = new () => ServiceProvider

export class Kernel {
  readonly #container: Container
  readonly #providerClasses: readonly ServiceProviderClass[]

  constructor(container: Container, providerClasses: readonly ServiceProviderClass[]) {
    this.#container = container
    this.#providerClasses = providerClasses
  }

  async boot(): Promise<void> {
    const providers = this.#providerClasses.map((ProviderClass) => new ProviderClass())

    for (const provider of providers) {
      provider.register(this.#container)
    }

    for (const provider of providers) {
      await this.#bootProvider(provider)
    }

    this.#container.seal()
  }

  async #bootProvider(provider: ServiceProvider): Promise<void> {
    if (!provider.boot) {
      return
    }

    try {
      await provider.boot(this.#container)
    } catch (error) {
      throw new ProviderBootError(provider.constructor.name, error)
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/core/providers/Kernel.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos terminan sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/core/providers/ServiceProvider.ts src/core/providers/Kernel.ts test/core/providers/Kernel.test.ts
git commit -m "feat: add service provider contract and kernel"
```

---

## Cierre de F0-A

- [ ] **Verificación final**

Run: `pnpm exec vitest run test/core` — Expected: PASS, 23 tests en 4 archivos.
Run: `pnpm lint && pnpm typecheck` — Expected: sin errores.

Tras este plan, `src/core/` contiene el núcleo del contenedor completo y testeado:
`Token`, `ContainerErrors`, `Container`, `ServiceProvider` y `Kernel`. El antiguo
`src/core/container/NuxtLaravelizeContainer.ts` sigue intacto y en uso por el
bootstrap actual; se eliminará en **F0-B**, que conecta este núcleo a Nuxt
(`module.ts`, plugins de Nitro y cliente, composables, descubrimiento de
providers, limpieza de `shims.d.ts` y del export `./frontend`, playground y test
de integración).

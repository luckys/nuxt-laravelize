# `@luckys_luis/nuxt-laravelize-core`

[English](./README.md) | Espanol

Contenedor, tokens, providers, lifecycle y logging

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-core
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-core'],
})
```


## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |
| `./kit` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Core

`@luckys_luis/nuxt-laravelize-core` proporciona el contenedor de dependencias, tokens tipados, service providers, ciclo de vida y logging. Los modulos de features lo instalan automaticamente.

```bash
pnpm add @luckys_luis/nuxt-laravelize-core
```

### Contenedor y tokens

| API | Proposito |
|---|---|
| `createToken<T>(key)` | Crea un identificador de servicio tipado. |
| `createContainer()` | Crea un contenedor vacio. |
| `bind(token, factory)` | Registra un servicio transitorio. |
| `singleton(token, factory)` | Registra una instancia compartida. |
| `scoped(token, factory)` | Registra una instancia por scope hijo. |
| `instance(token, value)` | Registra un valor existente. |
| `make(token)` / `has(token)` | Resuelve un servicio o comprueba su registro. |
| `createScope()` | Crea un scope de request u operacion. |
| `seal()` | Impide nuevos registros. Nuxt sella el contenedor despues del boot. |
| `dispose()` | Libera este contenedor. Libera cada scope hijo por separado. |

```ts
import { createContainer, createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

interface Clock { now(): Date }
const clockToken = createToken<Clock>('app.clock')
const container = createContainer()

container.singleton(clockToken, () => ({ now: () => new Date() }))
container.seal()

const now = container.make(clockToken).now()
```

Implementa `ServiceProvider.register()` para bindings y el metodo opcional `boot()` para trabajo que requiere todos los providers registrados.

```ts
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

export default class ClockServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(clockToken, () => ({ now: () => new Date() }))
  }
}
```

Registra un provider desde un modulo Nuxt con `addLaravelizeProvider(nuxt, path, mode)` de `@luckys_luis/nuxt-laravelize-core/kit`. En handlers Nitro, los autoimports `useContainer(event)` y `useLogger(event)` resuelven el scope del request actual.

### Logging

| API | Proposito |
|---|---|
| `ConsoleLogger` | Escribe registros legibles en una consola. |
| `StructuredLogger` | Escribe registros JSON estructurados. |
| `FileLogger` | Agrega registros a un archivo; usalo en runtimes Node. |
| `loggerFor(resolver)` | Resuelve `loggerToken` o devuelve un logger de consola con nivel warning. |
| `shouldEmit(level, minimum)` | Compara niveles usando `LOG_LEVELS`. |
| `FakeLogger` | Guarda logs para assertions mediante `/testing`. |

```ts
import { ConsoleLogger } from '@luckys_luis/nuxt-laravelize-core/runtime'

const logger = new ConsoleLogger({ threshold: 'info' })
logger.info('Invoice created', { invoiceId: 'inv_1' })
```

Las clases de ciclo de vida `LaravelizeApplication` y `Kernel`, errores del contenedor, contratos de logger y opciones se exportan para autores de frameworks y adapters. Las aplicaciones normalmente usan providers y helpers de runtime Nuxt.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#core). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-testing`](../testing/README.es.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.es.md).

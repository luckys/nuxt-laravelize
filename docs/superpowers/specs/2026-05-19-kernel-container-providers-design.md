# Kernel F0 — Contenedor IoC y Service Providers

- **Fecha:** 2026-05-19
- **Paquete:** `@luckys_luis/nuxt-laravelize`
- **Fase:** F0 (fundación). Las fases F1–F5 dependen de esta.
- **Estado:** diseño aprobado, pendiente de plan de implementación.

## 1. Contexto y motivación

`nuxt-laravelize` es un módulo Nuxt que aporta primitivas de arquitectura
estilo Laravel a Nuxt y Nitro. El estado actual (v0.0.2) es un esqueleto: un
contenedor manual basado en `Map`, una interfaz `ServiceProvider` que nunca se
ejecuta, y plugins de bootstrap incompletos.

Una auditoría del código existente detectó que el contenedor es **inutilizable
en runtime** (siempre está vacío porque nada ejecuta los providers), que
`createScope()` no comparte instancias singleton, que la caché falla con
valores *falsy*, que `awilix` figura como dependencia pero no se usa, y que los
`shims.d.ts` declaran tipos falsos que enmascaran el sistema de tipos real.

F0 entrega el núcleo del que dependerá todo lo demás: un contenedor IoC sólido
y un ciclo de vida de Service Providers. Este diseño también **corrige de forma
explícita** todos los defectos detectados en la auditoría (ver sección 10).

## 2. Alcance

### Incluido en F0

- Contenedor IoC: fachada con vocabulario Laravel sobre `awilix`.
- Tokens tipados para resolución con inferencia de tipos.
- `ServiceProvider` con ciclo de vida `register` / `boot`.
- `Kernel` que orquesta el ciclo de vida de los providers.
- Descubrimiento híbrido de providers (convención de carpetas + config + API).
- Bootstrap en el servidor (Nitro) con *scope* por request.
- Bootstrap en el cliente (app Nuxt) con contenedor a nivel de aplicación.
- Errores tipados propios.
- Suite de tests unitarios e de integración.
- Corrección de todos los hallazgos de la auditoría.

### Fuera de F0 (fases posteriores)

Controllers, Form Request Validation, API Resources, Pagination (F1);
Logging, Localization, Events (F2); Queues, Mail, Notifications (F3);
Authorization (F4); Seeding, Factories, helpers de testing (F5).

## 3. Decisiones de diseño

| # | Decisión | Elección |
|---|---|---|
| 1 | Estructura de repos | 3 repos git independientes (sin monorepo) |
| 2 | Motor del contenedor | `awilix` por debajo + fachada estilo Laravel |
| 3 | Alcance de ejecución | Servidor (Nitro) **y** cliente (app Nuxt) |
| 4 | Registro de providers | Híbrido: convención de carpetas + config + API |
| 5 | Resolución de dependencias | Factories explícitas (sin decorators ni reflection) |
| 6 | Tipado de claves | Tokens tipados explícitos (`createToken<T>`) |
| 7 | Vocabulario de la fachada | `bind` / `singleton` / `scoped` / `instance` / `make` |

## 4. Arquitectura

### 4.1 Estructura de `src/`

```
core/                      # lógica pura, CERO dependencias de Nuxt
  container/
    Token.ts               # createToken<T>(key)
    Container.ts           # fachada bind/singleton/scoped/instance/make/has
    ContainerErrors.ts     # errores tipados
  providers/
    ServiceProvider.ts     # interfaz register/boot
    Kernel.ts              # orquesta register() de todos -> boot() de todos
module.ts                  # módulo Nuxt: descubre providers, genera virtual modules, inyecta plugins
nitro/plugin.ts            # root container del server + kernel + scope por request
runtime/
  plugin.ts                # container del cliente (nivel app) + kernel
  composables/useContainer.ts        # acceso desde el cliente
  server/utils/useContainer.ts       # acceso desde el server
```

### 4.2 Principio: `awilix` encapsulado

`awilix` se importa **exclusivamente** dentro de `core/container/Container.ts`.
Ningún otro archivo del paquete —ni del consumidor— ve `awilix`. La fachada
`Container` es la única API pública. Esto mantiene `awilix` como detalle de
implementación intercambiable y cumple el principio de inversión de
dependencias: el resto del código depende de la interfaz `Container`, no de
`awilix`.

## 5. Componentes

### 5.1 `Token<T>`

Un token es un objeto opaco que transporta el tipo del servicio en una posición
*phantom* (no existe en runtime). El `key` string es lo que `awilix` usa por
debajo.

```ts
export interface Token<T> {
  readonly key: string
}

export function createToken<T>(key: string): Token<T>
```

El parámetro de tipo `T` solo se usa para inferencia; `createToken` devuelve un
objeto `{ key }`. Dos tokens con el mismo `key` se consideran el mismo binding.

### 5.2 `Container` (fachada)

```ts
// Lo que recibe un factory: solo resuelve, no registra (ISP)
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
```

El factory recibe un `Resolver` —interfaz estrecha que solo permite resolver,
no registrar (ISP)— para declarar sus dependencias de forma explícita:

```ts
container.singleton(userCreatorToken, (c) =>
  new UserCreator(c.make(userRepositoryToken)))
```

Internamente la fachada registra cada factory en `awilix` con `asFunction`,
envolviendo el `cradle` de `awilix` para entregar la interfaz `Container` en su
lugar (nunca el `cradle` crudo).

#### Lifetimes

| Método | Lifetime | Servidor (Nitro) | Cliente (app Nuxt) |
|---|---|---|---|
| `bind` | transient | nueva instancia en cada `make()` | nueva instancia en cada `make()` |
| `singleton` | singleton | una por proceso | una por sesión de la SPA |
| `scoped` | scoped | una por request HTTP | una por sesión de la SPA (equivale a singleton) |
| `instance` | — | valor ya construido, compartido | valor ya construido, compartido |

En el cliente no existe el concepto de *request*, por lo que `scoped` se
comporta como `singleton`. Esto se documenta explícitamente. Los providers que
registran servicios solo válidos en servidor (acceso a base de datos, etc.) no
deben colocarse en la carpeta `shared/providers/` (ver 5.5).

`createScope()` delega en el `createScope()` de `awilix`: el sub-contenedor
hereda los registros, **comparte las instancias singleton** del padre y aísla
las instancias `scoped`.

### 5.3 `ServiceProvider`

```ts
export interface ServiceProvider {
  register(container: Container): void
  boot?(container: Container): void | Promise<void>
}
```

- `register(container)`: **solo** declara bindings. No debe resolver servicios.
- `boot(container)`: opcional; se ejecuta cuando todos los providers ya han
  registrado, por lo que es seguro resolver. Puede ser asíncrono.

El constructor de un provider es sin argumentos: el `Kernel` lo instancia. Toda
configuración se lee desde el contenedor o desde `runtimeConfig` dentro de
`register` / `boot`.

### 5.4 `Kernel`

```ts
export type ServiceProviderClass = new () => ServiceProvider

export class Kernel {
  constructor(container: Container, providers: ServiceProviderClass[])
  boot(): Promise<void>
}
```

El `Kernel` recibe las **clases** de los providers (no instancias) y las
instancia internamente. Los módulos virtuales (ver 5.5) exportan esas clases.

`boot()` ejecuta el ciclo de vida en orden estable:

1. Ejecuta `register(container)` de **todos** los providers.
2. Ejecuta `await boot(container)` de **todos** los providers, en el mismo
   orden.
3. Invoca `container.seal()`: a partir de ahí cualquier `bind` / `singleton` /
   `scoped` / `instance` lanza `KernelAlreadyBootedError`.

El orden estable es: providers de convención (orden alfabético de ruta),
después los de config, después los registrados por API.

Esta pieza es la que faltaba: hoy nada ejecuta los providers, por eso el
contenedor está vacío en runtime.

### 5.5 Descubrimiento de providers

Resuelto en build-time por `module.ts`, con tres fuentes:

1. **Convención de carpetas** (relativas a `nuxt.options.rootDir`):
   - `server/providers/**` → bootstrap del servidor.
   - `app/providers/**` → bootstrap del cliente.
   - `shared/providers/**` → ambos (la clase se instancia una vez por entorno).
2. **Config**: `laravelize.providers` en `nuxt.config` (rutas explícitas).
3. **API de módulo**: `addLaravelizeProvider(nuxt, path, target)`, donde
   `target` es `'server' | 'client' | 'shared'`, para que otros módulos
   inyecten sus providers.

`module.ts` escanea usando `nuxt.options.rootDir` (nunca `process.cwd()`) y
genera dos módulos virtuales con imports estáticos:

- `#laravelize/server-providers` → providers de `server` + `shared`.
- `#laravelize/client-providers` → providers de `client` + `shared`.

El runtime importa de estos módulos virtuales; no hay acceso al sistema de
ficheros en runtime.

### 5.6 Bootstrap del servidor (`nitro/plugin.ts`)

- Al arrancar Nitro (una sola vez): crea el `Container` raíz, instancia el
  `Kernel` con los providers de `#laravelize/server-providers` y ejecuta
  `await kernel.boot()`. Si un `boot()` falla, el plugin propaga el error y
  Nitro no arranca (*fail-fast*).
- En el hook `request`:
  `event.context.laravelizeContainer = rootContainer.createScope()`.
- `useContainer(event)` (server util) devuelve ese scope. Tipa el parámetro
  con el `H3Event` real de `h3`.

### 5.7 Bootstrap del cliente (`runtime/plugin.ts`)

- Plugin Nuxt asíncrono: crea el `Container` del cliente, instancia el `Kernel`
  con los providers de `#laravelize/client-providers` y ejecuta
  `await kernel.boot()`.
- El plugin provee el contenedor en el `nuxtApp`. `useContainer()` (composable)
  lo obtiene mediante `useNuxtApp()`.
- Reemplaza el plugin placeholder actual (`provide('laravelize', { enabled:
  true })`).

## 6. Manejo de errores

Errores tipados como clases que extienden `Error` con nombre propio. La fachada
**nunca** propaga errores de `awilix`: los captura y traduce.

| Error | Cuándo se lanza |
|---|---|
| `ServiceNotRegisteredError` | `make()` de un token sin binding |
| `CircularDependencyError` | ciclo detectado al resolver (traduce `AwilixResolutionError`) |
| `ContainerNotAvailableError` | `useContainer()` fuera de un contexto válido |
| `ProviderBootError` | excepción dentro de un `boot()` de un provider |
| `KernelAlreadyBootedError` | `bind` / `singleton` / `scoped` tras completar el boot |

- `ServiceNotRegisteredError` y `CircularDependencyError` incluyen el `key` del
  token; `CircularDependencyError` incluye además la cadena de resolución.
- `ProviderBootError` incluye el nombre del provider (derivado de
  `constructor.name`) y la causa original.

## 7. Testing

Reemplaza el test actual, que solo verifica el render de `<div>basic</div>` y no
cubre ninguna funcionalidad propia.

### 7.1 Unitarios (`core/`, sin Nuxt, Vitest)

- `Container`: cada lifetime (`transient` produce instancias distintas,
  `singleton` y `scoped` comparten correctamente); `createScope` aísla las
  instancias `scoped` pero comparte las `singleton`; los valores *falsy*
  (`0`, `''`, `false`, `null`) se cachean correctamente; `ServiceNotRegistered`
  y `CircularDependency` se lanzan cuando corresponde.
- `Token`: identidad e inferencia de tipos.
- `Kernel`: orden `register` → `boot`; espera de `boot` asíncrono;
  `ProviderBootError` envuelve el fallo de un provider;
  `KernelAlreadyBootedError` tras el boot.
- Fixtures de test: providers y tokens *fake*. No se usan Object Mothers
  porque esto es infraestructura del framework, no dominio de negocio.

### 7.2 Integración (`@nuxt/test-utils`)

El playground monta providers reales en las tres carpetas de convención. Se
verifica que:

- `useContainer()` resuelve servicios en el servidor y en el cliente.
- Dos requests HTTP distintas obtienen instancias `scoped` distintas pero la
  misma instancia `singleton`.

### 7.3 Metodología

La implementación se realiza con TDD: los tests se escriben antes que el código
de producción.

## 8. Convenciones de código

El código sigue las reglas del proyecto: SOLID, KISS, YAGNI, Object
Calisthenics; un nivel de indentación por método; sin `else` salvo necesidad;
sin comentarios en el código generado; sin `console.log`; nombres sin abreviar;
clases pequeñas con responsabilidad única.

## 9. Criterios de aceptación

1. `useContainer()` devuelve un contenedor con todos los providers ya
   registrados y *booted*, tanto en servidor como en cliente.
2. Una dependencia registrada como `singleton` se reutiliza entre requests; una
   `scoped` se reconstruye por request; una `bind` se reconstruye en cada
   `make()`.
3. `make()` de un token no registrado lanza `ServiceNotRegisteredError`.
4. Los providers se descubren desde las tres carpetas de convención, desde la
   config y desde la API de módulo.
5. `awilix` es el motor del contenedor y no aparece en la API pública.
6. No queda ningún `shims.d.ts` con tipos falsos: se usan los tipos reales de
   `@nuxt/schema`, `nitropack` y `h3`.
7. El export `./frontend` muerto se elimina del `package.json`.
8. La suite de tests unitarios e de integración pasa.

## 10. Mapa de corrección de la auditoría

| Hallazgo de la auditoría | Resuelto por |
|---|---|
| Contenedor vacío en runtime | El `Kernel` ejecuta los providers en el bootstrap |
| `createScope` no comparte singletons | Scopes reales de `awilix` |
| Caché rota con valores *falsy* | `awilix` cachea por presencia, no por *truthiness* |
| `awilix` es dependencia muerta | Pasa a ser el motor del contenedor |
| `shims.d.ts` con tipos falsos | Se eliminan; se usan los tipos reales |
| Export `./frontend` muerto | Se elimina del `package.json` |
| `process.cwd()` frágil | Se usa `nuxt.options.rootDir` |
| `runtime/plugin.ts` es un placeholder | Bootstrap real del contenedor del cliente |
| Tests no cubren funcionalidad | Nueva suite unitaria e de integración |
| `register` / `resolve` no es vocabulario Laravel | Fachada `bind` / `singleton` / `scoped` / `make` |

## 11. Plan de implementación

F0 se implementa en dos planes secuenciales, cada uno con software funcional y
testeable por sí mismo:

- **F0-A — Núcleo del contenedor** (`src/core/`): `Token`, `ContainerErrors`,
  `Container`, `ServiceProvider`, `Kernel`. Lógica pura sin dependencias de
  Nuxt, cubierta por tests unitarios. Es aditiva: no toca aún el código de
  bootstrap existente.
- **F0-B — Integración con Nuxt**: `module.ts` (descubrimiento de providers y
  módulos virtuales), plugin de Nitro, plugin de cliente, composables, limpieza
  de los `shims.d.ts` y del export `./frontend`, playground y test de
  integración. Depende de F0-A.

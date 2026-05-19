# nuxt-laravelize

[English](./README.md) | Español

Módulo de Nuxt que trae primitivas de arquitectura inspiradas en Laravel a Nuxt y Nitro.

El foco actual del paquete es un contenedor de servicios ligero por request, junto con utilidades runtime para consumir ese contenedor en contexto de servidor.

## Tabla de contenido

- [Qué ofrece este módulo](#qué-ofrece-este-módulo)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Configuración](#configuración)
- [Comportamiento runtime](#comportamiento-runtime)
- [Patrones de uso del contenedor](#patrones-de-uso-del-contenedor)
- [Límites actuales del bootstrap](#límites-actuales-del-bootstrap)
- [Desarrollo local](#desarrollo-local)
- [Flujo de publicación](#flujo-de-publicación)

## Qué ofrece este módulo

- Registro del módulo Nuxt con clave de configuración: `laravelize`.
- Asociación de contenedor por request en peticiones Nitro.
- Composable runtime: `useContainer()` para contexto de request en servidor.
- Utilidad de servidor para resolver el contenedor desde el evento de request.
- Una API base pequeña para evolucionar a una arquitectura de providers.

## Instalación

Instálalo en tu proyecto Nuxt:

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

Requisito peer:

- `nuxt >= 4.0.0`

## Inicio rápido

En `nuxt.config.ts`:

```ts
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize'],
  laravelize: {
    container: true,
  },
})
```

En una ruta de servidor o composable server-side:

```ts
export default defineEventHandler((event) => {
  const container = useContainer()
  const ping = container.resolve<() => string>('ping')

  return { status: ping() }
})
```

## Configuración

Clave del módulo: `laravelize`

Opciones disponibles:

- `container: boolean` (por defecto: `true`)

Comportamiento:

- `container: true` registra el plugin Nitro que adjunta `event.context.laravelizeContainer`.
- `container: false` desactiva la asociación del contenedor por request.

## Comportamiento runtime

Cuando está habilitado, cada request entrante recibe su propia instancia de contenedor con scope.

Resumen de flujo:

1. El setup del módulo registra plugin Nuxt + composables.
2. Se ejecuta el hook de request de Nitro.
3. Se adjunta un contenedor scoped al contexto del request.
4. `useContainer()` recupera esa instancia.

## Patrones de uso del contenedor

La API del contenedor soporta:

- `register(serviceKey, factory)`
- `resolve(serviceKey)`
- `createScope()`

Ejemplo de registro y resolución:

```ts
const container = useContainer()

container.register('clock', () => ({ now: () => new Date().toISOString() }))

const clock = container.resolve<{ now: () => string }>('clock')
const timestamp = clock.now()
```

Si resuelves un servicio no registrado, se lanza un error explícito:

- `Service not registered: <serviceKey>`

## Límites actuales del bootstrap

Este paquete actualmente ofrece infraestructura base de bootstrap:

- wiring del contenedor
- superficie runtime mínima
- contratos de tipos para providers

Todavía no incluye un set completo estilo Laravel como colas, pipelines de correo, políticas de autorización o generadores de scaffolding de dominio.

## Desarrollo local

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

Validaciones de calidad:

```bash
pnpm lint
pnpm test
pnpm typecheck
```

## Flujo de publicación

```bash
pnpm lint && pnpm test && pnpm typecheck
pnpm prepack
pnpm publish
```

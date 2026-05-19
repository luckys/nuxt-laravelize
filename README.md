# nuxt-laravelize

English | [Español](./README.es.md)

Nuxt module that brings Laravel-inspired backend primitives to Nuxt and Nitro.

The current focus of this package is a lightweight service container wired per request, plus runtime helpers for consuming that container in server context.

## Table of contents

- [What this module provides](#what-this-module-provides)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Runtime behavior](#runtime-behavior)
- [Container usage patterns](#container-usage-patterns)
- [Current bootstrap boundaries](#current-bootstrap-boundaries)
- [Local development](#local-development)
- [Release flow](#release-flow)

## What this module provides

- Nuxt module registration with config key: `laravelize`.
- Request-scoped container attachment on Nitro requests.
- Runtime composable: `useContainer()` for server-side request context.
- Server utility helper to resolve container from a request event.
- A small base API for future provider-based architecture.

## Installation

Install in your Nuxt project:

```bash
pnpm add nuxt-laravelize
```

Peer requirement:

- `nuxt >= 4.0.0`

## Quick start

In `nuxt.config.ts`:

```ts
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: ['nuxt-laravelize'],
  laravelize: {
    container: true,
  },
})
```

In a server route or server-side composable:

```ts
export default defineEventHandler((event) => {
  const container = useContainer()
  const ping = container.resolve<() => string>('ping')

  return { status: ping() }
})
```

## Configuration

Module key: `laravelize`

Available options:

- `container: boolean` (default: `true`)

Behavior:

- `container: true` registers the Nitro plugin that attaches `event.context.laravelizeContainer`.
- `container: false` disables request container wiring.

## Runtime behavior

When enabled, each incoming request gets its own scoped container instance.

Flow summary:

1. Module setup registers Nuxt plugin + composables.
2. Nitro request hook runs.
3. A scoped container is attached to request context.
4. `useContainer()` retrieves that instance.

## Container usage patterns

The container API supports:

- `register(serviceKey, factory)`
- `resolve(serviceKey)`
- `createScope()`

Example registration and resolution:

```ts
const container = useContainer()

container.register('clock', () => ({ now: () => new Date().toISOString() }))

const clock = container.resolve<{ now: () => string }>('clock')
const timestamp = clock.now()
```

If a service is resolved without registration, an explicit error is thrown:

- `Service not registered: <serviceKey>`

## Current bootstrap boundaries

This package currently provides bootstrap infrastructure only:

- container wiring
- runtime helper surface
- provider contract type definitions

It does not yet include full Laravel-like feature sets such as queues, mail pipelines, authorization policies, or domain scaffolding generators.

## Local development

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm test
pnpm typecheck
```

## Release flow

```bash
pnpm lint && pnpm test && pnpm typecheck
pnpm prepack
pnpm publish
```

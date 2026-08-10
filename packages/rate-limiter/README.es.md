# `@luckys_luis/nuxt-laravelize-rate-limiter`

[English](./README.md) | Espanol

Rate limiting de ventana fija sobre cache y middleware Nitro

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-rate-limiter
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-rate-limiter'],
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

## Rate limiting

`@luckys_luis/nuxt-laravelize-rate-limiter` proporciona limites de ventana fija respaldados por cache. El preset completo lo registra automaticamente; una instalacion granular puede agregarlo directamente.

```bash
pnpm add @luckys_luis/nuxt-laravelize-rate-limiter
```

Consume un intento con el autoimport `useRateLimiter(event)`. La metadata devuelta sirve para respuestas y logs de aplicacion.

```ts
export default defineEventHandler(async (event) => {
  const result = await useRateLimiter(event).hit(`login:${userId}`, 5, 60)
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfter: result.retryAfter,
  }
})
```

Usa `ThrottleRequests` en un pipeline de middleware Laravelized para rechazar exceso de requests con `429 Too Many Requests`. Agrega `X-RateLimit-Remaining`, `X-RateLimit-Reset` y, al rechazar, `Retry-After`.

```ts
const throttle = new ThrottleRequests(useRateLimiter(event), {
  key: event => getRequestIP(event, { xForwardedFor: true }) ?? 'unknown',
  maxAttempts: 60,
  decaySeconds: 60,
})

return await throttle.handle(event, next)
```

| API | Proposito |
|---|---|
| `hit(key, maxAttempts, decaySeconds?)` | Consume atomicamente un intento y devuelve metadata de la ventana. |
| `attempts(key)` / `remaining(key, max)` | Inspecciona el uso actual sin consumir un intento. |
| `clear(key)` | Elimina intentos y timer de una key logica. |
| `rateLimiterToken` | Resuelve o reemplaza el limiter configurado. |
| `useRateLimiter(event)` | Resuelve el singleton en Nitro. |

La aplicacion distribuida requiere un adapter de cache compartido cuyas operaciones `add` e `increment` sean atomicas. El `InMemoryCache` por defecto solo coordina requests atendidos por un proceso persistente. Deriva keys de identificadores confiables y acotados; hashear input no acotado evita crecimiento de keys controlado por atacantes.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#rate-limiting). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-cache`](../cache/README.es.md), [`@luckys_luis/nuxt-laravelize-queue-middleware`](../queue-middleware/README.es.md).

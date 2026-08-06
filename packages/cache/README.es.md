# `@nuxt-laravelize/cache`

[English](./README.md) | Espanol

Contrato cache portable, operaciones TTL, locks atomicos, contadores, memoizacion y driver en memoria

## Instalacion

```bash
pnpm add @nuxt-laravelize/cache
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/cache'],
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
| `./testing` | Entrypoint publico de este package. |

## Cache

`@nuxt-laravelize/cache` proporciona un contrato cache async portable, operaciones al estilo Laravel y un driver en memoria por defecto.

```bash
pnpm add @nuxt-laravelize/cache
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/cache'],
})
```

El preset completo ya registra este modulo.

Usa el autoimport `useCache(event)` en handlers Nitro. Los TTL numericos son segundos; un `Date` es una expiracion absoluta; omitir TTL guarda para siempre.

```ts
export default defineEventHandler(async (event) => {
  const cache = useCache(event)
  const users = await cache.remember('users:active', 60, () => loadActiveUsers())
  return { users }
})
```

| API | Proposito |
|---|---|
| `get(key, default?)` / `has(key)` | Lee un valor o comprueba una key no expirada. |
| `put(key, value, ttl?)` / `forever()` | Guarda temporalmente o para siempre. Un TTL no positivo elimina. |
| `add(key, value, ttl?)` | Guarda atomicamente solo si la key no existe. |
| `pull(key, default?)` | Lee y elimina un valor. |
| `forget(key)` / `flush()` | Elimina una key o todas. |
| `forgetIf(key, expected)` | Elimina atomicamente una key solo si su valor todavia coincide. |
| `remember(key, ttl, factory)` | Carga y guarda un valor ausente; llamadas concurrentes en el proceso comparten una promise. |
| `rememberForever(key, factory)` | Memoriza sin expiracion. |
| `increment()` / `decrement()` | Cambia atomicamente un numero y crea contadores ausentes desde cero. |
| `cacheToken` | Resuelve la implementacion `Cache` configurada desde el contenedor. |
| `CacheFake` | Fake en memoria con `assertHas()`, `assertMissing()` y `reset()`. |

```ts
await cache.add('locks:report', ownerId, 30)
await cache.increment('login-attempts:user_1', 1, 60)
const token = await cache.pull<string>('password-reset:user_1')
```

`InMemoryCache` sirve para tests, desarrollo y un solo proceso persistente. Elimina expiraciones accedidas de forma lazy y limpia oportunistamente valores expirados no accedidos durante escrituras. No coordina workers, instancias, regiones ni invocaciones serverless. Liga un adapter compartido a `cacheToken` para cache distribuido u operaciones atomicas entre procesos. Cache es un limite de optimizacion: no hagas que la correccion del dominio dependa de datos cacheados.

`undefined` esta reservado para un cache miss y no puede guardarse; usa `null` cuando la ausencia sea el valor cacheado. Las mutaciones invalidan la escritura de un `remember()` pendiente para que loaders antiguos no sobrescriban valores nuevos.

### Locks atomicos

Crea un lock seguro por owner con `useCacheLock(event, name, ttlSeconds)`. `run()` ejecuta inmediatamente si adquiere el lock y devuelve `undefined` cuando esta ocupado. `block()` reintenta hasta adquirirlo o lanza `LockTimeoutError`.

```ts
export default defineEventHandler(async (event) => {
  return await useCacheLock(event, 'reports:daily', 30).block(5, async () => {
    return await generateDailyReport()
  })
})
```

Cada lock expone un token opaco `owner`. Pasa ese token como cuarto argumento de `useCacheLock()` para restaurar y liberar ownership desde otro proceso. `release()` usa compare-and-delete atomico y no puede borrar un lock readquirido por otro owner despues de expirar. Reserva `forceRelease()` para recuperacion administrativa porque ignora ownership intencionalmente.

Usa `lock.renew(ttlSeconds?)` para extender atomicamente un lease solo mientras coincida su owner. La capacidad `Cache.expireIf` es opcional para mantener compatibilidad con adapters personalizados; la renovacion falla de forma segura con `false` cuando no esta disponible y nunca se emula con una lectura y escritura expuestas a carreras. Los locks de cache no tienen fencing token, y un failover o lag de replicacion de Redis/Valkey puede romper la exclusion mutua.

Para despliegues Node compartidos, instala `@nuxt-laravelize/cache-redis` con ioredis 5. Soporta Redis y Valkey, usa un prefijo obligatorio y deja a la aplicacion el inicio/cierre de la conexion. No esta incluido en el preset `@nuxt-laravelize/nuxt`. Su `flush()` por prefijo usa `SCAN` escapado y lotes acotados de `UNLINK`/`DEL`, no es atomico y debe ejecutarse en cada primario de Redis Cluster.

Los locks distribuidos requieren que los adapters cache compartidos implementen `add()` y `forgetIf()` atomicamente. El TTL debe superar la operacion protegida; la expiracion evita deadlocks permanentes pero no cancela un callback que tarde demasiado.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#cache). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/cache-redis`](../cache-redis/README.es.md), [`@nuxt-laravelize/rate-limiter`](../rate-limiter/README.es.md), [`@nuxt-laravelize/queue-middleware`](../queue-middleware/README.es.md).

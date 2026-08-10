# `@luckys_luis/nuxt-laravelize-queue-middleware`

[English](./README.md) | Espanol

Locks anti-overlap, rate limits y throttling de excepciones por ventana fija

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-queue-middleware
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-queue-middleware'],
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

## Middleware de queue

`@luckys_luis/nuxt-laravelize-queue-middleware` proporciona `WithoutOverlapping`, `RateLimited` y `ThrottlesExceptions` opt-in. Registra sus funciones `handle` estables en el `JobRunner` compartido; todos omiten su logica de coordinacion durante la fase failed y permiten ejecutar los hooks `failed()` terminales. Un job bloqueado se libera con delay acotado en vez de marcarse como exitoso o consumir un retry ordinario. `InMemoryQueue` reprograma la misma entrada y BullMQ usa `moveToDelayed()` con el token del worker. La observabilidad de queue lo registra como `released`, no `failed`.

```ts
import { cacheToken } from '@luckys_luis/nuxt-laravelize-cache/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { RateLimited, ThrottlesExceptions, WithoutOverlapping } from '@luckys_luis/nuxt-laravelize-queue-middleware/runtime'
import { jobRunnerToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'

const runner = container.make(jobRunnerToken)
const cache = container.make(cacheToken)

runner.use('invoice-overlap', new WithoutOverlapping(cache, {
  namespace: 'billing:production',
  key: (job, scope) => {
    const context = scope.make(executionContextToken).snapshot()
    if (!context.tenantId) throw new Error('Tenant context is required')
    return `tenant:${context.tenantId}:invoice:${String(job.payload.invoiceId)}`
  },
  expiresAfterSeconds: 120,
  releaseAfterMilliseconds: 1000,
}).handle)

runner.use('mail-provider-limit', new RateLimited(cache, {
  namespace: 'billing:production',
  key: 'provider:mail',
  maxAttempts: 100,
  decaySeconds: 60,
}).handle)

runner.use('mail-provider-exceptions', new ThrottlesExceptions(cache, {
  namespace: 'billing:production',
  key: 'provider:mail',
  maxExceptions: 5,
  decaySeconds: 300,
  backoffMilliseconds: 1000,
  when: error => error instanceof MailProviderUnavailableError,
}).handle)
```

Namespaces y keys logicas solo aceptan identificadores acotados, deben incluir tenant confiable cuando corresponda y se hashean antes de almacenarse en cache o aparecer en errores. Nunca las derives de direcciones, tokens u otros secretos. Se exige un cache distribuido owner-atomic por defecto en todos los entornos, mientras `RateLimited` y `ThrottlesExceptions` exigen ademas operaciones fixed-window atomicas; desarrollo local debe optar explicitamente con `requireDistributed: false`. Los releases no consumen intentos fallidos ordinarios, pero quedan acotados por el contador global de releases del job en el adapter y por cada politica `maxReleases` encontrada. `WithoutOverlapping` renueva y libera su lease solo si conserva ownership, aunque expiracion y failover no proporcionan fencing; conserva efectos externos idempotentes. `sync()` no puede reprogramar un job liberado y por eso propaga `JobReleasedError` al caller.

`ThrottlesExceptions` cuenta excepciones elegibles dentro de una ventana fija; intencionalmente no promete semantica Laravel de fallos consecutivos. Un exito no limpia el budget compartido, evitando la carrera donde un exito solapado podria borrar el fallo de otro worker. Los fallos elegibles por debajo de `maxExceptions` se liberan por `backoffMilliseconds`; el fallo que alcanza el limite y las ejecuciones posteriores se liberan por el resto de ventana autoritativo del cache. El predicado obligatorio `when` debe seleccionar de forma estrecha fallos confiables del provider. Coloca validacion y autorizacion fuera del throttle, incluye scope de tenant confiable del servidor en keys donde las identidades se solapen y nunca derives keys arbitrarias del payload. Los valores menores de order en `JobRunner` son middleware exterior: registra autorizacion con order menor que el throttle para que los jobs rechazados no entren en su budget. `JobReleasedError` y `NonRetryableJobError` pasan sin contarse; un fallo del predicado se cuenta conservadoramente preservando ambos errores en vez de dejar el breaker fail-open. Un fallo al leer cache impide ejecutar, mientras un fallo al registrar produce `ExceptionThrottleRecordingError` retryable ordinario en vez de liberar una excepcion no registrada; configura intentos conservadores cuando la proteccion del provider deba sobrevivir fallos de escritura del cache. Agotar releases conserva la causa del ultimo release para diagnostico terminal. Estas cadenas de causas son material confiable de servidor y los failure reporters deben redactarlas antes de logs generales, resumenes de dead letters o respuestas. Redis registra conteos atomicamente con su reloj, pero registro y release de queue no son una transaccion; crashes, ambiguedad de acknowledgement, failover y jobs ya iniciados hacen de esto un circuit breaker operativo, no un limite de autorizacion, cap estricto de requests ni ledger exactly-once. Los defaults son ventana de 600 segundos, backoff corto de 1000 ms y 100 releases globales por job. Aplica cuotas de admision por tenant y monitoriza retencion de jobs delayed, especialmente con ventanas largas.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#middleware-de-queue). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-queue`](../queue/README.es.md), [`@luckys_luis/nuxt-laravelize-cache`](../cache/README.es.md), [`@luckys_luis/nuxt-laravelize-rate-limiter`](../rate-limiter/README.es.md).

# `@nuxt-laravelize/authorization-queue`

[English](./README.md) | Espanol

Autorizacion opt-in de abilities por intento con recarga confiable del principal

## Instalacion

```bash
pnpm add @nuxt-laravelize/authorization-queue
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/authorization-queue'],
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

## Autorizacion de queue

`@nuxt-laravelize/authorization-queue` reevalua una ability registrada de la aplicacion antes de ejecutar jobs seleccionados. Configura la seleccion en codigo confiable de arranque del worker, no en metadata serializada, y registrala fuera del middleware operativo con un `order` menor de `JobRunner`. Las denegaciones normales se convierten en el codigo terminal y privado `QUEUE_AUTHORIZATION_DENIED`; outages del resolver, store de identidad o handler de ability durante processing permanecen como fallos retryable.

```ts
import { authorizationRegistryToken } from '@nuxt-laravelize/authorization/runtime'
import { RequireAuthorization } from '@nuxt-laravelize/authorization-queue/runtime'
import { jobRunnerToken } from '@nuxt-laravelize/queue/runtime'

const registry = container.make(authorizationRegistryToken)
registry.registerAbility('queue.invoice.process', async ({ principal, tenantId }) => {
  if (!tenantId) return false
  return memberships.currentlyAllows(principal, tenantId, 'invoice.process')
})

const runner = container.make(jobRunnerToken)
runner.use('authorize-invoices', new RequireAuthorization(registry, runner, {
  ability: 'queue.invoice.process',
  jobs: ['billing.invoice.process.v1'],
}).handle, -100)
```

El check se ejecuta en cada intento, replay retrasado e invocacion del failed hook terminal; los failed hooks denegados no se ejecutan bajo una identidad revocada. Los outages durante processing se envuelven en valores retryable y sanitizados `QueueAuthorizationUnavailableError`, cuyas causas son material diagnostico confiable. Los failed hooks son observers best-effort y los adapters actuales no pueden reintentar un outage de autorizacion en esa fase, por lo que se requieren reporters terminales independientes. Los campos actor y tenant propagados por `execution-context-queue` son solo procedencia y nunca entran en la ability. La identidad de dispatch y su fingerprint sin key tampoco son credenciales. El `PrincipalResolver` debe verificar independientemente una delegacion durable o identidad actual del worker, recargar grants y devolver `trustQueuePrincipal(principal, { actor, tenantId })` con el binding verificado. La seleccion por nombre se canonicaliza con el registro identico del worker, pero no aporta evidencia de identidad. Para IDs de recursos del payload, configura el resolver autoritativo opcional `resource` para que una policy registrada reciba datos confiables del store; las abilities generales no autorizan contenido del payload ni otros efectos. Los contextos propagados malformados fallan terminalmente como `INVALID_EXECUTION_CONTEXT`. El paquete no expone shortcuts `RequirePrincipal` ni `RequireTenant` sin una delegacion autenticada especifica de la aplicacion.

Para delegacion autenticada por dispatch, llama `installQueueDelegation(admissionContributors, runner, options)` antes de despachar o procesar los jobs seleccionados. Su issuer sincrono recibe el contexto final de admision congelado junto con el snapshot de ejecucion del productor y emite una credencial ASCII imprimible y opaca de hasta 8 KiB. Ese snapshot aporta contexto, no prueba de identidad, por lo que el issuer debe autenticar al productor mediante estado confiable de la aplicacion o rechazar la emision. En cada intento y failed hook, el verifier devuelve `QueueDelegationClaimsV1` firmadas; el paquete compara independientemente la allowlist de issuers y audience configuradas con la queue real del adapter, alias serializado exacto, job canonico, ID de dispatch, fingerprint y limites Unix epoch en milisegundos `issuedAtMs`/`expiresAtMs`. El authenticator debe recargar la delegacion durable, principal actual y membership tenant activa y devolver `trustQueuePrincipal()`. El bridge comprueba que actor y tenant coincidan con los claims y reemplaza incluso un `Authorization` scoped resuelto anteriormente, mientras que el provider oficial de `Authorization` resuelve lazy el principal scoped para que las instancias ya capturadas tambien observen la identidad verificada. Despues `RequireAuthorization` sigue evaluando grants actuales y recursos autoritativos.

Credenciales ausentes, malformadas, invalidas, expiradas o con bindings distintos e identidades revocadas producen `QUEUE_DELEGATION_DENIED` terminal; los adapters devuelven `null` o lanzan `QueueDelegationDeniedError` para fallos terminales de firma/parsing/key/estado. Hechos confiables del worker ausentes producen `QUEUE_DELEGATION_MISCONFIGURED`, mientras que otros errores del verifier o authenticator se convierten en `QueueDelegationUnavailableError` sanitizado y retryable. La metadata de credencial es material sensible persistido: nunca la registres ni expongas mediante tags, errores o dashboards. El paquete no aporta formato JWT/PASETO, algoritmos, keys, KMS, rotacion, store de revocacion/membership ni store de replay. La admision sincrona no soporta emision mediante KMS remoto. La redelivery exacta del mismo tuple sigue siendo valida para retries at-least-once; copiar una credencial a otro tuple se deniega, mientras que efectos duplicados siguen requiriendo idempotencia durable o fencing.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#autorizacion-de-queue). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/authorization`](../authorization/README.es.md), [`@nuxt-laravelize/queue`](../queue/README.es.md), [`@nuxt-laravelize/execution-context-queue`](../execution-context-queue/README.es.md).

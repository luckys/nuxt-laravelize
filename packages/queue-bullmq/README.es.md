# `@nuxt-laravelize/queue-bullmq`

[English](./README.md) | Espanol

Driver BullMQ y worker persistente, solo para Node

## Instalacion

```bash
pnpm add @nuxt-laravelize/queue-bullmq @nuxt-laravelize/queue bullmq ioredis
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/queue-bullmq'],
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

## Adapter BullMQ

`@nuxt-laravelize/queue-bullmq` es un driver persistente opcional y solo para Node; ni el preset ni reliability-queue lo instalan. Instalalo con la cola portable y proporciona un cliente `ioredis`.

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq bullmq ioredis
```

```ts
import Redis from 'ioredis'
import { BullMQConnection, BullMQQueue, BullMQWorker } from '@nuxt-laravelize/queue-bullmq/runtime'
import { jobSerializerToken } from '@nuxt-laravelize/queue/runtime'

const prefix = process.env.QUEUE_PREFIX
if (!prefix) throw new Error('QUEUE_PREFIX is required')
const connection = new BullMQConnection(new Redis(process.env.REDIS_URL!), {
  prefix,
})
const queue = new BullMQQueue(connection, runner, container.make(jobSerializerToken))
const worker = new BullMQWorker(connection, registry, runner)

await queue.push(new SendReport({ reportId: 'report_1' }))
await worker.work('reports', 4)
// Durante el apagado ordenado:
await worker.stop()
await queue.close()
```

Los batches BullMQ usan un solo flow atomico, plano y en una queue con coordinator parent oculto y retenido. Los children ignoran fallos de dependencies siblings, y el coordinator nunca llega al registry ni a failure hooks de aplicacion. El status carga los sets completos de dependencies, rechaza la categoria unsuccessful `failed` y verifica que las keys processed, ignored y unprocessed sean disjuntas y coincidan exactamente con todos los children deterministas. Los retornos processed distinguen exito de cancelacion e ignored son fallos. Los umbrales lazy de auto-removal de BullMQ son 24 horas/1000 jobs completados para coordinators y children, y 7 dias/1000 jobs fallidos para children. El pruning ocurre durante transiciones terminales posteriores, por lo que una queue inactiva puede retener datos mas tiempo; deadlines estrictos de borrado exigen cleanup programado explicito. Los counts quedan acotados de forma lazy segun el comportamiento de BullMQ. `batchStatus()` solo funciona mientras el coordinator siga retenido; esta retencion no es historial de auditoria. Dead-letter solo muestra el payload de negocio del child fallido. Reintentar un child fallido mediante `BullMQDeadLetterAdapter.retry()` no esta soportado porque BullMQ 5.77.3 no puede reprocesar con seguridad children `ignoreDependencyOnFailure`; admite un job standalone o batch nuevo con identidad de admision final nueva e idempotencia de aplicacion. Quedan fuera batches entre queues, branches/nesting/DAGs, children dinamicos, fail-fast, resultados, callbacks, compensacion/rollback, exactly-once e historial permanente.

`worker.stop()` es idempotente: la primera llamada impide nuevos registros mediante `work()`, detiene la toma de jobs en cada worker BullMQ registrado, espera jobs activos y reportes de fallo terminal, e intenta cerrar todos los workers aunque uno falle. Los jobs waiting y delayed permanecen en Redis para otro worker; drenar nunca limpia la queue. El drain no tiene deadline integrado porque forzar el cierre puede volver ambigua una ejecucion activa. Configura el periodo de gracia del supervisor, conserva handlers acotados e idempotentes y llama al `queue.close()` del productor solo despues de que termine el drain.

Configura un `prefix` globalmente unico, estable y acotado cuando aplicaciones o entornos compartan una base Redis. Productores, workers y tooling operacional de una flota deben usar el mismo valor. Esto evita colisiones accidentales, pero no es una frontera de seguridad: aplicaciones que no confian entre si requieren instancias Redis separadas o usuarios ACL distintos con patrones de keys restrictivos. Las bases logicas Redis solo separan colisiones salvo que el acceso este restringido de forma independiente. Los prefixes son visibles en keys, monitorizacion y backups; usa solo identificadores no sensibles de aplicacion/entorno, nunca PII de tenants, credenciales, tokens ni valores controlados por clientes. Los clientes Redis Cluster estan soportados y deben usar un hash tag validado como `{orders-production}` para ubicar las operaciones multi-key de BullMQ en un slot.

Cambiar el prefix crea otro namespace y exige una migracion coordinada. Valida la paridad de productores, workers y tooling, inicia workers con el nuevo prefix antes de cambiar productores, conserva workers y tooling del prefix anterior hasta drenar jobs waiting/delayed y expirar los TTL de deduplicacion relevantes, y solo entonces retira las keys antiguas. La deduplicacion sigue siendo local al prefix y nombre de queue. El scope de tenant debe seguir formando parte de IDs logicos construidos por codigo confiable y nunca se infiere desde metadata propagada.

`FailureReporter.listen()` observa fallos terminales y `report()` notifica a los observadores. Un `BullMQConnection` posee el reporter compartido por defecto, por lo que queues y workers que usan la misma instancia de conexion tambien comparten observaciones de `queue.onFailed()`; pasa un reporter explicito a ambos constructores cuando una composicion personalizada requiera wrappers de conexion separados. El CLI del worker carga un export default `{ worker }` desde `laravelize.queue.config.mjs` (o `--config=path`):

```js
// laravelize.queue.config.mjs
import { worker } from './server/queue.js'

export default { worker }
```

```bash
pnpm exec laravelize-queue-work --queue=reports --concurrency=4
```

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#adapter-bullmq). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/queue`](../queue/README.es.md), [`@nuxt-laravelize/cache-redis`](../cache-redis/README.es.md), [`@nuxt-laravelize/dead-letter`](../dead-letter/README.es.md).

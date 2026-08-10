# `@luckys_luis/nuxt-laravelize-queue`

[English](./README.md) | Espanol

Contratos de cola portables, jobs, ejecucion por scope y driver en memoria

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-queue
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-queue'],
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

## Queue

`@luckys_luis/nuxt-laravelize-queue` define jobs portables e incluye una cola en memoria. El autoimport Nitro `useQueue(event)` resuelve el driver activo.

```bash
pnpm add @luckys_luis/nuxt-laravelize-queue
```

```ts
import { createToken, type Resolver } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { Job } from '@luckys_luis/nuxt-laravelize-queue/runtime'

interface SendReportPayload extends Record<string, unknown> { reportId: string }
interface ReportService { send(reportId: string): Promise<void> }
const reportServiceToken = createToken<ReportService>('services.reports')

export class SendReport extends Job<SendReportPayload> {
  static readonly tries = 3
  static readonly queue = 'reports'
  static readonly backoff = [1_000, 5_000]
  static readonly priority = 10

  readonly payload: SendReportPayload

  constructor(payload: Record<string, unknown>) {
    super()
    if (typeof payload.reportId !== 'string') throw new Error('reportId is required')
    this.payload = { reportId: payload.reportId }
  }
  async handle(resolver: Resolver) {
    await resolver.make(reportServiceToken).send(this.payload.reportId)
  }
  tags() {
    return ['report:delivery']
  }
}
```

Registra los jobs serializados antes de que un worker los rehidrate y usa el contrato `Queue`.

```ts
registry.register(SendReport.name, SendReport)
await queue.push(new SendReport({ reportId: 'report_1' }))
await queue.later(60_000, new SendReport({ reportId: 'report_2' }))
await queue.sync(new SendReport({ reportId: 'report_3' }))
await queue.chain([
  { job: new SendReport({ reportId: 'report_4' }) },
  { job: new SendReport({ reportId: 'report_5' }), options: { queue: 'archive' } },
])
const batch = await queue.batch([
  { job: new SendReport({ reportId: 'report_6' }) },
  { job: new SendReport({ reportId: 'report_7' }), options: { tries: 3 } },
], { queue: 'reports' })
await queue.batchStatus(batch)
await queue.cancelBatch(batch)
```

| API | Proposito |
|---|---|
| `Job.serialize()` | Produce el payload versionado. Implementa `handle()` y opcionalmente `failed()`. |
| `JobSerializer.serialize()` / `readJobDispatchIdentity()` | Captura datos JSON-safe y anade un ID de dispatch versionado con su fingerprint SHA-256 canonico. |
| `JobAdmissionMetadataContributorRegistry` | Registra contributors sincronos de metadata de admision final compartidos por serializers scoped. |
| `Job.tags()` / `readJobTags()` | Declara tags diagnosticos acotados y lee defensivamente su snapshot serializado. |
| `InMemoryJobRegistry.register()` | Asocia el nombre serializado con su constructor. |
| `InMemoryJobRegistry.rehydrate()` | Recrea un job o lanza `JobNotRegisteredError`. |
| `JobRunner.run()` / `failed()` | Ejecuta un job serializado y su hook de fallo en un scope. |
| `Queue.push()` / `later()` / `sync()` | Encola, retrasa o ejecuta inmediatamente un job. |
| `Queue.chain()` | Prepara eager una chain lineal acotada y solo admite cada sucesor cuando termina con exito el step anterior. |
| `Queue.batch()` / `batchStatus()` / `cancelBatch()` | Admite children independientes y acotados en una queue, lee contadores fijos y solicita cancelacion cooperativa. |
| `Queue.size()` / `clear()` | Consulta o limpia jobs, opcionalmente por nombre de cola. |
| `Queue.onFailed()` | Registra un observador de fallos terminales. |
| `PushOptions` | Sobrescribe `tries`, `delay`, `queue`, `backoff` y `priority`; `deduplication` suprime admision coincidente local a la queue. |
| `QueueFake` | Guarda pushes admitidos, chains completas y registros de batch solo para testing, incluida identidad de dispatch, prioridad efectiva y tags normalizados. |
| `JobReleasedError` | Solicita replay retrasado sin consumir el budget normal de intentos fallidos. Lo manejan los adapters; los jobs de aplicacion no deben usarlo como error de negocio. |

Los jobs pueden declarar hasta 16 tags diagnosticos con `tags()`. Cada tag es un identificador seguro de hasta 128 caracteres, el conjunto declarado queda limitado a 1024 caracteres y los duplicados se eliminan conservando el orden. Los tags se capturan en metadata versionada y namespaced al serializar, por lo que retries, releases retrasados e inspeccion de dead letters ven los mismos valores. `readJobTags()` devuelve una copia defensiva congelada y trata metadata persistida ausente o malformada como ausencia de tags; la serializacion del productor sigue siendo estricta. Los tags pueden aparecer en datos Redis, backups, tooling de jobs fallidos y dashboards operativos. Nunca incluyas credenciales, tokens, emails, identificadores crudos de clientes ni datos personales innecesarios. Los tags son solo diagnostico: no autorizan acceso de tenant/principal, no aportan fencing, no deduplican admision ni se convierten automaticamente en labels de metricas o atributos de traces. Indexado y consultas globales por tag quedan intencionalmente fuera del contrato.

Cada llamada al `JobSerializer` compartido crea un ID opaco nuevo, valida y desacopla un snapshot JSON-safe del payload y guarda `sha256:<hex>` sobre una representacion canonica acotada. Las keys de objetos se ordenan y el orden de arrays se conserva; accessors, arrays sparse, ciclos, numeros no finitos, `bigint`, instancias de clases y otros valores que los transportes no preservan de forma consistente se rechazan. El worker recalcula el fingerprint antes de contributors de scope o middleware y clasifica metadata propia malformada o no coincidente como `INVALID_JOB_DISPATCH` terminal. Retries, releases retrasados y failed hooks reutilizan la misma identidad serializada; otro push recibe otro ID. Envelopes legacy v1/v2 sin esta metadata siguen ejecutandose. `fingerprintJobPayload()` y `readJobDispatchIdentity()` exponen el mismo contrato, y `QueueFake.pushed` registra tanto el envelope desacoplado como su identidad.

Los contributors de admision final solo se ejecutan mediante admision respaldada por registry en `JobRunner`, que los adapters incluidos usan despues de resolver la queue real y antes de insertar en el broker. Reciben un `JobAdmissionContextV1` congelado con esa queue, nombre serializado efectivo, nombre canonico del registry e identidad de dispatch. La canonicalizacion tambien comprueba que el alias serializado pertenezca al constructor despachado. `JobSerializer.serialize()` ordinario nunca ejecuta estos contributors; `QueueFake` exige un `JobRunner` respaldado por registry cuando su serializer tiene contributors de admision. Los contributors son sincronos y su salida sigue siendo metadata JSON-safe acotada. Esta frontera permite que infraestructura confiable de aplicacion firme hechos definitivos, pero el paquete queue no aporta keys, acceso KMS ni almacenamiento de credenciales.

La identidad de dispatch es metadata visible de integridad sin key. Un productor capaz de reemplazar un envelope puede reemplazar payload y fingerprint, por lo que no autentica productor, actor, tenant, queue ni nombre de job; tampoco aporta confidencialidad, anti-replay, deduplicacion de admision, fencing ni efectos exactly-once. Usa la delegacion autenticada descrita debajo cuando la identidad del productor deba cruzar esta frontera. Las aplicaciones siguen necesitando idempotencia durable para los efectos.

Las prioridades son hints de scheduling locales a cada queue entre `0` y `2^21`. `0` es la clase ordinaria sin prioridad y se ejecuta antes que las prioridades positivas; entre valores positivos, los menores se ejecutan primero. Los empates conservan FIFO, los jobs retrasados solo compiten al vencer su delay y el trabajo en ejecucion nunca se interrumpe. `PushOptions.priority` sobrescribe el valor estatico del job. Retries y releases retrasados de middleware conservan la prioridad resuelta. La prioridad es metadata de transporte, no forma parte del job serializado y no proporciona fairness, unicidad ni ejecucion exactly-once.

La deduplicacion de admision es explicita y local a cada queue. Pasa un ID opaco seguro de hasta 256 caracteres y, opcionalmente, un TTL entre 1 ms y 24 horas. `id` y `deduplication` son mutuamente excluyentes porque los IDs persistentes de jobs BullMQ tienen otro ciclo de vida. Sin TTL, los pushes coincidentes devuelven el handle original hasta que ese job completa o falla; retries y releases de middleware conservan la reserva. Con TTL, la supresion expira independientemente aunque el job original siga retrasado o ejecutandose. `clear()` elimina las reservas de la queue limpiada. BullMQ usa su primitiva atomica nativa y guarda un identificador determinista derivado con SHA-256 en vez del valor recibido; esta derivacion segura para keys evita inyeccion y revelacion directa, pero no aporta confidencialidad para IDs predecibles. El driver memory y `QueueFake` solo ofrecen comportamiento local al proceso; como el fake no ejecuta jobs, sus reservas sin TTL permanecen hasta `clear()`.

```ts
await queue.push(new SendReport({ reportId: 'report_1' }), {
  deduplication: { id: 'tenant-a.report-report_1', ttl: 30_000 },
})
```

La deduplicacion solo reduce admisiones duplicadas. No sustituye idempotencia durable, autorizacion de tenant ni fencing del store, y no puede ofrecer efectos exactly-once ante retries, crashes o ambiguedad del acknowledgement. La queue no es un limite de autorizacion: solo codigo productor confiable puede construir la metadata de deduplicacion, y ese codigo debe incluir un scope de tenant confiable cuando las identidades puedan solaparse. Nunca aceptes el identificador completo desde un caller no confiable ni incluyas secretos o datos personales. El reemplazo/debounce queda intencionalmente fuera del contrato.

Las chains secuenciales contienen entre 1 y 100 steps, como maximo 8000 nodos JSON, 24 niveles y un envelope serializado maximo de 240 KiB. Cada step resuelve su propia queue, retries, delay, backoff y prioridad, y atraviesa por separado la admision final respaldada por registry antes de la primera mutacion del broker. Por ello cada step recibe identidad de dispatch, fingerprint y, cuando este configurada, credencial de delegacion distintas y vinculadas a su job y queue exactos. Los steps no aceptan IDs del caller ni deduplicacion, y los pushes ordinarios no pueden usar el prefijo reservado `laravelize-chain-` para IDs de job. Inicialmente solo se admite el primer step; uno exitoso publica el siguiente, mientras retries y releases retrasados no avanzan y un fallo terminal detiene la chain. Un fingerprint SHA-256 versionado de chain y checks de transporte BullMQ detectan corrupcion accidental, pero no tienen key ni autentican el storage. `QueueFake.chains` registra la chain preparada completa, pero solo su primer step aparece en `pushed`.

El handoff es at-least-once, no una ejecucion transaccional. BullMQ usa IDs internos deterministas para reducir admisiones duplicadas del sucesor ante acknowledgements ambiguos, pero un crash u outage al publicarlo puede repetir el handler anterior y no existe commit atomico entre queues. Cada handler sigue necesitando idempotencia durable o fencing. Deben existir workers BullMQ para todas las queues de la chain. La metadata futura preparada se persiste con el envelope actual; la inspeccion de payload de dead letters solo muestra el payload de negocio actual y elimina toda la metadata serializada, aunque operadores del storage siguen pudiendo acceder a los datos Redis. El acceso de escritura a Redis o al broker es un limite de infraestructura confiable: quien lo tenga puede recalcular metadata de integridad sin key, inyectar replays exactos o saltar el orden mientras una credencial siga vigente. Usa ACLs/aislamiento de red e idempotencia de aplicacion; este contrato no declara anti-replay. Una chain larga puede superar la vigencia de una credencial emitida eager y entonces falla de forma cerrada. Las chains no proporcionan branches, fan-out paralelo, paso de resultados, mutacion dinamica, steps catch/finally, progreso ni cancelacion; usa workflows para branching y batches acotados para fan-out plano en una queue.

Los batches acotados contienen entre 1 y 100 children planos y eligen una sola queue para todo el batch. Las opciones por child permiten tries, delay, backoff y prioridad, nunca queue, ID del caller ni deduplicacion. Todos atraviesan admision final antes de cualquier mutacion, con identidad de dispatch distinta; los wrappers acumulados comparten los limites de las chains de 240 KiB, 8000 nodos y profundidad 24, IDs internos deterministas reservados e integridad SHA-256 versionada. SHA-256 solo detecta corrupcion accidental: el acceso de escritura a Redis/broker es una frontera de infraestructura confiable y permite recalcular wrappers o hacer replay. Los snapshots solo exponen `total`, `pending`, `succeeded`, `failed`, `cancelled`, `cancellationRequested` y `running | cancelling | finished | cancelled`; los contadores siempre suman total. Un fallo terminal no detiene siblings, y retries/releases solo contabilizan una vez. Los handles son localizadores, no autorizacion; status y cancelacion deben comprobar ownership en la aplicacion. Los efectos siguen necesitando idempotencia durable o fencing.

La cancelacion es cooperativa. Children pendientes o reintentados comprueban cancelacion antes de efectos; uno activo puede resolver `queueBatchContextToken` y llamar `isCancellationRequested()` o `throwIfCancellationRequested()`. Un error de control confirmado no reintenta ni invoca failed hooks o dead-letter reporting. La cancelacion no interrumpe inmediatamente efectos activos, no hace rollback ni ofrece exactly-once. Una carrera con finalizacion puede dejar `cancellationRequested: true`; el estado final sigue siendo `finished` si ninguno se cancelo y `cancelled` en caso contrario. El progreso de `InMemoryQueue` es volatil y local al proceso; `QueueFake` es solo testing y marca inmediatamente los children restantes como cancelados.

```ts
import { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'

const queue = new QueueFake()
await queue.push(new SendReport({ reportId: 'report_1' }))
queue.assertPushed(SendReport)
```

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#queue). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-queue-bullmq`](../queue-bullmq/README.es.md), [`@luckys_luis/nuxt-laravelize-queue-middleware`](../queue-middleware/README.es.md), [`@luckys_luis/nuxt-laravelize-events-queue`](../events-queue/README.es.md).

# `@nuxt-laravelize/workflows`

[English](./README.md) | Espanol

Workflows lineales persistidos con resolucion exacta de versiones string, formato seguro, recovery y compensacion saga

## Instalacion

```bash
pnpm add @nuxt-laravelize/workflows
```

## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |

## Workflows y sagas

`@nuxt-laravelize/workflows` implementa workflows lineales persistidos con definiciones versionadas, leases renovables con fencing, reintentos, intentos reanudables, cancelacion cooperativa en curso y compensacion en orden inverso.

Las versiones son strings opacos y sensibles a mayusculas de 1–64 caracteres ASCII, con extremos alfanumericos e interior `[A-Za-z0-9._-]`; `latest`, `default` y `current` estan reservados sin distinguir mayusculas. La resolucion es exacta, sin fallback, alias latest ni rangos. Nunca cambies handlers o steps bajo una tupla publicada; asigna una version nueva. Los snapshots fuente nuevos requieren `snapshotFormatVersion: 1`. El `status` diagnostico normaliza un campo legacy ausente y rechaza formatos desconocidos sin exigir una definicion desplegada; la ejecucion resuelve exactamente incluso filas terminales o en espera antes de claim o mutacion.

Esta validacion de filas persistidas es incompatible. Antes de actualizar, deten todos los writers de workflows y crea un backup verificado. Audita **cada fila**, no solo los identificadores, con el nuevo validador y las definiciones historicas exactas: identidad relacional/JSON y nombres exactos de definicion/steps; monotonicidad de timestamps; orden de estados/steps; outputs, errores y `retryAt` obligatorios; contadores de retry/compensacion frente al `maxAttempts` desplegado; validez del lease; y limites 128/4096 de errores. Los errores de releases anteriores se acotan en lecturas autoritativas y un formato JSON ausente sigue siendo formato 1, pero ninguna compatibilidad repara otras invariantes. Migra columnas relacionales y snapshot JSON atomicamente con un mapping explicito revisado y repite una validacion dry-run. Filas invalidas de stores custom/no confiables requieren reparacion o archivo especifico de la aplicacion; la migracion automatica in-flight sigue sin soporte.

Las antiguas filas de carrera `completed|failed + cancellationRequested` se rechazan explicitamente y no se normalizan silenciosamente. Revisa cada incidente y realiza/verifica compensacion antes de marcar `cancelled`/`compensated`, o documenta el rechazo de la cancelacion antes de limpiar el flag; nunca lo limpies a ciegas. El README de workflows-drizzle incluye queries PostgreSQL de discovery. Tras reparar, registra simultaneamente definiciones validas antiguas y nuevas y conserva versiones historicas mientras una fila o job/wake pendiente las referencie.

```ts
const fulfill = defineWorkflow({
  name: 'orders.fulfill',
  version: '1',
  steps: [
    defineStep({ name: 'reserve', run: reserve, compensate: release }),
    defineStep({ name: 'charge', run: charge, compensate: refund }),
  ],
})

registry.register(fulfill)
const started = await workflows.start(fulfill, { orderId }, orderId)
await workflows.run(started.id)
```

El store en memoria incluido es volatil y solo sirve para tests o desarrollo local. Los stores de produccion deben implementar fencing atomico de revision y lease, incluyendo `renewLease()`. Configura `leaseDurationMs` y un `heartbeatIntervalMs` menor; los contexts reciben `signal`, la cancelacion se observa al ritmo del heartbeat y resultados stale se descartan al perder el lease. Una signal no revierte efectos externos aceptados, asi que se mantienen las claves de idempotencia estables.

`@nuxt-laravelize/workflows-drizzle` proporciona stores durables para PostgreSQL, SQLite y Turso. La identidad e input canonico del workflow son inmutables; las columnas relacionales de revision, cancelacion y lease prevalecen sobre el snapshot serializado al hidratar. Claims y commits usan sentencias condicionales que devuelven la fila, impidiendo que owners obsoletos o expirados persistan estado. Estos stores tambien implementan la capability opcional `RecoverableWorkflowStore`, que devuelve IDs no terminales en paginas acotadas por cursor `(updatedAt, id)`.

```ts
import { DrizzlePostgresWorkflowStore } from '@nuxt-laravelize/workflows-drizzle/postgres'

const workflows = new WorkflowManager(new DrizzlePostgresWorkflowStore(db), registry)
```

### Wake-ups transaccionales por outbox

`@nuxt-laravelize/workflows-reliability` registra atomicamente cada mutacion del workflow y su wake-up futuro en el outbox de reliability. La atomicidad requiere que el adapter de workflow, el adapter outbox y `TransactionManager` usen la misma transaccion fisica y conexion de base de datos.

```ts
const workflowStore = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(workflowStore, registry)
registerWorkflowWakeHandler(reliableHandlers, workflows)
```

El helper de registro mantiene el tipo y la version del wake-up, acepta cualquier registry compatible y propaga la signal de reliability. Cada claim y renovacion registra un fallback al expirar el lease; renovacion y fallback comparten una transaccion y no cambian la revision. Los commits no terminales que liberan lease emiten de inmediato o en su deadline de retry, y la cancelacion emite inmediatamente.

Para unirte a una transaccion de dominio existente, llama `workflows.using(workflowStore.in(unitOfWork)).start(...)`. Asi estado de dominio, workflow y wake-up outbox se escriben juntos sin abrir una transaccion anidada. Nunca envuelvas todo `processResult()` en una transaccion: los handlers pueden ejecutar efectos externos lentos entre limites persistidos. Esos efectos siguen siendo at-least-once y requieren sus claves de idempotencia estables.

Ejecuta periodicamente `new WorkflowWakeReconciler(durableWorkflowStore, durableReliabilityStore, { resolver: registry }).reconcileStore({ pageSize: 100 })` para reparar wake-ups dead o perdidos operacionalmente. El resolver exacto es obligatorio y debe coincidir con el de los workers. El scan acotado recarga estado autoritativo y programa despues de cualquier lease activo o deadline de retry de negocio. Los scans repetidos o concurrentes de un workflow sin cambios comparten un wake determinista por cada generacion de 60 segundos; configura `generationMs` si necesitas otro limite de latencia de recuperacion. Las generaciones posteriores usan IDs nuevos, por lo que recovery nunca revive ni modifica una fila dead anterior. Usa `reconcile(ids)` con un indice propio de la aplicacion. Los fallos por workflow se devuelven sin abortar las paginas posteriores.

Para un proceso de larga duracion, `new WorkflowWakeReconciliationWorker(reconciler, { intervalMs: 60_000, reconcile: { pageSize: 100 }, onResult })` ejecuta inmediatamente y luego espera despues de cada scan completado. Agrupa llamadas locales solapadas y drena un scan activo al abortar. Los fallos por workflow se reportan mediante `onResult`; los errores de discovery o del callback detienen el loop. Los IDs deterministas mantienen seguros varios procesos, aunque un unico lider evita scans redundantes.

Despliegalo con `workflow-wake-reconcile --config ./workflow-wake-reconciliation.config.js`, o agrega `--once` para cron. La configuracion ESM debe exportar por defecto `{ worker, close? }`; `close` se ejecuta solo despues de drenar la reconciliacion activa. La ruta por defecto es `workflow-wake-reconciliation.config.js` en el directorio actual. Las senales disparan un unico apagado ordenado, mientras que errores de configuracion, discovery, callback, drain o cleanup terminan con codigo distinto de cero.

Cuando el mismo outbox contiene otros protocolos, configura el `OutboxProcessor` dedicado con `types: [workflowWakeMessageType]`. El claim filtrado por tipo evita que el adapter de entrega de workflows compita con workers de webhooks u otros mensajes.

Ejecuta `DATABASE_URL=postgresql://... pnpm test:integration:postgres` para correr la prueba requerida contra PostgreSQL real en un schema temporal aislado. Verifica commit conjunto, rollback ante fallo outbox, rollback del caller sobre filas de dominio, workflow y outbox, y recovery con un wake nuevo conservando la fila dead. El target falla si falta `DATABASE_URL` en vez de omitir silenciosamente la prueba.

### Scheduling por colas

`@nuxt-laravelize/workflows-queue` agenda una transicion autoritativa por job. El payload solo contiene el ID; cada worker recarga el store y hace claim por revision y lease. Los deadlines de reintentos de negocio crean jobs sucesores diferidos, mientras los reintentos de cola quedan para fallos de transporte, store o publicacion.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/workflows-queue'],
  laravelizeWorkflowsQueue: { queue: 'workflows', tries: 5, backoff: 5000 },
})

await useWorkflows(event).start(fulfill, { orderId }, orderId)

// Ejecutalo periodicamente desde tu scheduler o worker operacional.
await useWorkflows(event).reconcileStore({ pageSize: 100 })
```

Liga `workflowStoreToken` a un store durable y registra definiciones mediante `workflowRegistryToken`. Los IDs deterministas por revision solo optimizan deduplicacion del transporte; el fencing del store garantiza que jobs duplicados sean inocuos. Persistencia y publicacion son operaciones separadas: ejecuta `reconcileStore()` periodicamente cuando el store soporte recovery discovery, o llama `reconcile(ids)` con IDs de un indice propio. Cada scan captura un limite `updatedBefore` para que las actualizaciones concurrentes no vuelvan infinita una pasada; las siguientes pasadas recogen cambios posteriores. Este bridge no promete outbox transaccional.

Los payloads de queue y wake contienen solo el ID para que jobs antiguos recarguen la tupla relacional autoritativa y no lleven metadata de version obsoleta o controlada por el transporte. Enqueue y reconciliacion validan definiciones exactas y continuan tras reportar IDs incompatibles; el handler falla de forma cerrada antes del claim. El reconciler exige `{ resolver: registry }` con el mismo registry de los workers.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#workflows-y-sagas). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/workflows-drizzle`](../workflows-drizzle/README.es.md), [`@nuxt-laravelize/workflows-queue`](../workflows-queue/README.es.md), [`@nuxt-laravelize/workflows-reliability`](../workflows-reliability/README.es.md).

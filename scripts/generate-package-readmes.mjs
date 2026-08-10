import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packagesDir = path.join(root, 'packages')
const englishGuide = fs.readFileSync(path.join(root, 'docs/modules.md'), 'utf8')
const spanishGuide = fs.readFileSync(path.join(root, 'docs/modules.es.md'), 'utf8')
const spanishRootReadme = fs.readFileSync(path.join(root, 'README.es.md'), 'utf8')

const sectionByPackage = {
  'agent-sdk': 'Agent SDK',
  'agents-cloudflare': 'Agent SDK',
  'agents-flue': 'Agent SDK',
  'ai-sdk': 'AI SDK',
  'audit': 'Audit',
  'audit-drizzle': 'Audit',
  'authorization': 'Authorization',
  'authorization-queue': 'Queue authorization',
  'broadcasting': 'Broadcasting',
  'broadcasting-pusher': 'Broadcasting',
  'cache': 'Cache',
  'cache-redis': 'Cache',
  'console': 'Console',
  'core': 'Core',
  'database': 'Database',
  'database-drizzle': 'Database',
  'database-queue': 'Database',
  'dead-letter': 'Reliability and webhooks',
  'dead-letter-operations': 'Reliability and webhooks',
  'encryption': 'Encryption',
  'events': 'Events',
  'events-queue': 'Queued event listeners',
  'execution-context': 'Execution Context',
  'execution-context-queue': 'Execution Context',
  'filesystem': 'Filesystem',
  'filesystem-aws': 'Filesystem',
  'filesystem-aws-redis': 'Filesystem',
  'filesystem-cloudflare': 'Filesystem',
  'hashing': 'Hashing',
  'http': 'HTTP',
  'idempotency': 'HTTP',
  'idempotency-drizzle': 'HTTP',
  'mail': 'Mail',
  'migrations': 'Migrations',
  'migrations-drizzle': 'Migrations',
  'notifications': 'Notifications',
  'notifications-broadcast': 'Notifications',
  'notifications-database': 'Notifications',
  'notifications-database-drizzle': 'Notifications',
  'notifications-mail': 'Notifications',
  'notifications-queue': 'Notifications',
  'notifications-webhook': 'Notifications',
  'nuxt': 'Nuxt preset',
  'observability': 'Observability and OpenTelemetry',
  'observability-otel': 'Observability and OpenTelemetry',
  'observability-queue': 'Observability and OpenTelemetry',
  'pennant': 'Feature flags',
  'queue': 'Queue',
  'queue-bullmq': 'BullMQ adapter',
  'queue-middleware': 'Queue middleware',
  'rate-limiter': 'Rate limiting',
  'reliability': 'Reliability and webhooks',
  'reliability-drizzle': 'Reliability and webhooks',
  'reliability-queue': 'Reliability and webhooks',
  'routes': 'Typed routes',
  'scheduler': 'Scheduler',
  'scheduler-nuxt': 'Scheduler',
  'scout': 'Scout search',
  'scout-drizzle': 'Scout search',
  'testing': 'Testing',
  'validation': 'Validation',
  'webhooks': 'Reliability and webhooks',
  'workflows': 'Workflows and sagas',
  'workflows-drizzle': 'Workflows and sagas',
  'workflows-queue': 'Workflows and sagas',
  'workflows-reliability': 'Workflows and sagas',
}

const spanishSectionHeadings = {
  'Nuxt preset': 'Preset Nuxt',
  'Authorization': 'Autorizacion',
  'Typed routes': 'Rutas tipadas',
  'Audit': 'Auditoria',
  'Reliability and webhooks': 'Reliability y webhooks',
  'Queue authorization': 'Autorizacion de queue',
  'Queue middleware': 'Middleware de queue',
  'BullMQ adapter': 'Adapter BullMQ',
  'Queued event listeners': 'Listeners encolados',
  'Scout search': 'Busqueda Scout',
  'Workflows and sagas': 'Workflows y sagas',
  'Migrations': 'Migraciones',
  'Scheduler': 'Scheduler',
  'Execution Context': 'Contexto de ejecucion',
  'Observability and OpenTelemetry': 'Observabilidad y OpenTelemetry',
}

const relatedByPackage = {
  'agent-sdk': ['agents-cloudflare', 'agents-flue'],
  'agents-cloudflare': ['agent-sdk'],
  'agents-flue': ['agent-sdk'],
  'ai-sdk': ['agent-sdk'],
  'audit': ['audit-drizzle', 'execution-context'],
  'audit-drizzle': ['audit', 'migrations-drizzle'],
  'authorization': ['authorization-queue', 'http'],
  'authorization-queue': ['authorization', 'queue', 'execution-context-queue'],
  'broadcasting': ['broadcasting-pusher', 'notifications-broadcast'],
  'broadcasting-pusher': ['broadcasting'],
  'cache': ['cache-redis', 'rate-limiter', 'queue-middleware'],
  'cache-redis': ['cache'],
  'console': ['core', 'execution-context', 'testing'],
  'core': ['testing', 'execution-context'],
  'database': ['database-drizzle', 'database-queue', 'migrations'],
  'database-drizzle': ['database', 'reliability-drizzle'],
  'database-queue': ['database', 'queue', 'reliability'],
  'dead-letter': ['reliability', 'dead-letter-operations', 'queue-bullmq'],
  'dead-letter-operations': ['dead-letter', 'authorization'],
  'encryption': ['hashing', 'core'],
  'events': ['events-queue', 'queue'],
  'events-queue': ['events', 'queue'],
  'execution-context': ['execution-context-queue', 'observability', 'audit'],
  'execution-context-queue': ['execution-context', 'queue'],
  'filesystem': ['filesystem-aws', 'filesystem-cloudflare'],
  'filesystem-aws': ['filesystem', 'filesystem-aws-redis'],
  'filesystem-aws-redis': ['filesystem-aws', 'filesystem'],
  'filesystem-cloudflare': ['filesystem'],
  'hashing': ['encryption'],
  'http': ['validation', 'authorization', 'idempotency', 'routes'],
  'idempotency': ['idempotency-drizzle', 'http'],
  'idempotency-drizzle': ['idempotency', 'migrations-drizzle'],
  'mail': ['notifications', 'notifications-mail'],
  'migrations': ['migrations-drizzle', 'database'],
  'migrations-drizzle': ['migrations', 'audit-drizzle', 'reliability-drizzle'],
  'notifications': ['notifications-mail', 'notifications-database', 'notifications-queue'],
  'notifications-broadcast': ['notifications', 'broadcasting-pusher'],
  'notifications-database': ['notifications-database-drizzle', 'notifications'],
  'notifications-database-drizzle': ['notifications-database', 'migrations-drizzle'],
  'notifications-mail': ['notifications', 'mail'],
  'notifications-queue': ['notifications', 'queue', 'reliability'],
  'notifications-webhook': ['notifications', 'webhooks', 'reliability'],
  'nuxt': ['core', 'execution-context', 'reliability-queue'],
  'observability': ['observability-otel', 'observability-queue', 'execution-context'],
  'observability-otel': ['observability'],
  'observability-queue': ['observability', 'queue', 'execution-context-queue'],
  'pennant': ['cache', 'core'],
  'queue': ['queue-bullmq', 'queue-middleware', 'events-queue'],
  'queue-bullmq': ['queue', 'cache-redis', 'dead-letter'],
  'queue-middleware': ['queue', 'cache', 'rate-limiter'],
  'rate-limiter': ['cache', 'queue-middleware'],
  'reliability': ['reliability-drizzle', 'reliability-queue', 'webhooks'],
  'reliability-drizzle': ['reliability', 'migrations-drizzle'],
  'reliability-queue': ['reliability', 'queue', 'nuxt'],
  'routes': ['http', 'nuxt'],
  'scheduler': ['scheduler-nuxt', 'cache'],
  'scheduler-nuxt': ['scheduler', 'cache-redis'],
  'scout': ['scout-drizzle', 'authorization'],
  'scout-drizzle': ['scout', 'migrations-drizzle'],
  'testing': ['core', 'cache', 'queue', 'events'],
  'validation': ['http', 'nuxt'],
  'webhooks': ['reliability', 'notifications-webhook'],
  'workflows': ['workflows-drizzle', 'workflows-queue', 'workflows-reliability'],
  'workflows-drizzle': ['workflows', 'migrations-drizzle'],
  'workflows-queue': ['workflows', 'queue'],
  'workflows-reliability': ['workflows', 'reliability', 'database'],
}

const examples = {
  'authorization': {
    en: {
      title: 'Register and evaluate an ability',
      text: 'Register abilities and resource policies once during boot, then resolve the scoped authorizer at the application boundary. The default principal resolver denies until the application supplies a trusted current principal.',
      code: `import { authorizationRegistryToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'

const registry = container.make(authorizationRegistryToken)
registry.registerAbility('invoice.view', ({ principal, tenantId }) => {
  return Boolean(principal && tenantId && membershipAllows(principal, tenantId, 'invoice.view'))
})

const authorization = useAuthorization(event)
if (!await authorization.allows('invoice.view')) throw createError({ statusCode: 403 })`,
    },
    es: {
      title: 'Registra y evalua una ability',
      text: 'Registra abilities y policies de recursos durante el boot y resuelve el authorizer scoped en el boundary de la aplicacion. El resolver de principal por defecto deniega hasta que la aplicacion aporte un principal confiable y actual.',
      code: `import { authorizationRegistryToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'

const registry = container.make(authorizationRegistryToken)
registry.registerAbility('invoice.view', ({ principal, tenantId }) => {
  return Boolean(principal && tenantId && membershipAllows(principal, tenantId, 'invoice.view'))
})

const authorization = useAuthorization(event)
if (!await authorization.allows('invoice.view')) throw createError({ statusCode: 403 })`,
    },
  },
  'execution-context': {
    en: {
      title: 'Derive and transport an execution context',
      text: 'Contexts are immutable, bounded, and JSON-safe. Derive child work to preserve correlation and set causation; use `enrich()` only after the application authenticates actor and tenant values.',
      code: `import { useExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

const requestContext = useExecutionContext(event)
const jobContext = requestContext.derive({
  source: { type: 'queue', name: 'invoice-sync' },
})

await queue.push(job, { executionContext: jobContext.snapshot() })`,
    },
    es: {
      title: 'Deriva y transporta un contexto de ejecucion',
      text: 'Los contextos son inmutables, acotados y seguros para JSON. Deriva el trabajo hijo para conservar correlacion y causacion; usa `enrich()` solo despues de autenticar actor y tenant desde la aplicacion.',
      code: `import { useExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

const requestContext = useExecutionContext(event)
const jobContext = requestContext.derive({
  source: { type: 'queue', name: 'invoice-sync' },
})

await queue.push(job, { executionContext: jobContext.snapshot() })`,
    },
  },
  'observability': {
    en: {
      title: 'Instrument a request without leaking sensitive data',
      text: 'The base package is a vendor-neutral no-op foundation. Replace the scoped token with an application implementation and keep attributes bounded; built-in instrumentation deliberately excludes bodies, raw URLs, secrets, and identity IDs.',
      code: `import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'

const span = useObservability(event).startSpan('invoice.load', {
  kind: 'server',
  attributes: { 'app.operation': 'invoice.load' },
})
try {
  return await loadInvoice()
}
finally {
  span.end()
}`,
    },
    es: {
      title: 'Instrumenta un request sin filtrar datos sensibles',
      text: 'El paquete base es una foundation no-op neutral al vendor. Reemplaza el token scoped por una implementacion de la aplicacion y conserva atributos acotados; la instrumentacion incluida excluye bodies, URLs raw, secrets e IDs de identidad.',
      code: `import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'

const span = useObservability(event).startSpan('invoice.load', {
  kind: 'server',
  attributes: { 'app.operation': 'invoice.load' },
})
try {
  return await loadInvoice()
}
finally {
  span.end()
}`,
    },
  },
  'agent-sdk': {
    en: {
      title: 'Define and invoke a runtime-neutral agent',
      text: 'Register a named runtime once, then keep application code independent from Cloudflare Agents, Flue, or a test fake. `invoke`, `dispatch`, and `observe` are separate capabilities; check them before selecting an operation.',
      code: `import { AgentRuntimeRegistry, AgentSdkClient, defineAgent } from '@luckys_luis/nuxt-laravelize-agent-sdk/runtime'

const support = defineAgent<{ question: string }, { answer: string }>({
  name: 'support',
  instanceId: 'conversation-42',
})

const client = new AgentSdkClient(runtimes, 'cloudflare')
const result = await support.invoke(client, { question: 'How do I reset my password?' })
console.log(result.result.answer)

const receipt = await support.dispatch(client, { question: 'Summarize this ticket.' })
for await (const event of support.observe(client, { receipt })) {
  console.log(event.type, event.payload)
}`,
    },
    es: {
      title: 'Define e invoca un agente neutral al runtime',
      text: 'Registra un runtime nombrado una sola vez y mantén el codigo de la aplicacion independiente de Cloudflare Agents, Flue o un fake de tests. `invoke`, `dispatch` y `observe` son capacidades separadas; compruebalas antes de elegir una operacion.',
      code: `import { AgentSdkClient, defineAgent } from '@luckys_luis/nuxt-laravelize-agent-sdk/runtime'

const soporte = defineAgent<{ question: string }, { answer: string }>({
  name: 'support',
  instanceId: 'conversation-42',
})

const client = new AgentSdkClient(runtimes, 'cloudflare')
const result = await soporte.invoke(client, { question: 'Como restablezco mi password?' })
console.log(result.result.answer)

const receipt = await soporte.dispatch(client, { question: 'Resume este ticket.' })
for await (const event of soporte.observe(client, { receipt })) {
  console.log(event.type, event.payload)
}`,
    },
  },
  'agents-cloudflare': {
    en: {
      title: 'Connect Cloudflare Agents',
      text: 'This adapter preserves the Cloudflare Agent class and Durable Object instance identity. Every call must supply an `instanceId`; the adapter exposes invoke, dispatch, and event observation but not resumable offsets.',
      code: `import { CloudflareAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-cloudflare'

const runtime = new CloudflareAgentRuntime({
  host: process.env.CLOUDFLARE_AGENT_HOST,
})

// Register this runtime in AgentRuntimeRegistry as "cloudflare".
const result = await runtime.invoke({
  name: 'support-agent',
  instanceId: 'conversation-42',
  input: { message: 'Hello' },
})
console.log(result.result)`,
    },
    es: {
      title: 'Conecta Cloudflare Agents',
      text: 'Este adapter conserva la identidad de la clase Agent y de la instancia Durable Object de Cloudflare. Cada llamada debe aportar `instanceId`; el adapter expone invoke, dispatch y observacion de eventos, pero no offsets reanudables.',
      code: `import { CloudflareAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-cloudflare'

const runtime = new CloudflareAgentRuntime({
  host: process.env.CLOUDFLARE_AGENT_HOST,
})

// Registra este runtime en AgentRuntimeRegistry como "cloudflare".
const result = await runtime.invoke({
  name: 'support-agent',
  instanceId: 'conversation-42',
  input: { message: 'Hola' },
})
console.log(result.result)`,
    },
  },
  'agents-flue': {
    en: {
      title: 'Connect Flue agents and workflows',
      text: 'The Flue adapter maps agent calls to persistent conversations and workflow calls to durable runs. Agent conversations require an instance ID; workflow observations can resume with an opaque offset supplied by Flue.',
      code: `import { FlueAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-flue'

const runtime = new FlueAgentRuntime({
  baseUrl: process.env.FLUE_BASE_URL,
  token: process.env.FLUE_TOKEN,
})

const result = await runtime.invoke({
  name: 'support-agent',
  kind: 'agent',
  instanceId: 'conversation-42',
  input: 'Explain the invoice status.',
})
console.log(result.result)`,
    },
    es: {
      title: 'Conecta agentes y workflows de Flue',
      text: 'El adapter de Flue mapea llamadas de agentes a conversaciones persistentes y llamadas de workflows a runs durables. Las conversaciones de agentes requieren un ID de instancia; las observaciones de workflows pueden reanudarse con un offset opaco de Flue.',
      code: `import { FlueAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-flue'

const runtime = new FlueAgentRuntime({
  baseUrl: process.env.FLUE_BASE_URL,
  token: process.env.FLUE_TOKEN,
})

const result = await runtime.invoke({
  name: 'support-agent',
  kind: 'agent',
  instanceId: 'conversation-42',
  input: 'Explica el estado de la factura.',
})
console.log(result.result)`,
    },
  },
  'audit-drizzle': {
    en: {
      title: 'Persist audit entries with Drizzle',
      text: 'Choose the dialect-specific store and apply its migration source before binding it to `auditStoreToken`. PostgreSQL uses `execute(SQL)`; SQLite and Turso use their respective raw-client boundary.',
      code: `import { DrizzlePostgresAuditStore } from '@luckys_luis/nuxt-laravelize-audit-drizzle/postgres'

const auditStore = new DrizzlePostgresAuditStore(db)
container.instance(auditStoreToken, auditStore)

await useAudit(event).record({
  action: 'invoice.viewed',
  outcome: 'success',
  target: { type: 'invoice', id: invoiceId },
})`,
    },
    es: {
      title: 'Persiste entradas de auditoria con Drizzle',
      text: 'Elige el store del dialecto y aplica su fuente de migracion antes de ligarlo a `auditStoreToken`. PostgreSQL usa `execute(SQL)`; SQLite y Turso usan su boundary de cliente raw correspondiente.',
      code: `import { DrizzlePostgresAuditStore } from '@luckys_luis/nuxt-laravelize-audit-drizzle/postgres'

const auditStore = new DrizzlePostgresAuditStore(db)
container.instance(auditStoreToken, auditStore)

await useAudit(event).record({
  action: 'invoice.viewed',
  outcome: 'success',
  target: { type: 'invoice', id: invoiceId },
})`,
    },
  },
  'broadcasting-pusher': {
    en: {
      title: 'Send broadcasts through Pusher Channels',
      text: 'This is a server adapter only. Keep the app secret in private server configuration, inject the broadcaster into the base broadcasting module, and configure browser subscriptions separately.',
      code: `import { PusherBroadcaster } from '@luckys_luis/nuxt-laravelize-broadcasting-pusher'
import { broadcasterToken } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

container.instance(broadcasterToken, new PusherBroadcaster({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
}))`,
    },
    es: {
      title: 'Envia broadcasts mediante Pusher Channels',
      text: 'Este es solo un adapter de servidor. Conserva el secret de la aplicacion en configuracion privada, inyecta el broadcaster en el modulo base y configura las suscripciones del navegador por separado.',
      code: `import { PusherBroadcaster } from '@luckys_luis/nuxt-laravelize-broadcasting-pusher'
import { broadcasterToken } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'

container.instance(broadcasterToken, new PusherBroadcaster({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
}))`,
    },
  },
  'cache-redis': {
    en: {
      title: 'Use Redis or Valkey as the shared cache',
      text: 'Create one `RedisCache` with a mandatory application prefix and register it through `cacheToken`. The package does not own connection startup or shutdown, so the application can supervise the client lifecycle.',
      code: `import Redis from 'ioredis'
import { RedisCache } from '@luckys_luis/nuxt-laravelize-cache-redis'
import { cacheToken } from '@luckys_luis/nuxt-laravelize-cache/runtime'

const redis = new Redis(process.env.REDIS_URL)
container.instance(cacheToken, new RedisCache(redis, { prefix: 'orders:production:' }))

await useCache(event).put('invoice:42', { status: 'paid' }, 60)`,
    },
    es: {
      title: 'Usa Redis o Valkey como cache compartido',
      text: 'Crea un `RedisCache` con un prefijo obligatorio de aplicacion y registralo mediante `cacheToken`. El paquete no inicia ni cierra la conexion, para que la aplicacion controle el ciclo de vida del cliente.',
      code: `import Redis from 'ioredis'
import { RedisCache } from '@luckys_luis/nuxt-laravelize-cache-redis'
import { cacheToken } from '@luckys_luis/nuxt-laravelize-cache/runtime'

const redis = new Redis(process.env.REDIS_URL)
container.instance(cacheToken, new RedisCache(redis, { prefix: 'orders:production:' }))

await useCache(event).put('invoice:42', { status: 'paid' }, 60)`,
    },
  },
  'database-drizzle': {
    en: {
      title: 'Run an explicit Drizzle transaction',
      text: 'The adapter keeps the session visible to application repositories and runs `afterCommit` hooks only after the native transaction confirms. Use the synchronous variant only with a synchronous SQLite driver.',
      code: `import { DrizzleTransactionManager } from '@luckys_luis/nuxt-laravelize-database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async unitOfWork => {
  await users.insert(unitOfWork.session, user)
  unitOfWork.afterCommit(() => metrics.increment('users.created'))
})`,
    },
    es: {
      title: 'Ejecuta una transaccion Drizzle explicita',
      text: 'El adapter mantiene visible la session para los repositorios de la aplicacion y ejecuta `afterCommit` solo despues de confirmar la transaccion nativa. Usa la variante sincronica solo con un driver SQLite sincronico.',
      code: `import { DrizzleTransactionManager } from '@luckys_luis/nuxt-laravelize-database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async unitOfWork => {
  await users.insert(unitOfWork.session, user)
  unitOfWork.afterCommit(() => metrics.increment('users.created'))
})`,
    },
  },
  'dead-letter': {
    en: {
      title: 'Manage failed messages through an explicit adapter',
      text: 'Register exactly one dead-letter adapter and authorize every operation at the application boundary. Payloads and error summaries are separate sensitive capabilities; an envelope actor or tenant hint is never an authorization credential.',
      code: `import { DeadLetterManager } from '@luckys_luis/nuxt-laravelize-dead-letter'

const manager = new DeadLetterManager(adapter, { observer })
const page = await manager.list({ source: 'orders', limit: 25 })
const item = await manager.get({ source: 'orders', id: page.data[0].id })
await manager.retry(item.key, { operationId: crypto.randomUUID() })`,
    },
    es: {
      title: 'Gestiona mensajes fallidos mediante un adapter explicito',
      text: 'Registra exactamente un adapter dead-letter y autoriza cada operacion en el boundary de la aplicacion. Payloads y resumenes de error son capacidades sensibles separadas; el actor o tenant del envelope nunca es una credencial de autorizacion.',
      code: `import { DeadLetterManager } from '@luckys_luis/nuxt-laravelize-dead-letter'

const manager = new DeadLetterManager(adapter, { observer })
const page = await manager.list({ source: 'orders', limit: 25 })
const item = await manager.get({ source: 'orders', id: page.data[0].id })
await manager.retry(item.key, { operationId: crypto.randomUUID() })`,
    },
  },
  'dead-letter-operations': {
    en: {
      title: 'Enable the fail-closed operations console',
      text: 'The dashboard is opt-in, uses exact canonical origins and literal non-overlapping paths, and registers no adapter or permissive ability for you. Configure the central authorization registry and the adapter registry in application code.',
      code: `export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-dead-letter-operations'],
  laravelizeDeadLetterOperations: {
    enabled: true,
    allowedOrigins: ['https://operations.example.com'],
    pagePath: '/operations/dead-letters',
    apiPath: '/api/operations/dead-letters',
  },
})`,
    },
    es: {
      title: 'Activa la consola de operaciones fail-closed',
      text: 'El dashboard es opt-in, usa origins canonicos exactos y paths literales no solapados, y no registra ningun adapter ni ability permisiva. Configura el registry de autorizacion y el registry de adapters desde codigo de la aplicacion.',
      code: `export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-dead-letter-operations'],
  laravelizeDeadLetterOperations: {
    enabled: true,
    allowedOrigins: ['https://operations.example.com'],
    pagePath: '/operations/dead-letters',
    apiPath: '/api/operations/dead-letters',
  },
})`,
    },
  },
  'execution-context-queue': {
    en: {
      title: 'Propagate execution context into a job',
      text: 'Install the bridge at the producer and worker boundaries. The snapshot carries correlation provenance only; it must never authorize the actor or tenant encoded in it.',
      code: `import { runWithExecutionContext, useExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

await runWithExecutionContext(useExecutionContext(event), () =>
  useQueue(event).push(new SendReport({ reportId: 'report-1' })),
)`,
    },
    es: {
      title: 'Propaga el contexto de ejecucion a un job',
      text: 'Instala el bridge en los boundaries de productor y worker. El snapshot solo transporta procedencia de correlacion; nunca debe autorizar el actor o tenant codificado en el.',
      code: `import { runWithExecutionContext, useExecutionContext } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

await runWithExecutionContext(useExecutionContext(event), () =>
  useQueue(event).push(new SendReport({ reportId: 'report-1' })),
)`,
    },
  },
  'filesystem-aws': {
    en: {
      title: 'Register the AWS S3 filesystem',
      text: 'Use the factory for the standard AWS SDK client, or inject compatible command and signing ports for tests and custom runtimes. Credentials stay in server-only configuration. The same adapter supports temporary URLs, direct uploads with SHA-256 confirmation, streams, and multipart operations when its capabilities are available.',
      code: `import { createAwsS3Filesystem } from '@luckys_luis/nuxt-laravelize-filesystem-aws'

const archive = createAwsS3Filesystem({
  bucket: 'app-archive',
  prefix: 'production',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
})

await archive.write('reports/2025.csv', csv)
const url = await archive.temporaryUrl?.('reports/2025.csv', {
  expiresAt: new Date(Date.now() + 300_000),
})`,
    },
    es: {
      title: 'Registra el filesystem AWS S3',
      text: 'Usa el factory para el cliente AWS SDK estandar o inyecta puertos compatibles de comandos y firma para tests y runtimes propios. Las credenciales permanecen en configuracion solo de servidor. El adapter soporta URLs temporales, uploads directos con confirmacion SHA-256, streams y multipart cuando sus capacidades estan disponibles.',
      code: `import { createAwsS3Filesystem } from '@luckys_luis/nuxt-laravelize-filesystem-aws'

const archive = createAwsS3Filesystem({
  bucket: 'app-archive',
  prefix: 'production',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
})

await archive.write('reports/2025.csv', csv)
const url = await archive.temporaryUrl?.('reports/2025.csv', {
  expiresAt: new Date(Date.now() + 300_000),
})`,
    },
  },
  'filesystem-aws-redis': {
    en: {
      title: 'Make S3 upload confirmation restart-safe',
      text: 'Use the Redis issuance store when multiple Node instances can issue or confirm uploads. Its Lua transitions reserve, release, and complete one issuance with an owner token and Redis-controlled expiry.',
      code: `import Redis from 'ioredis'
import { RedisS3UploadIssuanceStore } from '@luckys_luis/nuxt-laravelize-filesystem-aws-redis'
import { createAwsS3Filesystem } from '@luckys_luis/nuxt-laravelize-filesystem-aws'

const issuanceStore = new RedisS3UploadIssuanceStore(new Redis(process.env.REDIS_URL), {
  prefix: 'uploads:production:',
})
const uploads = createAwsS3Filesystem({ bucket, region, issuanceStore })`,
    },
    es: {
      title: 'Haz la confirmacion de uploads S3 resistente a reinicios',
      text: 'Usa el store de issuance Redis cuando varias instancias Node puedan emitir o confirmar uploads. Sus transiciones Lua reservan, liberan y completan una issuance con token de owner y expiracion controlada por Redis.',
      code: `import Redis from 'ioredis'
import { RedisS3UploadIssuanceStore } from '@luckys_luis/nuxt-laravelize-filesystem-aws-redis'
import { createAwsS3Filesystem } from '@luckys_luis/nuxt-laravelize-filesystem-aws'

const issuanceStore = new RedisS3UploadIssuanceStore(new Redis(process.env.REDIS_URL), {
  prefix: 'uploads:production:',
})
const uploads = createAwsS3Filesystem({ bucket, region, issuanceStore })`,
    },
  },
  'filesystem-cloudflare': {
    en: {
      title: 'Use a Cloudflare R2 binding',
      text: 'The adapter accepts the structural R2 bucket contract and does not import Workers types or the AWS SDK. It supports byte operations, bounded paginated listing, and streaming; R2 bindings cannot sign temporary URLs or direct-upload forms.',
      code: `import { CloudflareR2Filesystem } from '@luckys_luis/nuxt-laravelize-filesystem-cloudflare'

const files = new CloudflareR2Filesystem(env.UPLOADS, {
  prefix: 'production/uploads',
  maxListObjects: 20_000,
})
await files.write('reports/2025.csv', csv)
console.log(await files.list('reports'))`,
    },
    es: {
      title: 'Usa un binding Cloudflare R2',
      text: 'El adapter acepta el contrato estructural del bucket R2 y no importa tipos de Workers ni AWS SDK. Soporta operaciones de bytes, listados paginados acotados y streaming; los bindings R2 no pueden firmar URLs temporales ni formularios de upload directo.',
      code: `import { CloudflareR2Filesystem } from '@luckys_luis/nuxt-laravelize-filesystem-cloudflare'

const files = new CloudflareR2Filesystem(env.UPLOADS, {
  prefix: 'production/uploads',
  maxListObjects: 20_000,
})
await files.write('reports/2025.csv', csv)
console.log(await files.list('reports'))`,
    },
  },
  'idempotency-drizzle': {
    en: {
      title: 'Bind a durable idempotency store',
      text: 'Apply exactly one dialect migration before binding the store. PostgreSQL uses Drizzle `execute`; SQLite and Turso use `all` so conditional returning statements preserve lease fencing and replay data.',
      code: `import { DrizzlePostgresIdempotencyStore } from '@luckys_luis/nuxt-laravelize-idempotency-drizzle/postgres'
import { idempotencyStoreToken } from '@luckys_luis/nuxt-laravelize-idempotency/runtime'

container.instance(idempotencyStoreToken, new DrizzlePostgresIdempotencyStore(db))`,
    },
    es: {
      title: 'Liga un store durable de idempotencia',
      text: 'Aplica exactamente una migracion del dialecto antes de ligar el store. PostgreSQL usa `execute` de Drizzle; SQLite y Turso usan `all` para que las sentencias condicionales con returning conserven fencing de leases y datos de replay.',
      code: `import { DrizzlePostgresIdempotencyStore } from '@luckys_luis/nuxt-laravelize-idempotency-drizzle/postgres'
import { idempotencyStoreToken } from '@luckys_luis/nuxt-laravelize-idempotency/runtime'

container.instance(idempotencyStoreToken, new DrizzlePostgresIdempotencyStore(db))`,
    },
  },
  'notifications-broadcast': {
    en: {
      title: 'Deliver a tenant-fenced broadcast notification',
      text: 'The notification chooses only its type, version, and bounded data. The recipient route supplies the opaque recipient and tenant identity; the package derives the private channel and fixed event name.',
      code: `import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['broadcast'] as const }
  broadcastType() { return 'invoice.paid' }
  broadcastVersion() { return 1 }
  toBroadcast() { return { invoiceId: 'invoice-1' } }
}

await notifications.send(recipient, new InvoicePaid())`,
    },
    es: {
      title: 'Entrega una notificacion broadcast aislada por tenant',
      text: 'La notificacion solo elige tipo, version y datos acotados. La ruta del destinatario aporta el recipient y tenant opacos; el paquete deriva el canal privado y el nombre fijo del evento.',
      code: `import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['broadcast'] as const }
  broadcastType() { return 'invoice.paid' }
  broadcastVersion() { return 1 }
  toBroadcast() { return { invoiceId: 'invoice-1' } }
}

await notifications.send(recipient, new InvoicePaid())`,
    },
  },
  'notifications-database': {
    en: {
      title: 'Store and read database notifications',
      text: 'Persist only bounded, versioned JSON and let the recipient route define the tenant fence. The server helper provides cursor pagination and read-state mutations; production should replace the memory store with the Drizzle adapter.',
      code: `import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['database'] as const }
  databaseType() { return 'invoice.paid' }
  databaseVersion() { return 1 }
  toDatabase() { return { invoiceId: 'invoice-1' } }
}

await notifications.send(recipient, new InvoicePaid())
const page = await useDatabaseNotifications(event).list({ recipient, limit: 20 })`,
    },
    es: {
      title: 'Guarda y lee notificaciones database',
      text: 'Persiste solo JSON acotado y versionado y deja que la ruta del destinatario defina el aislamiento de tenant. El helper server ofrece paginacion por cursor y mutaciones de lectura; en produccion reemplaza el store de memoria por el adapter Drizzle.',
      code: `import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['database'] as const }
  databaseType() { return 'invoice.paid' }
  databaseVersion() { return 1 }
  toDatabase() { return { invoiceId: 'invoice-1' } }
}

await notifications.send(recipient, new InvoicePaid())
const page = await useDatabaseNotifications(event).list({ recipient, limit: 20 })`,
    },
  },
  'notifications-database-drizzle': {
    en: {
      title: 'Use the durable database-notification stores',
      text: 'Apply the PostgreSQL or SQLite migration and inject the matching store. Each operation derives the tenant scope from the trusted recipient and keeps duplicate content idempotent while rejecting conflicting reuse.',
      code: `import { DrizzlePostgresDatabaseNotificationStore } from '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/postgres'
import { databaseNotificationStoreToken } from '@luckys_luis/nuxt-laravelize-notifications-database/runtime'

container.instance(databaseNotificationStoreToken, new DrizzlePostgresDatabaseNotificationStore(db))`,
    },
    es: {
      title: 'Usa stores durables de notificaciones database',
      text: 'Aplica la migracion PostgreSQL o SQLite e inyecta el store correspondiente. Cada operacion deriva el tenant scope desde el destinatario confiable, mantiene idempotente el contenido duplicado y rechaza reutilizaciones conflictivas.',
      code: `import { DrizzlePostgresDatabaseNotificationStore } from '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/postgres'
import { databaseNotificationStoreToken } from '@luckys_luis/nuxt-laravelize-notifications-database/runtime'

container.instance(databaseNotificationStoreToken, new DrizzlePostgresDatabaseNotificationStore(db))`,
    },
  },
  'notifications-mail': {
    en: {
      title: 'Add the validated mail channel',
      text: 'The notification defines content through `toMail()`, while the destination always comes from `routeNotificationFor("mail")`. The channel rejects header injection and forwards locale, abort, and idempotency metadata to the configured mailer.',
      code: `class InvoicePaid extends Notification {
  via() { return ['mail'] as const }
  toMail() {
    return { subject: 'Invoice paid', text: 'Your invoice is paid.' }
  }
}

const recipient = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : undefined,
}
await notifications.send(recipient, new InvoicePaid())`,
    },
    es: {
      title: 'Agrega el canal mail validado',
      text: 'La notificacion define el contenido mediante `toMail()`, mientras el destino siempre procede de `routeNotificationFor("mail")`. El canal rechaza inyeccion de headers y propaga locale, abort e idempotency al mailer configurado.',
      code: `class InvoicePaid extends Notification {
  via() { return ['mail'] as const }
  toMail() {
    return { subject: 'Factura pagada', text: 'Tu factura esta pagada.' }
  }
}

const recipient = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : undefined,
}
await notifications.send(recipient, new InvoicePaid())`,
    },
  },
  'notifications-queue': {
    en: {
      title: 'Queue one versioned notification delivery',
      text: 'Register type/version codecs and recipient resolvers. The worker serializes no address or notifiable object: it reloads the current recipient, preferences, locale, channels, and trusted tenant before delivering one channel.',
      code: `const dispatcher = new QueuedNotificationDispatcher({
  codecs,
  recipients,
  inbox: durableInboxStore,
  queue,
})

await dispatcher.dispatch(recipient, new InvoicePaid())
// withDelay(notifiable) may return per-channel delays in milliseconds.`,
    },
    es: {
      title: 'Encola una entrega de notificacion versionada',
      text: 'Registra codecs por type/version y resolvers de destinatarios. El worker no serializa direcciones ni objetos notifiable: recarga destinatario, preferencias, locale, canales y tenant confiable antes de entregar un canal.',
      code: `const dispatcher = new QueuedNotificationDispatcher({
  codecs,
  recipients,
  inbox: durableInboxStore,
  queue,
})

await dispatcher.dispatch(recipient, new InvoicePaid())
// withDelay(notifiable) puede devolver delays por canal en milisegundos.`,
    },
  },
  'notifications-webhook': {
    en: {
      title: 'Deliver a notification through a durable webhook',
      text: 'Keep the route opaque and resolve endpoint ownership, URL, and secret ID on the server. The notification payload cannot select a destination or signing key; the separate webhook worker resolves the secret at delivery time.',
      code: `import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class OrderReady extends Notification {
  via() { return ['webhook'] as const }
  webhookType() { return 'order.ready' }
  webhookVersion() { return 1 }
  toWebhook() { return { orderId: 'order-1' } }
}

await notifications.send({
  routeNotificationFor: () => ({ endpointId: 'endpoint-1', tenantId: 'tenant-1' }),
}, new OrderReady())`,
    },
    es: {
      title: 'Entrega una notificacion mediante webhook durable',
      text: 'Mantiene la ruta opaca y resuelve ownership del endpoint, URL y secret ID en el servidor. El payload no puede elegir destino ni clave de firma; el worker webhook separado resuelve el secret al entregar.',
      code: `import { Notification } from '@luckys_luis/nuxt-laravelize-notifications/runtime'

class OrderReady extends Notification {
  via() { return ['webhook'] as const }
  webhookType() { return 'order.ready' }
  webhookVersion() { return 1 }
  toWebhook() { return { orderId: 'order-1' } }
}

await notifications.send({
  routeNotificationFor: () => ({ endpointId: 'endpoint-1', tenantId: 'tenant-1' }),
}, new OrderReady())`,
    },
  },
  'observability-otel': {
    en: {
      title: 'Attach OpenTelemetry without owning the SDK',
      text: 'The adapter consumes the OpenTelemetry API and the providers already configured by the application. It does not install a global SDK or exporter; pass provider, propagator, flush, and shutdown hooks explicitly when needed.',
      code: `import { OtelObservability } from '@luckys_luis/nuxt-laravelize-observability-otel'
import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'

const observability = new OtelObservability({
  instrumentationName: 'orders-api',
  tracerProvider,
  meterProvider,
  propagator,
})
container.instance(observabilityToken, observability)

const span = observability.startSpan('invoice.load', { kind: 'internal' })
span.end()`,
    },
    es: {
      title: 'Conecta OpenTelemetry sin aduenarse del SDK',
      text: 'El adapter consume la API de OpenTelemetry y los providers configurados por la aplicacion. No instala un SDK global ni exporters; pasa provider, propagator y hooks de flush/shutdown explicitamente cuando haga falta.',
      code: `import { OtelObservability } from '@luckys_luis/nuxt-laravelize-observability-otel'
import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'

const observability = new OtelObservability({
  instrumentationName: 'orders-api',
  tracerProvider,
  meterProvider,
  propagator,
})
container.instance(observabilityToken, observability)

const span = observability.startSpan('invoice.load', { kind: 'internal' })
span.end()`,
    },
  },
  'observability-queue': {
    en: {
      title: 'Instrument selected queue jobs',
      text: 'Install the bridge with explicit job and queue allowlists. It propagates `traceparent` only by default, creates consumer spans, and maps queue releases, failures, and completions to bounded metrics.',
      code: `import { installQueueObservability } from '@luckys_luis/nuxt-laravelize-observability-queue'

installQueueObservability(admissionContributors, runner, observability, {
  jobs: ['billing.invoice.process.v1'],
  queues: ['billing'],
  trustTraceContext: false,
})`,
    },
    es: {
      title: 'Instrumenta jobs seleccionados de la queue',
      text: 'Instala el bridge con allowlists explicitas de jobs y queues. Propaga solo `traceparent` por defecto, crea consumer spans y mapea releases, fallos y completados a metricas acotadas.',
      code: `import { installQueueObservability } from '@luckys_luis/nuxt-laravelize-observability-queue'

installQueueObservability(admissionContributors, runner, observability, {
  jobs: ['billing.invoice.process.v1'],
  queues: ['billing'],
  trustTraceContext: false,
})`,
    },
  },
  'reliability-drizzle': {
    en: {
      title: 'Bind a durable reliability store',
      text: 'Use the PostgreSQL, SQLite, or Turso adapter with the matching migrations. Keep business writes and `appendWith` on the same physical transaction and connection to close the dual-write gap.',
      code: `import { DrizzlePostgresReliabilityStore } from '@luckys_luis/nuxt-laravelize-reliability-drizzle/postgres'

const store = new DrizzlePostgresReliabilityStore(db)
await db.transaction(async tx => {
  await markInvoicePaid(tx, invoiceId)
  await store.appendWith(tx, envelope, { availableAt })
})`,
    },
    es: {
      title: 'Liga un store durable de reliability',
      text: 'Usa el adapter PostgreSQL, SQLite o Turso con sus migraciones correspondientes. Mantiene los writes de negocio y `appendWith` en la misma transaccion y conexion fisica para cerrar el dual-write gap.',
      code: `import { DrizzlePostgresReliabilityStore } from '@luckys_luis/nuxt-laravelize-reliability-drizzle/postgres'

const store = new DrizzlePostgresReliabilityStore(db)
await db.transaction(async tx => {
  await markInvoicePaid(tx, invoiceId)
  await store.appendWith(tx, envelope, { availableAt })
})`,
    },
  },
  'reliability-queue': {
    en: {
      title: 'Bridge reliable messages to registered queue jobs',
      text: 'The Nuxt bridge registers `ReliableMessageJob` and reliable handlers without selecting a queue transport. Bind durable inbox/outbox stores and install BullMQ or another queue driver separately when production delivery is required.',
      code: `export default defineNuxtConfig({
  modules: [
    '@luckys_luis/nuxt-laravelize-reliability-queue',
  ],
})

// The reliable handler reloads authoritative state and remains idempotent.
await reliableHandlers.register('invoice.paid.v1', async message => {
  await markProjection(message.payload.invoiceId)
})`,
    },
    es: {
      title: 'Conecta mensajes reliable con jobs registrados',
      text: 'El bridge Nuxt registra `ReliableMessageJob` y handlers reliable sin elegir un transporte de queue. Liga stores Inbox/Outbox durables e instala BullMQ u otro driver por separado para entrega de produccion.',
      code: `export default defineNuxtConfig({
  modules: [
    '@luckys_luis/nuxt-laravelize-reliability-queue',
  ],
})

// El handler reliable recarga el estado autoritativo y sigue siendo idempotente.
await reliableHandlers.register('invoice.paid.v1', async message => {
  await markProjection(message.payload.invoiceId)
})`,
    },
  },
  'scheduler-nuxt': {
    en: {
      title: 'Compile schedules into Nuxt-owned Nitro tasks',
      text: 'This opt-in module targets Nuxt 4 and Nitro 2. It does not replace Nitro; it compiles explicit declarations and executes them through an application-provided runtime scope. Protect generated cron endpoints with the deployment provider secret.',
      code: `export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-scheduler-nuxt'],
  laravelizeScheduler: {
    definitions: './server/schedules.ts',
    cronSecret: process.env.CRON_SECRET,
  },
})`,
    },
    es: {
      title: 'Compila schedules en tasks Nitro gestionados por Nuxt',
      text: 'Este modulo opt-in apunta a Nuxt 4 y Nitro 2. No reemplaza Nitro; compila declaraciones explicitas y las ejecuta mediante un scope runtime aportado por la aplicacion. Protege los endpoints cron generados con el secret del proveedor de deployment.',
      code: `export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-scheduler-nuxt'],
  laravelizeScheduler: {
    definitions: './server/schedules.ts',
    cronSecret: process.env.CRON_SECRET,
  },
})`,
    },
  },
  'scout-drizzle': {
    en: {
      title: 'Register a Drizzle search engine',
      text: 'Choose PostgreSQL, local SQLite, or Turso/libSQL and pass explicit filter and sort allowlists. Apply the matching migration before indexing; values are parameterized and unlisted fields remain unavailable.',
      code: `import { registerDrizzlePostgresDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/postgres'

registerDrizzlePostgresDriver(scout, 'postgres', db, {
  filterableFields: ['status', 'locale'],
  sortableFields: ['published_at'],
})
scout.use('postgres')`,
    },
    es: {
      title: 'Registra un motor de busqueda Drizzle',
      text: 'Elige PostgreSQL, SQLite local o Turso/libSQL y pasa allowlists explicitas de filtros y orden. Aplica la migracion correspondiente antes de indexar; los valores se parametrizan y los campos no listados permanecen inaccesibles.',
      code: `import { registerDrizzlePostgresDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/postgres'

registerDrizzlePostgresDriver(scout, 'postgres', db, {
  filterableFields: ['status', 'locale'],
  sortableFields: ['published_at'],
})
scout.use('postgres')`,
    },
  },
  'workflows-drizzle': {
    en: {
      title: 'Persist workflows with a Drizzle store',
      text: 'Use the dialect-specific store and migration, then pass it to `WorkflowManager`. Relational revision, cancellation, and lease columns are authoritative during hydration and stale workers are fenced by conditional writes.',
      code: `import { DrizzlePostgresWorkflowStore } from '@luckys_luis/nuxt-laravelize-workflows-drizzle/postgres'
import { WorkflowManager } from '@luckys_luis/nuxt-laravelize-workflows'

const store = new DrizzlePostgresWorkflowStore(db)
const workflows = new WorkflowManager(store, registry)
const started = await workflows.start(definition, { orderId }, 'orders:42')`,
    },
    es: {
      title: 'Persiste workflows con un store Drizzle',
      text: 'Usa el store y migracion del dialecto correspondiente y pasalo a `WorkflowManager`. Las columnas relacionales de revision, cancelacion y lease son autoritativas al hidratar y los workers obsoletos se bloquean con writes condicionales.',
      code: `import { DrizzlePostgresWorkflowStore } from '@luckys_luis/nuxt-laravelize-workflows-drizzle/postgres'
import { WorkflowManager } from '@luckys_luis/nuxt-laravelize-workflows'

const store = new DrizzlePostgresWorkflowStore(db)
const workflows = new WorkflowManager(store, registry)
const started = await workflows.start(definition, { orderId }, 'orders:42')`,
    },
  },
  'workflows-queue': {
    en: {
      title: 'Schedule workflow transitions through a queue',
      text: 'Queue payloads contain only the workflow ID. The worker reloads the authoritative row and claims by revision and lease; business retry deadlines become delayed successors while transport failures use queue retries.',
      code: `export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-workflows-queue'],
  laravelizeWorkflowsQueue: {
    queue: 'workflows',
    tries: 5,
    backoff: 5_000,
  },
})

await useWorkflows(event).start(definition, { orderId }, 'orders:42')`,
    },
    es: {
      title: 'Programa transiciones de workflows mediante una queue',
      text: 'Los payloads de queue solo contienen el ID del workflow. El worker recarga la fila autoritativa y reclama por revision y lease; los deadlines de retry de negocio se convierten en sucesores retrasados y los fallos de transporte usan retries de queue.',
      code: `export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-workflows-queue'],
  laravelizeWorkflowsQueue: {
    queue: 'workflows',
    tries: 5,
    backoff: 5_000,
  },
})

await useWorkflows(event).start(definition, { orderId }, 'orders:42')`,
    },
  },
  'workflows-reliability': {
    en: {
      title: 'Atomically persist workflow wake-ups',
      text: 'Compose the workflow store, reliability store, and transaction manager around the same physical connection. Register the wake handler and run bounded reconciliation to repair lost or dead wake-ups.',
      code: `const store = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(store, registry)
registerWorkflowWakeHandler(reliableHandlers, workflows)`,
    },
    es: {
      title: 'Persiste wake-ups de workflows atomicamente',
      text: 'Compone el store de workflows, el store reliability y el transaction manager alrededor de la misma conexion fisica. Registra el handler de wake y ejecuta reconciliacion acotada para reparar wake-ups perdidos o dead.',
      code: `const store = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(store, registry)
registerWorkflowWakeHandler(reliableHandlers, workflows)`,
    },
  },
}

function readPackageDirectories() {
  return fs.readdirSync(packagesDir)
    .filter(directory => fs.existsSync(path.join(packagesDir, directory, 'package.json')))
    .sort()
}

function readPackage(directory) {
  return JSON.parse(fs.readFileSync(path.join(packagesDir, directory, 'package.json'), 'utf8'))
}

function spanishDescriptions() {
  const descriptions = new Map()
  const table = spanishRootReadme.split('\n').slice(
    spanishRootReadme.split('\n').findIndex(line => line === '## Paquetes'),
    spanishRootReadme.split('\n').findIndex(line => line === '## Instalacion'),
  )
  for (const line of table) {
    const match = line.match(/^\| `(@luckys_luis\/nuxt-laravelize(?:-[^`]+)?)` \| (.+) \|$/)
    if (match) descriptions.set(match[1], match[2])
  }
  return descriptions
}

function section(markdown, heading) {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => line === `## ${heading}`)
  if (start < 0) throw new Error(`Guide section not found: ${heading}`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start, end < 0 ? lines.length : end).join('\n').trim()
}

function guideHeading(heading, spanish) {
  return spanish ? (spanishSectionHeadings[heading] ?? heading) : heading
}

function anchor(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ +/g, '-')
}

function packageEntrypoints(pkg) {
  return Object.keys(pkg.exports ?? {})
    .filter(name => name !== './package.json')
    .map(name => name === '.' ? 'package root' : name)
}

function installCommand(directory, pkg) {
  const name = pkg.name
  if (directory === 'testing') return `pnpm add -D ${name}`
  if (directory === 'ai-sdk') return `pnpm add ${name} ai zod @ai-sdk/anthropic`
  if (directory === 'agents-cloudflare') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-agent-sdk agents`
  if (directory === 'agents-flue') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-agent-sdk @flue/runtime@1.0.0-beta.9 @flue/sdk@1.0.0-beta.9`
  if (directory === 'cache-redis') return `pnpm add ${name} ioredis`
  if (directory === 'filesystem-aws-redis') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-filesystem-aws ioredis`
  if (directory === 'database-drizzle') return `pnpm add ${name} drizzle-orm`
  if (directory === 'audit-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-audit drizzle-orm`
  if (directory === 'idempotency-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-idempotency drizzle-orm`
  if (directory === 'reliability-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-reliability drizzle-orm`
  if (directory === 'notifications-database-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-notifications-database drizzle-orm`
  if (directory === 'scout-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-scout drizzle-orm`
  if (directory === 'workflows-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-workflows drizzle-orm`
  if (directory === 'migrations-drizzle') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-migrations drizzle-orm`
  if (directory === 'database-queue') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-database @luckys_luis/nuxt-laravelize-queue`
  if (directory === 'broadcasting-pusher') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-broadcasting`
  if (directory === 'queue-bullmq') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-queue bullmq ioredis`
  if (directory === 'workflows-reliability') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-workflows @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-database`
  if (directory === 'workflows-queue') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-workflows @luckys_luis/nuxt-laravelize-queue`
  if (directory === 'reliability-queue') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-queue`
  if (directory === 'notifications-queue') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-notifications @luckys_luis/nuxt-laravelize-queue @luckys_luis/nuxt-laravelize-reliability`
  if (directory === 'notifications-webhook') return `pnpm add ${name} @luckys_luis/nuxt-laravelize-notifications @luckys_luis/nuxt-laravelize-reliability @luckys_luis/nuxt-laravelize-webhooks`
  return `pnpm add ${name}`
}

function moduleConfig(directory, pkg) {
  const hasNuxtPeer = Boolean(pkg.peerDependencies?.nuxt)
  const isModule = hasNuxtPeer && Object.keys(pkg.exports ?? {}).includes('.')
  if (!isModule) return ''
  if (directory === 'nuxt') return `\n\n\`\`\`ts\n// nuxt.config.ts\nimport Laravelize from '${pkg.name}'\n\nexport default defineNuxtConfig({\n  modules: [Laravelize],\n})\n\`\`\`\n`
  return `\n\n\`\`\`ts\n// nuxt.config.ts\nexport default defineNuxtConfig({\n  modules: ['${pkg.name}'],\n})\n\`\`\`\n`
}

function entrypointTable(pkg, spanish) {
  const rows = packageEntrypoints(pkg).map(entrypoint => `| \`${entrypoint}\` | ${spanish ? 'Entrypoint publico de este package.' : 'Public entrypoint for this package.'} |`).join('\n')
  return spanish
    ? `| Entrypoint | Uso |\n|---|---|\n${rows}`
    : `| Entrypoint | Use |\n|---|---|\n${rows}`
}

function related(directory, spanish) {
  const values = relatedByPackage[directory] ?? []
  if (!values.length) return ''
  const links = values.map(value => `[\`${value === 'nuxt' ? '@luckys_luis/nuxt-laravelize' : `@luckys_luis/nuxt-laravelize-${value}`}\`](../${value}/README${spanish ? '.es' : ''}.md)`).join(', ')
  return spanish ? `## Paquetes relacionados\n\n${links}.` : `## Related packages\n\n${links}.`
}

function packageHeader(pkg, spanish) {
  return spanish
    ? `# \`${pkg.name}\`\n\n[English](./README.md) | Espanol\n\n`
    : `# \`${pkg.name}\`\n\n[Espanol](./README.es.md) | English\n\n`
}

function render(directory, pkg, spanish, spanishMap) {
  const description = spanish ? (spanishMap.get(pkg.name) ?? pkg.description) : pkg.description
  const guide = spanish ? spanishGuide : englishGuide
  const heading = sectionByPackage[directory]
  const extra = examples[directory]?.[spanish ? 'es' : 'en']
  const fullGuideSection = section(guide, guideHeading(heading, spanish))
  const entrypoints = entrypointTable(pkg, spanish)
  const packageLink = `../../docs/modules${spanish ? '.es' : ''}.md#${anchor(guideHeading(heading, spanish))}`
  const publicRule = spanish
    ? 'Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.'
    : 'Use only these public entrypoints. Paths not listed here are internals and may change without notice.'
  const installation = spanish ? '## Instalacion' : '## Install'
  const usage = spanish ? '## Uso especifico del package' : '## Package-specific usage'
  const compatibility = spanish ? '## Compatibilidad y limites' : '## Compatibility and boundaries'
  const sourceText = spanish
    ? `La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](<link>). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.`
    : `The shared API and security reference lives in the [module guide](<link>). This page summarizes this package's contract and keeps copy-pasteable examples.`
  const relatedSection = related(directory, spanish)
  const note = extra
    ? ''
    : (spanish
        ? 'El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.'
        : 'The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.')
  const exampleSection = extra
    ? `\n### ${extra.title}\n\n${extra.text}\n\n\`\`\`ts\n${extra.code}\n\`\`\`\n`
    : ''
  const install = installCommand(directory, pkg)
  const config = moduleConfig(directory, pkg)
  const limits = spanish
    ? 'Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.'
    : 'Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.'
  return `${packageHeader(pkg, spanish)}${description}\n\n${installation}\n\n\`\`\`bash\n${install}\n\`\`\`${config}\n\n${usage}\n\n${note}${note ? '\n' : ''}${exampleSection}\n${spanish ? '## Entrypoints publicos' : '## Public entrypoints'}\n\n${publicRule}\n\n${entrypoints}\n\n${fullGuideSection}\n\n${compatibility}\n\n${limits}\n\n${sourceText.replace('<link>', packageLink)}\n\n${relatedSection ? `${relatedSection}\n\n` : ''}`
}

const spanishMap = spanishDescriptions()
const directories = readPackageDirectories()
const missingMappings = directories.filter(directory => !sectionByPackage[directory])
if (missingMappings.length) throw new Error(`Missing guide mappings: ${missingMappings.join(', ')}`)

for (const directory of directories) {
  const pkg = readPackage(directory)
  fs.writeFileSync(path.join(packagesDir, directory, 'README.md'), `${render(directory, pkg, false, spanishMap).trimEnd()}\n`)
  fs.writeFileSync(path.join(packagesDir, directory, 'README.es.md'), `${render(directory, pkg, true, spanishMap).trimEnd()}\n`)
}

console.log(`Generated English and Spanish README files for ${directories.length} packages.`)

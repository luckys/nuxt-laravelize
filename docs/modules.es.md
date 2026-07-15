# Guia de modulos y API

[English](./modules.md) | Espanol

Esta guia cubre todos los paquetes publicos de Nuxt Laravelize. Los imports desde rutas no incluidas aqui son internos y pueden cambiar sin aviso.

## Preset Nuxt

Instala `@nuxt-laravelize/nuxt` para activar juntos los modulos estables y `nuxt-i18n-micro`. BullMQ y el scheduler experimental se excluyen intencionalmente.

```bash
pnpm add @nuxt-laravelize/nuxt
```

```ts
// nuxt.config.ts
import Laravelize from '@nuxt-laravelize/nuxt'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'es', iso: 'es-ES', dir: 'ltr' }],
    defaultLocale: 'es',
    translationDir: 'locales',
  },
})
```

Usa `$t()` en templates o `useI18n().$t()` en scripts. Define `i18n: false` para desactivar la integracion.

## Core

`@nuxt-laravelize/core` proporciona el contenedor de dependencias, tokens tipados, service providers, ciclo de vida y logging. Los modulos de features lo instalan automaticamente.

```bash
pnpm add @nuxt-laravelize/core
```

### Contenedor y tokens

| API | Proposito |
|---|---|
| `createToken<T>(key)` | Crea un identificador de servicio tipado. |
| `createContainer()` | Crea un contenedor vacio. |
| `bind(token, factory)` | Registra un servicio transitorio. |
| `singleton(token, factory)` | Registra una instancia compartida. |
| `scoped(token, factory)` | Registra una instancia por scope hijo. |
| `instance(token, value)` | Registra un valor existente. |
| `make(token)` / `has(token)` | Resuelve un servicio o comprueba su registro. |
| `createScope()` | Crea un scope de request u operacion. |
| `seal()` | Impide nuevos registros. Nuxt sella el contenedor despues del boot. |
| `dispose()` | Libera este contenedor. Libera cada scope hijo por separado. |

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

interface Clock { now(): Date }
const clockToken = createToken<Clock>('app.clock')
const container = createContainer()

container.singleton(clockToken, () => ({ now: () => new Date() }))
container.seal()

const now = container.make(clockToken).now()
```

Implementa `ServiceProvider.register()` para bindings y el metodo opcional `boot()` para trabajo que requiere todos los providers registrados.

```ts
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

export default class ClockServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(clockToken, () => ({ now: () => new Date() }))
  }
}
```

Registra un provider desde un modulo Nuxt con `addLaravelizeProvider(nuxt, path, mode)` de `@nuxt-laravelize/core/kit`. En handlers Nitro, los autoimports `useContainer(event)` y `useLogger(event)` resuelven el scope del request actual.

### Logging

| API | Proposito |
|---|---|
| `ConsoleLogger` | Escribe registros legibles en una consola. |
| `StructuredLogger` | Escribe registros JSON estructurados. |
| `FileLogger` | Agrega registros a un archivo; usalo en runtimes Node. |
| `loggerFor(resolver)` | Resuelve `loggerToken` o devuelve un logger de consola con nivel warning. |
| `shouldEmit(level, minimum)` | Compara niveles usando `LOG_LEVELS`. |
| `FakeLogger` | Guarda logs para assertions mediante `/testing`. |

```ts
import { ConsoleLogger } from '@nuxt-laravelize/core/runtime'

const logger = new ConsoleLogger({ threshold: 'info' })
logger.info('Invoice created', { invoiceId: 'inv_1' })
```

Las clases de ciclo de vida `LaravelizeApplication` y `Kernel`, errores del contenedor, contratos de logger y opciones se exportan para autores de frameworks y adapters. Las aplicaciones normalmente usan providers y helpers de runtime Nuxt.

## Events

`@nuxt-laravelize/events` despacha eventos de forma sincrona y resuelve listeners desde el contenedor.

```bash
pnpm add @nuxt-laravelize/events
```

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'
import { InMemoryDispatcher, type Listener } from '@nuxt-laravelize/events/runtime'

class UserRegistered {
  constructor(readonly userId: string) {}
  toPayload() { return [this.userId] }
}

const listenerToken = createToken<Listener<UserRegistered>>('listeners.welcome-user')
const container = createContainer()
container.singleton(listenerToken, () => ({
  handle: async event => console.log(`Welcome ${event.userId}`),
}))

const events = new InMemoryDispatcher(container)
events.listen(UserRegistered, listenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Proposito |
|---|---|
| `listen(Event, listenerToken)` | Registra un listener para una clase de evento. |
| `listenAny(listenerToken)` | Registra un listener para todos los eventos. |
| `subscribe(subscriberToken)` | Permite que un `EventSubscriber` registre varios listeners. |
| `dispatch(event)` | Ejecuta listeners en orden; devolver `false` detiene la propagacion. |
| `ShouldQueue` | Marca un listener con `shouldQueue: true` para el adapter de cola opcional. |
| `dispatcherToken` | Resuelve el `Dispatcher`; `useDispatcher(event)` se autoimporta en Nitro. |
| `EventFake` | Guarda eventos y ofrece `assertDispatched`, `assertNotDispatched` y `reset`. |

```ts
import { EventFake } from '@nuxt-laravelize/events/testing'

const events = new EventFake()
await events.dispatch(new UserRegistered('user_1'))
events.assertDispatched(UserRegistered, event => event.userId === 'user_1')
```

## Queue

`@nuxt-laravelize/queue` define jobs portables e incluye una cola en memoria. El autoimport Nitro `useQueue(event)` resuelve el driver activo.

```bash
pnpm add @nuxt-laravelize/queue
```

```ts
import { createToken, type Resolver } from '@nuxt-laravelize/core/runtime'
import { Job } from '@nuxt-laravelize/queue/runtime'

interface SendReportPayload extends Record<string, unknown> { reportId: string }
interface ReportService { send(reportId: string): Promise<void> }
const reportServiceToken = createToken<ReportService>('services.reports')

export class SendReport extends Job<SendReportPayload> {
  static readonly tries = 3
  static readonly queue = 'reports'
  static readonly backoff = [1_000, 5_000]

  readonly payload: SendReportPayload

  constructor(payload: Record<string, unknown>) {
    super()
    if (typeof payload.reportId !== 'string') throw new Error('reportId is required')
    this.payload = { reportId: payload.reportId }
  }
  async handle(resolver: Resolver) {
    await resolver.make(reportServiceToken).send(this.payload.reportId)
  }
}
```

Registra los jobs serializados antes de que un worker los rehidrate y usa el contrato `Queue`.

```ts
registry.register(SendReport.name, SendReport)
await queue.push(new SendReport({ reportId: 'report_1' }))
await queue.later(60_000, new SendReport({ reportId: 'report_2' }))
await queue.sync(new SendReport({ reportId: 'report_3' }))
```

| API | Proposito |
|---|---|
| `Job.serialize()` | Produce el payload versionado. Implementa `handle()` y opcionalmente `failed()`. |
| `InMemoryJobRegistry.register()` | Asocia el nombre serializado con su constructor. |
| `InMemoryJobRegistry.rehydrate()` | Recrea un job o lanza `JobNotRegisteredError`. |
| `JobRunner.run()` / `failed()` | Ejecuta un job serializado y su hook de fallo en un scope. |
| `Queue.push()` / `later()` / `sync()` | Encola, retrasa o ejecuta inmediatamente un job. |
| `Queue.size()` / `clear()` | Consulta o limpia jobs, opcionalmente por nombre de cola. |
| `Queue.onFailed()` | Registra un observador de fallos terminales. |
| `PushOptions` | Sobrescribe `tries`, `delay`, `queue` y `backoff`. |
| `QueueFake` | Guarda pushes; usa `assertPushed()`, `size()` y `clear()`. |

```ts
import { QueueFake } from '@nuxt-laravelize/queue/testing'

const queue = new QueueFake()
await queue.push(new SendReport({ reportId: 'report_1' }))
queue.assertPushed(SendReport)
```

## Adapter BullMQ

`@nuxt-laravelize/queue-bullmq` es un driver persistente solo para Node. Instalalo con la cola portable y proporciona un cliente `ioredis`.

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq bullmq ioredis
```

```ts
import Redis from 'ioredis'
import { BullMQConnection, BullMQQueue, BullMQWorker } from '@nuxt-laravelize/queue-bullmq/runtime'

const connection = new BullMQConnection(new Redis(process.env.REDIS_URL!))
const queue = new BullMQQueue(connection, runner)
const worker = new BullMQWorker(connection, registry, runner)

await queue.push(new SendReport({ reportId: 'report_1' }))
await worker.work('reports', 4)
// Durante el apagado ordenado:
await worker.stop()
await queue.close()
```

`FailureReporter.listen()` observa fallos terminales y `report()` notifica a los observadores. El CLI del worker carga un export default `{ worker }` desde `laravelize.queue.config.mjs` (o `--config=path`):

```js
// laravelize.queue.config.mjs
import { worker } from './server/queue.js'

export default { worker }
```

```bash
pnpm exec laravelize-queue-work --queue=reports --concurrency=4
```

## Listeners encolados

`@nuxt-laravelize/events-queue` conecta listeners marcados con `shouldQueue: true` a una cola sin acoplar los paquetes base.

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue @nuxt-laravelize/events-queue
```

```ts
class WelcomeUserListener implements Listener<UserRegistered> {
  readonly shouldQueue = true as const
  async handle(event: UserRegistered) { /* send welcome message */ }
}

events.listen(UserRegistered, welcomeUserListenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Proposito |
|---|---|
| `EventRegistry.register()` | Registra constructores serializables por nombre. El adapter lo llama automaticamente. |
| `EventRegistry.make(name, args)` | Recrea un evento registrado desde argumentos de constructor. |
| `QueueListenerAdapter.enqueue()` | Encola eventos que implementan `toPayload()` como `ListenerJob`; devuelve `false` para los demas. |
| `ListenerJob` | Resuelve y ejecuta el listener original dentro del worker. |
| `eventRegistryToken` | Resuelve el registro compartido. |

## Mail

`@nuxt-laravelize/mail` ofrece mailables portables y transports de log y compatibles con Resend. Nodemailer esta aislado en `/node`. `useMailer(event)` se autoimporta en Nitro.

```bash
pnpm add @nuxt-laravelize/mail
```

```ts
import { Mailable } from '@nuxt-laravelize/mail/runtime'

class WelcomeMail extends Mailable {
  constructor(private readonly email: string) { super() }
  to() { return this.email }
  from() { return 'team@example.com' }
  subject() { return 'Welcome' }
  render() { return '<h1>Welcome!</h1>' }
  text() { return 'Welcome!' }
  attachments() { return [{ filename: 'guide.txt', content: 'Getting started' }] }
}

await mailer.send(new WelcomeMail('ada@example.com'))
```

| API | Proposito |
|---|---|
| `Mailable.toMessage()` | Construye un `MailMessage` normalizado desde los metodos de la clase. |
| `LogMailer.send()` | Registra mensajes sin entrega externa. |
| `ResendMailer(client, defaultFrom)` | Envia mediante un cliente que implemente `ResendClient`. |
| `NodemailerMailer(transport, defaultFrom)` | Envia con un transport compatible con Nodemailer desde `/node`. |
| `mailerToken` | Resuelve el `Mailer` configurado. |
| `MailFake` | Guarda correos; usa `assertSent()` y `reset()`. |

## Notifications

`@nuxt-laravelize/notifications` enruta notificaciones por canales nombrados. El paquete base solo registra log y no instala mail ni queue. `useNotifications(event)` se autoimporta en Nitro.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['log'] as const }
  toLog() { return 'Invoice inv_1 was paid' }
}

const user = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : 'user_1',
}
await notifications.send(user, new InvoicePaid())
```

| API | Proposito |
|---|---|
| `DefaultNotificationManager.register()` | Registra un `NotificationChannel` personalizado. |
| `send()` / `sendNow()` | Envia a uno o varios notifiables mediante `via()`. |
| `route(channel, address)` | Inicia un `PendingNotification`; encadena `.route()` y termina con `.notify()`. |
| `LogChannel.send()` | Registra `notification.toLog()` o `toArray()`. |
| `notificationManagerToken` | Resuelve el manager configurado. |
| `NotificationFake` | Guarda notificaciones y ofrece `assertSentTo()`. |

```ts
await notifications
  .route('log', 'user_1')
  .notify(new InvoicePaid())
```

## HTTP

`@nuxt-laravelize/http` proporciona el cliente Nuxt autoimportado `useHttp`, requests, middleware, resources, paginacion, gates y policies para Nitro.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/http'],
  laravelizeHttp: {
    baseURL: 'https://api.example.com',
    signingKey: '',
    signingOrigin: 'https://app.example.com',
  },
})
```

Genera al menos 32 bytes aleatorios con `openssl rand -base64 32` y define la clave privada mediante `NUXT_LARAVELIZE_HTTP_SIGNING_KEY`. Nunca la coloques bajo `runtimeConfig.public` ni incluyas una clave de produccion en el repositorio. `signingOrigin` proporciona un origen canonico permitido en vez de confiar en `Host` y headers de protocolo reenviados por el request.

```ts
const { data, error, status, refresh } = await useHttp<User>('/users/1')
const { data: created } = await useHttp<User>('/users', {
  method: 'POST',
  body: { name: 'Ada' },
})
```

### Form requests y handlers

`FormRequest.body()`, `query()` y `params()` aceptan cualquier implementacion Standard Schema. `authorize(event)` devuelve un boolean. `defineLaravelizedHandler()` resuelve un controller token, ejecuta middleware global y de ruta, valida el input y serializa resources.

El ejemplo usa Zod como implementacion Standard Schema: `pnpm add zod`.

```ts
import { createToken } from '@nuxt-laravelize/core/runtime'
import { FormRequest, LengthAwarePaginator, Resource, defineLaravelizedHandler, type ValidatedInput } from '@nuxt-laravelize/http/runtime'
import { z } from 'zod'

class CreateUserRequest extends FormRequest {
  body() { return z.object({ name: z.string().min(1) }) }
  authorize() { return true }
}

class UserResource extends Resource<{ id: string, name: string }> {
  toArray() { return { id: this.resource.id, name: this.resource.name } }
}

class UserController {
  async store(input: ValidatedInput<CreateUserRequest>) {
    return new UserResource({ id: 'user_1', name: input.body.name })
  }
}

const userControllerToken = createToken<UserController>('controllers.users')

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'store',
  request: CreateUserRequest,
})
```

Implementa `Middleware.handle(event, next)` y registra su token en el array `middleware` del handler. `globalMiddlewareToken` contiene tokens aplicados a todos los handlers Laravelized.

### URLs firmadas y temporales

`HmacUrlSigner` protege origen, path y query con HMAC-SHA256. El servicio configurado esta disponible mediante `useUrlSigner(event)` y `urlSignerToken`.

```ts
// server/api/invitations/[id]/link.get.ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const target = new URL(`/api/invitations/${getRouterParam(event, 'id')}`, signingOrigin)
  const url = await useUrlSigner(event).sign(target, {
    expiresAt: Date.now() + 30 * 60 * 1000,
  })
  return { url }
})
```

Protege un handler Laravelized con el autoimport `validateSignatureToken`:

```ts
export default defineLaravelizedHandler({
  controller: invitationControllerToken,
  method: 'accept',
  middleware: [validateSignatureToken],
})
```

Usa el mismo middleware en un handler Nitro normal:

```ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const middleware = new ValidateSignature(useUrlSigner(event), { origin: signingOrigin })
  return await middleware.handle(event, async () => ({ accepted: true }))
})
```

| API | Proposito |
|---|---|
| `HmacUrlSigner(secret)` | Crea un signer HMAC-SHA256 portable con Web Crypto. Claves menores de 32 bytes lanzan `MissingUrlSigningKeyError`. |
| `sign(url, options?)` | Reemplaza una firma; sus opciones soportan expiracion, modo relativo y binding al metodo HTTP. |
| `hasValidSignature(url, options?)` | Rechaza firmas ausentes, mal formadas, manipuladas o expiradas y puede exigir expiracion. |
| `ValidateSignature` | Middleware que rechaza requests invalidos con HTTP 403; soporta origen canonico, expiracion obligatoria y binding al metodo. |
| `urlSignerToken` / `useUrlSigner(event)` | Resuelve el signer configurado desde el contenedor del request. |
| `validateSignatureToken` | Middleware por defecto para firmas absolutas; resolverlo exige `signingOrigin`. |

La firma absoluta es el modo por defecto e incluye el origen. Para links independientes del proxy, usa `{ absolute: false }` tanto al firmar como al validar; el modo relativo protege solo path y query y no debe cruzar limites de tenants basados en host. El orden del query se normaliza, los fragments se ignoran porque el navegador no los envia al servidor y una URL temporal deja de ser valida en su segundo exacto de expiracion. Rotar la clave invalida links existentes.

Las URLs firmadas son credenciales bearer y pueden reutilizarse. Usa expiraciones cortas para verificacion, invitaciones y acciones con cambios de estado; liga esas firmas al metodo HTTP con `sign(..., { method: 'POST' })` y `new ValidateSignature(signer, { bindMethod: true, requireExpiration: true })`. Exige HTTPS en un proxy confiable y usa storage de la aplicacion cuando un link deba ser de un solo uso.

Los nombres de query `signature` y `expires` estan reservados. La firma reemplaza `signature`; pasa `expiresAt` explicitamente para crear o reemplazar `expires`.

### Resources y paginacion

| API | Proposito |
|---|---|
| `Resource.toArray(event)` | Transforma un valor. Usa `when()` y `mergeWhen()` para campos condicionales. |
| `Resource.collection(items)` | Crea una coleccion normal o paginada. |
| `withoutWrapping()` / `restoreWrapping()` | Desactiva o restaura globalmente el wrapper `{ data: ... }`. |
| `ResourceCollection.toArray()` | Serializa cada resource. |
| `LengthAwarePaginator` | Agrega totales, metadata y links; `fromRequest()` lee query params. |
| `SimplePaginator` | Ofrece links anterior/siguiente sin total. |
| `CursorPaginator` | Ofrece navegacion por cursor codificado. |
| `parsePageParams()` / `parseCursorParams()` | Lee y limita parametros de paginacion. |
| `encodeCursor()` / `decodeCursor()` | Convierte cursores a y desde strings seguros para URLs. |
| `buildPageUrl()` / `buildCursorUrl()` / `getRequestPath()` | Construye links preservando path y query. |
| `isPaginator()` y guards de resources | Estrechan tipos en runtime. |

```ts
const paginator = LengthAwarePaginator.fromRequest(event, users, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})
return UserResource.collection(paginator)
```

### Gates y policies

| API | Proposito |
|---|---|
| `define(rule, callback)` | Registra una regla de autorizacion. |
| `allows()` / `denies()` | Comprueba una regla. |
| `authorize()` | Lanza un error H3 403 cuando se deniega. |
| `any()` / `none()` | Comprueba varias reglas. |
| `DefaultPolicyRegistry.register(modelName, policy)` | Registra una policy para el nombre del constructor del modelo. |
| `Policy.before(user)` | Permite o deniega opcionalmente todas las acciones antes de su metodo. |
| `discoverPoliciesByConvention(rootDir)` | Encuentra archivos de policies para adapters. |

```ts
import { InMemoryGate } from '@nuxt-laravelize/http/runtime'

const gate = new InMemoryGate()
gate.define('update-invoice', (user, invoice) => user.id === invoice.ownerId)
await gate.authorize('update-invoice', currentUser, invoice)
```

## Database

`@nuxt-laravelize/database` proporciona factories y seeders independientes del ORM. Tu aplicacion proporciona los callbacks de persistencia.

```bash
pnpm add @nuxt-laravelize/database
```

```ts
import { Factory } from '@nuxt-laravelize/database/runtime'

interface UserDraft { name: string, email: string, active: boolean }

class UserFactory extends Factory<UserDraft> {
  protected definition(): UserDraft {
    return {
      name: this.faker.string.word(),
      email: `${this.faker.string.sample()}@example.com`,
      active: true,
    }
  }
}

const drafts = new UserFactory()
  .count(3)
  .state({ active: false })
  .sequence([{ name: 'Ada' }, { name: 'Grace' }])
  .make()

await new UserFactory().create(async (draft) => {
  await db.insert(users).values(draft)
})
```

| API | Proposito |
|---|---|
| `Factory.count()` | Define la cantidad devuelta por `make()` o `create()`. |
| `state()` | Aplica un valor parcial o mutator a cada item. |
| `sequence()` | Alterna estados especificos por item. |
| `make(overrides?)` | Construye valores sin persistir. |
| `create(persister, overrides?)` | Construye valores y espera el callback de persistencia. |
| `builtInFaker()` | Devuelve el `FakerShim` ligero incluido. |
| `DefaultFactoryRegistry` | Proporciona `register`, `list`, `has` y `resolve`. |
| `DefaultSeederRegistry` | Proporciona las mismas operaciones para factories async de seeders. |
| `Seeder.call(name)` | Ejecuta otro seeder registrado en el mismo registry. |
| `discoverSeedersByConvention(rootDir)` | Encuentra archivos de seeders para adapters. |

```ts
import { DefaultSeederRegistry, Seeder } from '@nuxt-laravelize/database/runtime'

class UserSeeder extends Seeder {
  async run() { await new UserFactory().create(saveUser) }
}

class DatabaseSeeder extends Seeder {
  async run() { await this.call('users') }
}

const seeders = new DefaultSeederRegistry()
seeders.register('users', () => new UserSeeder())
seeders.register('database', () => new DatabaseSeeder())
await (await seeders.resolve('database')).run()
```

El CLI de seeders carga factories de providers desde `laravelize.seed.config.mjs` (o `--config=path`). Los providers deben registrar `seederRegistryToken` y los seeders solicitados.

```js
// laravelize.seed.config.mjs
import DatabaseServiceProvider from './server/providers/DatabaseServiceProvider.js'

export default {
  providers: [() => new DatabaseServiceProvider()],
}
```

```bash
pnpm exec laravelize-db-seed --class=database
```

Omite `--class` para ejecutar todos los seeders registrados en el orden del registry.

## Testing

`@nuxt-laravelize/testing` agrega los fakes oficiales y los monta en un contenedor sellado.

```bash
pnpm add -D @nuxt-laravelize/testing
```

```ts
import { mountLaravelize } from '@nuxt-laravelize/testing'

const app = mountLaravelize()
await app.events.dispatch(new UserRegistered('user_1'))
await app.queue.push(new SendReport({ reportId: 'report_1' }))
await app.mail.send(new WelcomeMail('ada@example.com'))

app.events.assertDispatched(UserRegistered)
app.queue.assertPushed(SendReport)
app.mail.assertSent(WelcomeMail)
```

`mountLaravelize()` devuelve `container`, `events`, `queue`, `mail` y `notifications`. El paquete tambien reexporta `FakeLogger`, `EventFake`, `QueueFake`, `MailFake` y `NotificationFake` para tests enfocados.

## Scheduler

`@nuxt-laravelize/scheduler` define schedules independientes del framework. No forma parte del preset Nuxt. El adapter experimental `/nitro3` requiere exactamente `nitro@3.0.260610-beta` y no debe reemplazar Nitro de Nuxt 4.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'

const schedule = defineSchedule((schedule) => {
  schedule.task('reports:hourly').hourly()
  schedule.task('cleanup:daily').daily()
  schedule.task('reports:daily').dailyAt('02:30')
  schedule.task('billing:weekdays').cron('0 8 * * 1-5')
})

console.log(schedule.all())
```

`Schedule.task()` devuelve un `PendingSchedule`. Terminalo con `cron()`, `hourly()`, `daily()` o `dailyAt()`. Expresiones cron de cinco campos invalidas lanzan `InvalidCronExpressionError`.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { compileSchedule, defineScheduledOperation, runScheduledTask } from '@nuxt-laravelize/scheduler/nitro3'

export default defineScheduledOperation('reports:daily', {
  execute: async payload => generateReport(String(payload.reportId ?? 'daily')),
}, 'Generate the daily report')

const nitroSchedule = defineSchedule((schedule) => {
  schedule.task('reports:daily').dailyAt('02:30')
})

const compiled = compileSchedule(nitroSchedule, {
  'reports:daily': { handler: './tasks/reports' },
})

await runScheduledTask('reports:daily', { reportId: 'report_1' })
```

Combina `compiled` con una configuracion Nitro 3 standalone. El soporte real de scheduling depende del preset de deployment seleccionado.

## Entrypoints publicos

| Paquete | Entrypoints de runtime | Entrypoint de testing |
|---|---|---|
| `core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `events` | `/runtime` | `/testing` |
| `queue` | `/runtime` | `/testing` |
| `queue-bullmq` | `/runtime` | - |
| `events-queue` | `/runtime` | - |
| `mail` | `/runtime`, `/node` | `/testing` |
| `notifications` | `/runtime` | `/testing` |
| `http` | `/runtime` | - |
| `database` | `/runtime` | - |
| `testing` | raiz del paquete | raiz del paquete |
| `scheduler` | raiz del paquete, `/nitro3` | - |
| `nuxt` | raiz del paquete | - |

# nuxt-laravelize

[English](./README.md) | Español

Módulo de Nuxt 4 que aporta primitivas de arquitectura inspiradas en Laravel a Nuxt y Nitro: contenedor DI por request, service providers auto-descubiertos, controllers single-action con validación, eventos, colas, mail, notificaciones, pagination, autorización basada en policies, logging, i18n, seeding y testing helpers — todo cableado en torno al patrón DDD estilo CodelyTV.

## El stack Laravelize

| Paquete | Rol |
|---|---|
| **[`@luckys_luis/nuxt-laravelize`](./)** *(este)* | Runtime — DI container, controllers, queues, mail, notifications, i18n, policies, seeders, factories, testing helpers. |
| [`@luckys_luis/nuxt-ddd-toolkit`](../nuxt-ddd-toolkit) | Toolchain — plugin ESLint DDD de 12 reglas, CLI de scaffolding (`laravelize new:*`), presets compartidos, 15 skills de IA con auto-link. |

---

## Tabla de contenido

- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [DI Container & Tokens](#di-container--tokens)
- [Service Providers](#service-providers)
- [Controllers & Form Requests](#controllers--form-requests)
- [Middleware](#middleware)
- [API Resources](#api-resources)
- [Pagination](#pagination)
- [Events](#events)
- [Queue & Jobs](#queue--jobs)
- [Autorización (Gate & Policies)](#autorización-gate--policies)
- [Logging](#logging)
- [Mail](#mail)
- [Notifications](#notifications)
- [Localization (i18n)](#localization-i18n)
- [Base de datos: Seeders & Factories](#base-de-datos-seeders--factories)
- [Testing helpers](#testing-helpers)
- [Server composables](#server-composables)
- [CLIs (bins)](#clis-bins)
- [Mapa de features](#mapa-de-features)
- [Desarrollo](#desarrollo)
- [Licencia](#licencia)

---

## Instalación

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

**Peers requeridos:** `nuxt >= 4.0.0`, `h3 >= 1.0.0`

**Peers opcionales** (instala solo lo que uses):

```bash
pnpm add zod                 # o valibot — para validación de FormRequest
pnpm add bullmq ioredis      # para el driver de cola BullMQ
pnpm add nodemailer          # para NodemailerMailer
pnpm add resend              # para ResendMailer
pnpm add @faker-js/faker     # para integración de faker con Factory
```

---

## Inicio rápido

1. Añade el módulo a tu configuración de Nuxt:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize'],
})
```

2. Define un token de controller y su contrato:

```ts
// server/controllers/userTokens.ts
import { createToken } from '#imports' // auto-imported

export interface UserControllerContract {
  find(input: { body: undefined, query: undefined, params: { id: string } }): UserResource
}

export const userControllerToken = createToken<UserControllerContract>('app.user-controller')
```

3. Implementa el controller:

```ts
// server/controllers/UserController.ts
import { createError } from 'h3'
import { UserResource } from '../resources/UserResource'

export class UserController implements UserControllerContract {
  find(input: { body: undefined, query: undefined, params: { id: string } }) {
    const user = db.find(input.params.id)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    return new UserResource(user)
  }
}
```

4. Regístralo en un service provider:

```ts
// server/providers/UserControllerProvider.ts
import type { Container } from '#imports'
import type { ServiceProvider } from '#imports'

import { UserController } from '../controllers/UserController'
import { userControllerToken } from '../controllers/userTokens'

export default class UserControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(userControllerToken, () => new UserController())
  }
}
```

5. Crea un Form Request con validación Zod:

```ts
// server/requests/FindUserRequest.ts
import { z } from 'zod'
import { FormRequest } from '#imports'

export class FindUserRequest extends FormRequest {
  override params() {
    return z.object({ id: z.string() })
  }
}
```

6. Conéctalo todo en una ruta de Nitro:

```ts
// server/api/users/[id].get.ts
import { userControllerToken } from '../../controllers/userTokens'
import { FindUserRequest } from '../../requests/FindUserRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'find',
  request: FindUserRequest,
})
```

Eso es todo. Cuando un `GET /api/users/123` llegue a tu servidor, Laravelize:

1. Resolverá el DI container con scope de request
2. Ejecutará el middleware global + cualquier middleware por ruta
3. Validará los parámetros de ruta contra el esquema Zod (422 en caso de fallo)
4. Resolverá `UserController` desde el container
5. Llamará a `controller.find({ params: { id: '123' }, body: undefined, query: undefined })`
6. Serializará el `UserResource` devuelto a JSON

---

## DI Container & Tokens

Laravelize envuelve [awilix](https://github.com/jeffijoe/awilix) con un sistema `Token<T>` type-safe. Cada request obtiene un container con scope; los providers registran los bindings durante el boot.

### Crear tokens

```ts
import { createToken } from '#imports'

// Type-safe — el token transporta su tipo en tiempo de compilación
export const userRepositoryToken = createToken<UserRepository>('app.user-repository')
export const loggerToken = createToken<Logger>('app.logger')
```

### Lifetimes de los bindings

```ts
import type { Container } from '#imports'

export default class AppProvider implements ServiceProvider {
  register(container: Container): void {
    // Instancia nueva en cada resolve (por defecto)
    container.bind(userRepositoryToken, () => new InMemoryUserRepository())

    // Una única instancia compartida en toda la app
    container.singleton(loggerToken, () => new ConsoleLogger())

    // Una instancia por scope de request (se reinicia en cada request)
    container.scoped(userControllerToken, resolver => new UserController(
      resolver.make(userRepositoryToken),
    ))

    // Registrar un valor pre-construido
    container.instance(configToken, { apiUrl: 'https://api.example.com' })
  }
}
```

### Resolver desde el container

```ts
// Dentro de un route handler — usa el container con scope de request
const container = useContainer(event)
const repo = container.make(userRepositoryToken)

// Dentro de una factory de provider — usa el argumento resolver
container.scoped(userControllerToken, (resolver) => {
  return new UserController(resolver.make(userRepositoryToken))
})
```

### Scopes y sellado

```ts
// Crear un scope hijo (hereda los registros del padre)
const scope = container.createScope()

// Sellar el container — impide registros posteriores
// (lo llama automáticamente el Kernel tras el boot de todos los providers)
container.seal()
```

---

## Service Providers

Los providers siguen el ciclo de vida en dos fases de Laravel: **register** (vincular cosas) → **boot** (usar cosas).

```ts
import type { Container } from '#imports'
import type { ServiceProvider } from '#imports'
import { dispatcherToken, InMemoryDispatcher } from '#imports'

export default class EventsProvider implements ServiceProvider {
  // Fase 1: registrar bindings — solo vincular, no usar otros servicios
  register(container: Container): void {
    container.singleton(dispatcherToken, resolver => new InMemoryDispatcher(resolver))
    container.bind(sendWelcomeEmailToken, () => new SendWelcomeEmailListener())
  }

  // Fase 2: boot — todos los registros están disponibles, es seguro cablear cosas
  boot(container: Container): void {
    const dispatcher = container.make(dispatcherToken)
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
  }
}
```

### Auto-discovery

Los providers en `server/providers/*.ts` (o `server/contexts/**/infrastructure/*ServiceProvider.ts`) se auto-descubren y bootean por el Kernel.

---

## Controllers & Form Requests

### `defineLaravelizedHandler`

Envuelve un método de controller en un `EventHandler` de h3 con middleware, autorización, validación y serialización de resources.

```ts
// server/api/posts.post.ts
export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'create',
  request: CreatePostRequest,
  middleware: [authMiddlewareToken], // middleware por ruta opcional
})
```

### Form Requests

Extiende `FormRequest` y sobrescribe cualquiera de `body()`, `query()`, `params()` o `authorize()`. La validación usa [Standard Schema v1](https://github.com/standard-schema/standard-schema) — compatible con Zod, Valibot, ArkType y más.

```ts
import { z } from 'zod'
import { FormRequest } from '#imports'
import { gateToken } from '#imports'
import { useContainer } from '#imports'

export class CreatePostRequest extends FormRequest {
  // Validar el body de la request
  override body() {
    return z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    })
  }

  // Validar la query string
  override query() {
    return z.object({
      draft: z.boolean().optional().default(false),
    })
  }

  // Gate de autorización — se ejecuta ANTES de la validación
  // Devolver false → 403 Forbidden
  override async authorize(event: H3Event): Promise<boolean> {
    const gate = useContainer(event).make(gateToken)
    const user = event.context.user
    if (!user) return false
    return await gate.allows('create-post', user)
  }
}
```

### Formato de error de validación

Cuando la validación falla, la respuesta es HTTP 422 con un body compatible con Laravel:

```json
{
  "message": "Validation failed",
  "errors": {
    "body.title": ["String must contain at least 1 character(s)"],
    "body.content": ["String must contain at least 1 character(s)"]
  }
}
```

### Usar Valibot en lugar de Zod

```ts
import { object, string, minLength } from 'valibot'
import { FormRequest } from '#imports'

export class CreateUserRequest extends FormRequest {
  override body() {
    return object({
      email: string([minLength(1)]),
      name: string([minLength(1)]),
    })
  }
}
```

---

## Middleware

El Middleware sigue el pipeline estilo Koa: cada middleware recibe `(event, next)` y puede ejecutar código antes/después del siguiente handler.

### Definir middleware

```ts
import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'
import type { Middleware } from '#imports'

export class LoggingMiddleware implements Middleware {
  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const start = Date.now()
    const response = await next()
    setResponseHeader(event, 'x-response-time', `${Date.now() - start}ms`)
    return response
  }
}
```

### Registrar middleware global

```ts
import { globalMiddlewareToken } from '#imports'

export default class MiddlewareProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(loggingMiddlewareToken, () => new LoggingMiddleware())

    // Estos se ejecutan en cada laravelized handler
    container.instance(globalMiddlewareToken, [loggingMiddlewareToken])
  }
}
```

### Middleware por ruta

```ts
export default defineLaravelizedHandler({
  controller: protectedControllerToken,
  method: 'index',
  middleware: [blockingMiddlewareToken], // se añade encima del middleware global
})
```

---

## API Resources

Los Resources transforman tus modelos de dominio en arrays aptos para JSON, replicando el `JsonResource` de Laravel.

### Resource individual

```ts
import type { H3Event } from 'h3'
import { Resource } from '#imports'

interface User { id: string, email: string, name: string }

export class UserResource extends Resource<User> {
  override toArray(event: H3Event): Record<string, unknown> {
    return {
      id: this.resource.id,
      email: this.resource.email,
      name: this.resource.name,
    }
  }
}
```

### Resources anidados

```ts
export class PostResource extends Resource<Post> {
  override toArray(_event: H3Event): Record<string, unknown> {
    const author = findAuthor(this.resource.authorId)
    return {
      id: this.resource.id,
      title: this.resource.title,
      // Los resources anidados se serializan recursivamente
      author: author ? new UserResource(author) : null,
    }
  }
}
```

### Colecciones de resources

```ts
// A partir de un array
const collection = UserResource.collection(users)
// → ResourceCollection<UserResource>

// A partir de un paginator
const paginated = UserResource.collection(paginator)
// → PaginatedResourceCollection<UserResource>
```

### Devolver resources desde controllers

Los Resources se auto-serializan con `defineLaravelizedHandler` — simplemente devuélvelos:

```ts
export class UserController {
  find(input): Resource<User> {
    return new UserResource(user)
  }

  list(input): PaginatedResourceCollection<UserResource> {
    return UserResource.collection(paginator)
  }
}
```

---

## Pagination

Tres tipos de paginator que replican las primitivas de paginación de Laravel.

### LengthAwarePaginator (basado en offset, conoce el total)

```ts
import { LengthAwarePaginator } from '#imports'

// Construcción manual
const paginator = new LengthAwarePaginator(items, total, perPage, currentPage)

// Desde la request — lee `page` y `per_page` de la query string
const paginator = LengthAwarePaginator.fromRequest(event, items, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})

// Salida de meta + links (snake_case, compatible con Laravel)
paginator.toMeta(event)  // { current_page, from, last_page, path, per_page, to, total }
paginator.toLinks(event) // { first, last, prev, next }
```

### SimplePaginator (sin conteo total)

```ts
import { SimplePaginator } from '#imports'

const paginator = SimplePaginator.fromRequest(event, items, hasMore)
```

### CursorPaginator (basado en cursor, el más eficiente)

```ts
import { CursorPaginator } from '#imports'

const paginator = CursorPaginator.fromRequest(
  event,
  items,
  nextCursorKey,  // string | null — la clave del último item
  prevCursorKey,  // string | null — la clave del primer item
)

// El cursor se codifica en base64url en la URL: ?cursor=eyJrZXki...
```

### Respuesta con resource paginado

```ts
export class UserController {
  list(input) {
    const paginator = LengthAwarePaginator.fromRequest(event, slice, total)
    return UserResource.collection(paginator)
  }
}
// Salida: { data: [...], links: { first, last, prev, next }, meta: { current_page, ... } }
```

---

## Events

### Definir eventos

```ts
// server/events/UserRegistered.ts
export class UserRegistered {
  constructor(public readonly userId: string) {}

  // Requerido para listeners encolados — serializa los argumentos del constructor
  toPayload(): readonly unknown[] {
    return [this.userId]
  }
}
```

### Definir listeners

```ts
import type { Listener } from '#imports'
import type { UserRegistered } from '../events/UserRegistered'

export class SendWelcomeEmailListener implements Listener<UserRegistered> {
  handle(event: UserRegistered): void {
    console.log(`Sending welcome email to user ${event.userId}`)
  }
}

// Listener encolado — se envía a la cola en lugar de ejecutarse inline
export class ProcessRegistrationListener implements Listener<UserRegistered>, ShouldQueue {
  readonly shouldQueue = true as const

  async handle(event: UserRegistered): Promise<void> {
    // Se ejecuta dentro de un queue worker
  }
}
```

### Registrar listeners

```ts
export default class EventsProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(dispatcherToken, resolver => new InMemoryDispatcher(resolver))
    container.bind(sendWelcomeEmailToken, () => new SendWelcomeEmailListener())
  }

  boot(container: Container): void {
    const dispatcher = container.make(dispatcherToken)
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
  }
}
```

### Listeners wildcard

```ts
dispatcher.listenAny(anyEventLoggerToken) // recibe todos los eventos dispatchados
```

### Suscriptores de eventos

```ts
import type { Dispatcher, EventSubscriber } from '#imports'

export class UserSubscriber implements EventSubscriber {
  subscribe(dispatcher: Dispatcher): void {
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
    dispatcher.listen(UserRegistered, logUserRegistrationToken)
    dispatcher.listenAny(anyEventLoggerToken)
  }
}

// Registrar en boot
dispatcher.subscribe(userSubscriberToken)
```

### Dispatchar eventos

```ts
export class UserController {
  readonly #dispatcher: Dispatcher

  constructor(dispatcher: Dispatcher) {
    this.#dispatcher = dispatcher
  }

  async register(input) {
    const user = create(input.body)
    await this.#dispatcher.dispatch(new UserRegistered(user.id))
    return user
  }
}
```

---

## Queue & Jobs

### Definir jobs

```ts
import { Job } from '#imports'

export class ProcessVideoJob extends Job {
  static override readonly tries = 3
  static override readonly queue = 'default'
  static override readonly backoff = 1000 // ms

  constructor(public readonly videoId: string) {
    super()
  }

  async handle(): Promise<void> {
    await transcodeVideo(this.videoId)
  }

  serialize(): { name: string, args: readonly unknown[] } {
    return { name: 'ProcessVideoJob', args: [this.videoId] }
  }
}
```

### Dispatchar jobs

```ts
import { queueToken } from '#imports'

// Desde un controller
const queue = container.make(queueToken)
await queue.push(new ProcessVideoJob('video-123'))

// Dispatch diferido
await queue.later(5000, new ProcessVideoJob('video-456')) // retardo de 5 segundos

// Con opciones por push
await queue.push(new ProcessVideoJob('video-789'), {
  tries: 5,
  delay: 2000,
  queue: 'videos',
  backoff: 3000,
})
```

### Drivers de cola

**InMemoryQueue** (dev/test — por defecto):

```ts
import { InMemoryQueue } from '#imports'

container.singleton(queueToken, resolver =>
  new InMemoryQueue(resolver, resolver.make(jobRegistryToken)),
)
```

**BullMQQueue** (producción):

```ts
import { BullMQQueue } from '#imports'
import { BullMQConnection } from '#imports'

const connection = new BullMQConnection({ host: 'localhost', port: 6379 })
container.singleton(queueToken, () => new BullMQQueue(connection))
```

### Registro de jobs

Los jobs deben registrarse para que el queue worker pueda rehidratarlos desde payloads serializados:

```ts
import { InMemoryJobRegistry } from '#imports'
import { ListenerJob } from '#imports'

const registry = new InMemoryJobRegistry()
registry.registerJob('ProcessVideoJob', ProcessVideoJob)
registry.registerJob('laravelize.ListenerJob', ListenerJob)
registry.registerEvent('UserRegistered', UserRegistered) // para listeners de eventos encolados
container.singleton(jobRegistryToken, () => registry)
```

### Ejecutar el queue worker

```bash
# Bin CLI
laravelize-queue-work --queue=default --concurrency=4
```

---

## Autorización (Gate & Policies)

### Definir gates

```ts
import { InMemoryGate } from '#imports'

container.singleton(gateToken, () => {
  const gate = new InMemoryGate()
  gate.define('create-post', (user) => {
    return (user as { role: string }).role === 'author'
  })
  gate.define('update-post', (user, post) => {
    return post.authorId === user.id
  })
  return gate
})
```

### Usar gates

```ts
const gate = container.make(gateToken)

// Comprobaciones booleanas
const canCreate = await gate.allows('create-post', user)
const cannotEdit = await gate.denies('update-post', user, post)

// En un FormRequest
override async authorize(event: H3Event): Promise<boolean> {
  const gate = useContainer(event).make(gateToken)
  return await gate.allows('create-post', event.context.user)
}
```

### Definir policies

```ts
import { Policy } from '#imports'

interface User { id: string, admin: boolean }
interface Invoice { customerId: string, status: 'paid' | 'draft' }

export class InvoicePolicy extends Policy<User, Invoice> {
  // Se ejecuta antes que cualquier método de policy — devolver true/false para cortocircuitar, null para defer
  override before(user: User): boolean | null {
    return user.admin ? true : null
  }

  view(user: User, invoice: Invoice): boolean {
    return invoice.customerId === user.id
  }

  update(user: User, invoice: Invoice): boolean {
    return invoice.status !== 'paid' && invoice.customerId === user.id
  }
}
```

### Registrar y auto-descubrir policies

```ts
import { DefaultPolicyRegistry } from '#imports'

// Registro manual
const registry = new DefaultPolicyRegistry()
registry.register('Invoice', new InvoicePolicy())

// Descubrimiento por convención — escanea server/policies/*.policy.ts
const policies = discoverPoliciesByConvention(process.cwd())
```

### Cómo interactúan gate + policy

Cuando llamas a `gate.allows('view', user, invoice)`:

1. El Gate comprueba si el último argumento es un objeto con un nombre de constructor
2. Busca una policy para ese nombre de modelo en el registro
3. Si la encuentra, ejecuta `policy.before(user)` — `true`/`false` cortocircuita, `null` continúa
4. Llama a `policy.view(user, invoice)` — el método que coincide con el nombre de la regla
5. Si ninguna policy coincide, recurre a las reglas basadas en closures del gate

---

## Logging

### Loggers

```ts
import { ConsoleLogger, StructuredLogger, FileLogger } from '#imports'

// Salida por consola con prefijo [LEVEL]
const consoleLogger = new ConsoleLogger({ threshold: 'info' })

// Líneas JSON a stdout (para ELK/Datadog etc.)
const structured = new StructuredLogger({
  threshold: 'info',
  serviceName: 'my-app',
  sink: process.stdout,
})

// Fichero con rotación por tamaño (10 MiB por defecto)
const file = new FileLogger({
  path: '/var/log/app.log',
  threshold: 'debug',
  maxBytes: 10 * 1024 * 1024,
})
```

### Niveles de log

```ts
logger.debug('Información detallada para depuración')
logger.info('Algo ocurrió', { userId: '123' })
logger.warn('Algo inusual', { attempts: 3 })
logger.error('Algo falló', { error: err.message })
logger.critical('El sistema está caído', { service: 'db' })
```

### Registrar el logger

```ts
container.singleton(loggerToken, () => new StructuredLogger({ serviceName: 'api' }))
```

### Usar el logger en servicios

```ts
import { loggerFor } from '#imports'

// Búsqueda segura — recurre a ConsoleLogger si no está registrado
const logger = loggerFor(resolver)
logger.info('Queue job processed', { jobId })
```

---

## Mail

### Definir mailables

```ts
import { Mailable } from '#imports'

export class WelcomeMail extends Mailable {
  constructor(
    private readonly toEmail: string,
    private readonly name: string,
  ) {
    super()
  }

  override to(): string { return this.toEmail }
  override from(): string { return 'no-reply@example.com' }
  override subject(): string { return `Welcome, ${this.name}` }
  override render(): string { return `<p>Hello ${this.name}</p>` }
  override text(): string { return `Hello ${this.name}` }
}
```

### Drivers de mail

```ts
import { LogMailer, NodemailerMailer, ResendMailer } from '#imports'

// Driver Log (dev/test — escribe en el logger en lugar de enviar)
container.singleton(mailerToken, resolver =>
  new LogMailer(resolver.make(loggerToken)))

// Nodemailer (SMTP)
container.singleton(mailerToken, () =>
  new NodemailerMailer(transport, 'default@example.com'))

// Resend (API)
container.singleton(mailerToken, () =>
  new ResendMailer(resendClient, 'default@example.com'))
```

### Enviar mail

```ts
const mailer = container.make(mailerToken)
await mailer.send(new WelcomeMail('ada@example.com', 'Ada'))
```

---

## Notifications

### Definir notifications

```ts
import { Notification } from '#imports'

export class InvoicePaidNotification extends Notification {
  constructor(private readonly invoiceId: string) {
    super()
  }

  // Determinar qué canales usar por notifiable
  override via(notifiable: Notifiable): readonly ChannelName[] {
    return notifiable.routeNotificationFor('mail')
      ? ['mail', 'log']
      : ['log']
  }

  // Opcional — requerido para el canal mail
  override toMail(notifiable: Notifiable): Mailable {
    return new InvoicePaidMail(notifiable.routeNotificationFor('mail')!, this.invoiceId)
  }

  // Opcional — para el canal log
  override toLog(notifiable: Notifiable): string {
    return `Invoice ${this.invoiceId} paid for ${notifiable.constructor.name}`
  }
}
```

### Notifiables

```ts
import type { Notifiable } from '#imports'

class User implements Notifiable {
  constructor(
    readonly id: string,
    readonly email: string,
  ) {}

  routeNotificationFor(channel: ChannelName): string | null {
    if (channel === 'mail') return this.email
    if (channel === 'queue') return this.id
    return null
  }
}
```

### Enviar notifications

```ts
const notifier = container.make(notificationManagerToken)
await notifier.send(user, new InvoicePaidNotification('inv-123'))
```

### Canal queue

El canal `queue` difiere la entrega empujando un `SendNotificationJob`:

```ts
// El canal queue automáticamente:
// 1. Filtra 'queue' de via() (evita bucle infinito)
// 2. Serializa la notification + la identidad del notifiable
// 3. Empuja un SendNotificationJob a la cola
// 4. El worker rehidrata y dispatcha a los canales restantes
```

### Canales personalizados

```ts
notifier.register('slack', new SlackChannel(webhookUrl))
await notifier.send(user, new NotificationWithSlack())
```

---

## Localization (i18n)

### Configurar el translator

```ts
import { DictionaryTranslator } from '#imports'

const translator = new DictionaryTranslator({
  dictionaries: {
    en: {
      'messages.welcome': 'Welcome, :name',
      'messages.apples': 'There is one apple|There are many apples',
    },
    es: {
      'messages.welcome': 'Bienvenido, :name',
      'messages.apples': 'Hay una manzana|Hay muchas manzanas',
    },
  },
  locale: 'en',
  fallbackLocale: 'en',
})

container.singleton(translatorToken, () => translator)
```

### Traducir

```ts
const t = container.make(translatorToken)

t.__('messages.welcome', { name: 'Ada' })
// → "Welcome, Ada"

t.choice('messages.apples', 1)
// → "There is one apple"

t.choice('messages.apples', 10)
// → "There are many apples"
```

### Cambiar locale en runtime

```ts
t.setLocale('es')
t.__('messages.welcome', { name: 'Ada' })
// → "Bienvenido, Ada"
```

### Pluralización

El formato delimitado por pipe soporta hasta 3 formas (zero / one / many):

```
'{0} There are none|{1} There is one|[2,*] There are :count'
```

```ts
t.choice('messages.apples', 0)  // → "There are none"
t.choice('messages.apples', 1)  // → "There is one"
t.choice('messages.apples', 10) // → "There are 10" (:count se inyecta automáticamente)
```

---

## Base de datos: Seeders & Factories

### Seeders

```ts
import { Seeder } from '#imports'

export class DemoUserSeeder extends Seeder {
  async run(): Promise<void> {
    await db.insert(users).values([
      { id: '1', email: 'ada@example.com', name: 'Ada Lovelace' },
      { id: '2', email: 'grace@example.com', name: 'Grace Hopper' },
    ])
  }
}
```

### Ejecutar seeders

```bash
# Bin CLI
laravelize-db-seed --class=DemoUserSeeder

# Descubrimiento por convención — escanea server/database/seeders/*.seeder.ts
```

### Factories

```ts
import { Factory } from '#imports'

interface User { id: string, email: string, name: string, active: boolean }

export class UserFactory extends Factory<User> {
  protected definition(): User {
    return {
      id: this.faker.string.uuid(),
      email: this.faker.internet.email(),
      name: this.faker.person.fullName(),
      active: true,
    }
  }

  // Métodos de estado personalizados
  suspended() {
    return this.state({ active: false })
  }
}
```

### Usar factories

```ts
const factory = new UserFactory()

// Construir sin persistir
const user = factory.make()        // → un User
const users = factory.count(5).make() // → User[]

// Construir + persistir
const user = await factory.create(async (u) => {
  await db.insert(users).values(u)
})

// Con overrides (el último gana)
const admin = factory.make({ active: true, name: 'Admin' })

// Con estados
const suspended = factory.suspended().make()
const suspendedBatch = factory.suspended().count(3).make()
```

### Registro de factories

```ts
import { DefaultFactoryRegistry } from '#imports'

const registry = new DefaultFactoryRegistry()
registry.register('User', () => new UserFactory())
container.singleton(factoryRegistryToken, () => registry)
```

---

## Testing helpers

Importa desde el subpath `./testing`:

```ts
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize/testing'
```

### Montar el harness de test

```ts
const harness = await mountLaravelize({
  // Opcionalmente bootea providers reales
  providers: [EventsProvider, QueueProvider],

  // Habilita fakes para cualquier subsistema
  fakes: {
    dispatcher: true,      // FakeDispatcher
    queue: true,           // FakeQueue
    mailer: true,          // FakeMailer
    notifications: true,   // FakeNotificationManager
    logger: true,          // FakeLogger
  },
})
```

### Aserciones sobre eventos

```ts
await useCase.execute({ id: '123' })

harness.dispatcher!.assertDispatched(UserRegistered)
harness.dispatcher!.assertDispatched(UserRegistered, (e) => e.userId === '123')
harness.dispatcher!.assertNotDispatched(PaymentFailed)
harness.dispatcher!.assertNothingDispatched()
```

### Aserciones sobre jobs encolados

```ts
harness.queue!.assertQueued(ProcessVideoJob)
harness.queue!.assertQueued(ProcessVideoJob, (entry) => entry.job.videoId === 'vid-1')
harness.queue!.assertNothingQueued()
```

### Aserciones sobre mail

```ts
harness.mailer!.assertMailed(WelcomeMail)
harness.mailer!.assertMailed(WelcomeMail, (mailable) => {
  return mailable.to() === 'ada@example.com'
})
harness.mailer!.assertNothingMailed()
```

### Aserciones sobre notifications

```ts
harness.notifications!.assertSentTo(user, InvoicePaidNotification)
harness.notifications!.assertSent(InvoicePaidNotification, (entry) => {
  return entry.notifiable === user
})
harness.notifications!.assertNothingSent()
```

### Aserciones sobre logs

```ts
expect(harness.logger!.hasMessage('info', 'mail dispatched')).toBe(true)

// Inspecciona los registros raw para consultas más ricas
expect(harness.logger!.records.filter(r => r.level === 'error')).toHaveLength(2)
```

### Ejemplo completo de test

```ts
import { mountLaravelize } from '@luckys_luis/nuxt-laravelize/testing'
import { UserRegistered } from '../events/UserRegistered'
import { WelcomeMail } from '../mail/WelcomeMail'

describe('UserRegistration use case', () => {
  it('dispatches event and sends welcome email', async () => {
    const harness = await mountLaravelize({
      fakes: { dispatcher: true, mailer: true, logger: true },
    })

    const useCase = new RegisterUser(harness.container.make(dispatcherToken))
    await useCase.execute({ email: 'ada@example.com', name: 'Ada' })

    harness.dispatcher!.assertDispatched(UserRegistered, (e) => e.userId !== '')
    harness.mailer!.assertMailed(WelcomeMail, (m) => m.to() === 'ada@example.com')
    expect(harness.logger!.hasMessage('info', 'mail dispatched')).toBe(true)
  })
})
```

---

## Server composables

Todos auto-importados en server routes:

| Composable | Devuelve | Descripción |
|---|---|---|
| `useContainer(event)` | `Container` | DI container con scope de request |
| `useLogger(event)` | `Logger` | Instancia de Logger desde el container |
| `useMailer(event)` | `Mailer` | Instancia de Mailer desde el container |
| `useNotifier(event)` | `NotificationManager` | Notification manager desde el container |
| `useTranslator(event)` | `Translator` | Instancia de Translator desde el container |

---

## CLIs (bins)

### Queue worker

```bash
laravelize-queue-work --queue=default --concurrency=4
```

Ejecuta un worker BullMQ persistente que desencola jobs, los rehidrata vía el `JobRegistry` y ejecuta `handle()`.

### Database seeder

```bash
laravelize-db-seed --class=DemoUserSeeder
```

Para scaffolding (contextos, agregados, use cases…), instala `@luckys_luis/nuxt-ddd-toolkit` y usa `pnpm laravelize new:*`.

---

## Mapa de features

| Área | Symbols principales | Helper server |
|---|---|---|
| Container | `Container`, `Token`, `createToken` | `useContainer(event)` |
| Providers | `ServiceProvider`, `Kernel` | auto-discovery |
| Controllers | `defineLaravelizedHandler`, `FormRequest`, `Resource` | — |
| Middleware | `Middleware`, `runMiddlewarePipeline`, `globalMiddlewareToken` | — |
| Events | `Dispatcher`, `Listener`, `EventSubscriber`, `ShouldQueue`, `dispatcherToken` | — |
| Queue | `Queue`, `InMemoryQueue`, `BullMQQueue`, `Job`, `QueueWorker`, `queueToken` | — |
| Pagination | `LengthAwarePaginator`, `CursorPaginator`, `SimplePaginator` | — |
| Auth | `Gate`, `Policy`, `PolicyRegistry`, `gateToken` | — |
| Logging | `Logger`, `ConsoleLogger`, `StructuredLogger`, `FileLogger`, `loggerToken` | `useLogger(event)` |
| Mail | `Mailable`, `Mailer`, `LogMailer`, `NodemailerMailer`, `ResendMailer`, `mailerToken` | `useMailer(event)` |
| Notifications | `Notification`, `Notifiable`, `MailChannel`, `LogChannel`, `QueueChannel`, `notificationManagerToken` | `useNotifier(event)` |
| i18n | `Translator`, `DictionaryTranslator`, `translatorToken` | `useTranslator(event)` |
| Seeding | `Seeder`, `SeederRegistry`, `discoverSeedersByConvention` | bin `laravelize-db-seed` |
| Factories | `Factory<T>`, `FactoryRegistry`, `builtInFaker` | — |
| Testing | `mountLaravelize`, `FakeDispatcher`, `FakeQueue`, `FakeMailer`, `FakeNotificationManager`, `FakeLogger` | subpath `./testing` |

---

## Desarrollo

```bash
pnpm install
pnpm dev:prepare    # construye stubs + prepara el playground
pnpm dev            # arranca el playground en localhost:3000
pnpm test           # vitest (342 tests)
pnpm typecheck      # vue-tsc --noEmit
pnpm lint           # eslint
```

### Playground

El directorio `playground/` contiene una app Nuxt funcional que demuestra todas las features. Navega las rutas en:

- `GET /api/users` — lista paginada con `LengthAwarePaginator`
- `GET /api/users/:id` — resource individual con validación de parámetros `FormRequest`
- `POST /api/users` — validación de body con Zod
- `POST /api/users/register` — dispatch de evento + listener encolado
- `GET /api/users-cursor` — paginación basada en cursor
- `GET /api/posts` — gate de autorización en `FormRequest`
- `GET /api/protected` — middleware por ruta

### Flujo de release

```bash
pnpm lint && pnpm test && pnpm typecheck
pnpm prepack
pnpm publish
```

---

## Licencia

MIT

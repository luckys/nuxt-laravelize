# `@nuxt-laravelize/database-drizzle`

[English](./README.md) | Espanol

Adapters explicitos de transacciones Drizzle sync y async

## Instalacion

```bash
pnpm add @nuxt-laravelize/database-drizzle drizzle-orm
```

## Uso especifico del package


### Ejecuta una transaccion Drizzle explicita

El adapter mantiene visible la session para los repositorios de la aplicacion y ejecuta `afterCommit` solo despues de confirmar la transaccion nativa. Usa la variante sincronica solo con un driver SQLite sincronico.

```ts
import { DrizzleTransactionManager } from '@nuxt-laravelize/database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async unitOfWork => {
  await users.insert(unitOfWork.session, user)
  unitOfWork.afterCommit(() => metrics.increment('users.created'))
})
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |

## Database

`@nuxt-laravelize/database` proporciona factories, seeders y contratos explicitos de transaccion/unit of work independientes del ORM. Tu aplicacion proporciona callbacks o adapters de persistencia; las relaciones se componen explicitamente sin metadata ORM.

```bash
pnpm add @nuxt-laravelize/database
```

```ts
import { Factory, builtInFaker, recycle } from '@nuxt-laravelize/database/runtime'

interface UserDraft { name: string, email: string, active: boolean, teamId?: string }

class UserFactory extends Factory<UserDraft, number> {
  protected definition(): UserDraft {
    return {
      name: this.faker.string.word(),
      email: `${this.faker.string.sample()}@example.com`,
      active: true,
    }
  }
}

const teams = recycle([{ id: 'team-a' }, { id: 'team-b' }])
const ids = await new UserFactory(builtInFaker({ seed: 42, now: Date.UTC(2025, 0, 1) }))
  .count(3)
  .state({ active: false })
  .sequence([(_draft, index) => ({ name: `User ${index}` })])
  .for(teams, (_user, team) => ({ teamId: team.id }))
  .beforeCreate(validateUser)
  .afterCreate(id => auditCreatedUser(id))
  .create({ persist: draft => userRepository.insert(draft) })

// La persistencia por callback existente sigue devolviendo drafts.
const draft = await new (class extends Factory<UserDraft> {
  protected definition(): UserDraft { return { name: 'Ada', email: 'ada@example.com', active: true } }
})().create(async (draft) => {
  await db.insert(users).values(draft)
})
```

| API | Proposito |
|---|---|
| `Factory<TDraft, TPersisted = TDraft>.count()` | Define y tipa la cardinalidad escalar (`1`) o array (`>1`). |
| `state()` | Aplica un valor parcial o mutator indexado a cada item. |
| `sequence()` | Alterna estados indexados especificos por item. |
| `for(factoryOrRecycle, composer)` | Compone un parent/valor reciclado explicito en cada raiz. |
| `has(factory, composer)` | Compone el escalar o array de la factory relacionada en cada raiz. |
| `recycle(values)` | Crea un pool local no vacio y congelado que rota por indice raiz. |
| `make(overrides?)` | Construye valores sin persistir. |
| `create(callback, overrides?)` | Persiste secuencialmente y devuelve drafts por compatibilidad. |
| `create(adapter, overrides?)` | Devuelve secuencialmente records o IDs tipados desde `FactoryPersistenceAdapter`. |
| `beforeCreate()` / `afterCreate()` | Registra hooks ordenados async-capable alrededor de cada persistencia. |
| `builtInFaker(seedOrOptions?)` | Devuelve `FakerShim`; `{ seed, now }` fija random y fechas. |
| `DefaultFactoryRegistry` | Proporciona `register`, `list`, `has` y `resolve`. |
| `DefaultSeederRegistry` | Proporciona las mismas operaciones para factories async de seeders. |
| `Seeder.call(name)` | Ejecuta otro seeder registrado en el mismo registry. |
| `discoverSeedersByConvention(rootDir)` | Encuentra archivos de seeders para adapters. |

La composicion siempre ejecuta definition -> states -> sequence -> `for` -> `has` -> overrides de llamada. Para cada item creado ejecuta draft -> todos los hooks before -> persistencia -> todos los hooks after, de forma secuencial y fail-fast. `make()` es sincrono y deliberadamente no ejecuta hooks lifecycle. Una factory relacionada reutilizada conserva count/state y reinicia su indice de sequence local para cada raiz mientras su stream Faker avanza normalmente; no existe un pool recycle oculto. Una factory de `for()` debe producir exactamente un item, mientras `has()` conserva su forma escalar/array. Los composers deben devolver un objeto raiz completo o parcial.

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

### Transacciones y unit of work

```ts
import { DrizzleTransactionManager } from '@nuxt-laravelize/database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  await outbox.appendIn(unitOfWork, envelope)
  unitOfWork.afterCommit(() => metrics.increment('orders.created'))
})
```

Los repositorios reciben `unitOfWork.session` explicitamente para compartir la transaccion fisica entre cambios de dominio y outbox. Llama a `unitOfWork.markRollbackOnly(error)` cuando un fallo interno capturado aun debe abortar la transaccion. Los gestores deben lanzar antes del commit nativo y omitir los hooks `afterCommit` cuando la unidad quede marcada; las implementaciones personalizadas deben ofrecer la misma garantia. En los demas casos, los hooks `afterCommit` solo se ejecutan despues de confirmar el commit y su fallo no puede revertirlo. Usa `DrizzleSyncTransactionManager` con drivers SQLite sincronicos: rechaza deliberadamente trabajo que devuelve Promise para impedir que escape de la transaccion nativa.

### Dispatch best-effort a queue despues del commit

`@nuxt-laravelize/database-queue` conecta los contratos explicitos de unit of work y queue sin introducir discovery ambiental de transacciones.

```bash
pnpm add @nuxt-laravelize/database @nuxt-laravelize/queue @nuxt-laravelize/database-queue
```

```ts
import { dispatchAfterCommit } from '@nuxt-laravelize/database-queue'

await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  dispatchAfterCommit(unitOfWork, queue, new SendOrderConfirmation({ orderId: order.id }), {
    deduplication: { id: `tenant.${trustedTenantId}.order.${order.id}.confirmation` },
  })
})
```

`dispatchAfterCommit()` registra el hook sincronicamente y devuelve `void`; esperar un handle dentro del trabajo transaccional causaria deadlock porque la admision solo comienza cuando el callback retorna y el commit tiene exito. Rollback y rollback-only omiten el hook. La promesa de la transaccion espera hooks en orden de registro y el fallo de uno anterior puede impedir los posteriores. Varios dispatches no forman un batch atomico: algunos jobs anteriores pueden estar admitidos cuando falla uno posterior, asi que reconcilia la admision parcial sin reintentar la transaccion y usa outbox para fan-out durable. Las opciones de queue se copian al registrar. El job retenido y los contributors de metadata se serializan despues del commit dentro del scope original: conserva payloads inmutables, no reemplaces el execution context antes de completar y exige que gestores custom esperen hooks antes de destruir el scope. Construye IDs de deduplicacion con scope de tenant confiable del servidor mas identidad de dominio, nunca desde un ID completo enviado por el cliente. Los workers deben reautorizar porque el contexto propagado es procedencia, no autoridad.

Este bridge ofrece orden, no entrega durable ni exactly-once. Un crash despues del commit puede perder la publicacion; un transport puede admitir el job y perder despues su acknowledgement. `AfterCommitQueueDispatchError` significa que la persistencia ya hizo commit y la admision fallo o es ambigua: no reintentes la transaccion completa. Su `cause` es diagnostico solo para servidor y debe redactarse antes de logs o respuestas. Configura timeouts acotados en el transport y limita el numero de dispatches por transaccion; un timeout tambien es ambiguo. La deduplicacion comienza en la admision real y no cierra la ventana commit/publicacion. Si perder un job dejaria el estado de dominio confirmado sin recuperacion, registra un mensaje versionado en un outbox durable dentro de la misma transaccion fisica.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#database). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/database`](../database/README.es.md), [`@nuxt-laravelize/reliability-drizzle`](../reliability-drizzle/README.es.md).

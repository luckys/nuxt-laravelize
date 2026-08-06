# `@nuxt-laravelize/testing`

[Espanol](./README.es.md) | English

Aggregate testing harness and fakes for Nuxt Laravelize

## Install

```bash
pnpm add -D @nuxt-laravelize/testing
```

## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |

## Testing

`@nuxt-laravelize/testing` aggregates the official fakes and mounts them in a sealed container.

```bash
pnpm add -D @nuxt-laravelize/testing
```

```ts
import { mountLaravelize } from '@nuxt-laravelize/testing'

const app = mountLaravelize()
await app.cache.put('feature:user_1', true, 60)
await app.events.dispatch(new UserRegistered('user_1'))
await app.queue.push(new SendReport({ reportId: 'report_1' }))
await app.mail.send(new WelcomeMail('ada@example.com'))

app.events.assertDispatched(UserRegistered)
app.queue.assertPushed(SendReport)
app.mail.assertSent(WelcomeMail)
await app.cache.assertHas('feature:user_1')
```

`mountLaravelize()` returns `container`, `cache`, `encrypter`, `events`, `features`, `filesystem`, `hasher`, `queue`, `mail`, `notifications`, `rateLimiter` and `validator`. The package also re-exports `CacheFake`, `EventFake`, `FakeLogger`, `FilesystemFake`, `QueueFake`, `MailFake` and `NotificationFake` for focused tests.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#testing). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/core`](../core/README.md), [`@nuxt-laravelize/cache`](../cache/README.md), [`@nuxt-laravelize/queue`](../queue/README.md), [`@nuxt-laravelize/events`](../events/README.md).

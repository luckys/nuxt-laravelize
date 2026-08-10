# `@luckys_luis/nuxt-laravelize-audit`

[Espanol](./README.es.md) | English

Secure append-only audit recording for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-audit
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-audit'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./runtime/server` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Audit

`@luckys_luis/nuxt-laravelize-audit` is included in the preset and exposes `useAudit(event)`. Recording is explicit:

```ts
await useAudit(event).record({
  action: 'patient.viewed',
  outcome: 'success',
  target: { type: 'patient', id: patientId },
  metadata: { reason: 'care-plan' },
})
```

The recorder generates the ID/time and enriches actor, tenant, execution, correlation, causation, source, and trace fields from trusted scoped execution context. Callers cannot override them. Actions/references use bounded safe identifiers. Changes and metadata must be bounded plain JSON; functions, symbols, cycles, custom prototypes, and excessive depth, keys, arrays, or bytes are rejected. Common credential keys and configured redaction keys become `[REDACTED]`.

The preset defaults to bounded, non-evicting memory in development and disabled persistence in production; both warn, and disabled recording fails closed. Configure `laravelizeAudit.driver: 'memory'` explicitly only when volatility is acceptable, or override `auditStoreToken` with durable storage. Set `requireTenantId: true` for tenant-scoped systems. Optional `@luckys_luis/nuxt-laravelize-audit-drizzle` provides append-only-by-interface PostgreSQL, SQLite, and Turso/libSQL stores; apply `0002_add_audit_locale.sql` or `0003_add_audit_locale_sqlite.sql` when upgrading so the trusted execution-context locale remains a first-class column. Database immutability still requires least-privilege credentials and retention controls. `occurredAt` is application time, not authoritative ingestion order. `AuditFake` provides defensive assertions.

Audit is neither logging nor domain-event serialization. Do not pass request/response bodies or arbitrary models. Automatic policy/HTTP auditing is deferred to a future neutral `audit-http` bridge.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#audit). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-audit-drizzle`](../audit-drizzle/README.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.md).

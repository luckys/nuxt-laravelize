# `@nuxt-laravelize/audit-drizzle`

[Espanol](./README.es.md) | English

PostgreSQL, SQLite and Turso append-only audit stores

## Install

```bash
pnpm add @nuxt-laravelize/audit-drizzle @nuxt-laravelize/audit drizzle-orm
```

## Package-specific usage


### Persist audit entries with Drizzle

Choose the dialect-specific store and apply its migration source before binding it to `auditStoreToken`. PostgreSQL uses `execute(SQL)`; SQLite and Turso use their respective raw-client boundary.

```ts
import { DrizzlePostgresAuditStore } from '@nuxt-laravelize/audit-drizzle/postgres'

const auditStore = new DrizzlePostgresAuditStore(db)
container.instance(auditStoreToken, auditStore)

await useAudit(event).record({
  action: 'invoice.viewed',
  outcome: 'success',
  target: { type: 'invoice', id: invoiceId },
})
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./postgres` | Public entrypoint for this package. |
| `./sqlite` | Public entrypoint for this package. |
| `./turso` | Public entrypoint for this package. |
| `./schema` | Public entrypoint for this package. |
| `./sqlite-schema` | Public entrypoint for this package. |
| `./migrations` | Public entrypoint for this package. |
| `./migrations/0000_create_audit_entries.sql` | Public entrypoint for this package. |
| `./migrations/0001_create_audit_entries_sqlite.sql` | Public entrypoint for this package. |
| `./migrations/0002_add_audit_locale.sql` | Public entrypoint for this package. |
| `./migrations/0003_add_audit_locale_sqlite.sql` | Public entrypoint for this package. |

## Audit

`@nuxt-laravelize/audit` is included in the preset and exposes `useAudit(event)`. Recording is explicit:

```ts
await useAudit(event).record({
  action: 'patient.viewed',
  outcome: 'success',
  target: { type: 'patient', id: patientId },
  metadata: { reason: 'care-plan' },
})
```

The recorder generates the ID/time and enriches actor, tenant, execution, correlation, causation, source, and trace fields from trusted scoped execution context. Callers cannot override them. Actions/references use bounded safe identifiers. Changes and metadata must be bounded plain JSON; functions, symbols, cycles, custom prototypes, and excessive depth, keys, arrays, or bytes are rejected. Common credential keys and configured redaction keys become `[REDACTED]`.

The preset defaults to bounded, non-evicting memory in development and disabled persistence in production; both warn, and disabled recording fails closed. Configure `laravelizeAudit.driver: 'memory'` explicitly only when volatility is acceptable, or override `auditStoreToken` with durable storage. Set `requireTenantId: true` for tenant-scoped systems. Optional `@nuxt-laravelize/audit-drizzle` provides append-only-by-interface PostgreSQL, SQLite, and Turso/libSQL stores; apply `0002_add_audit_locale.sql` or `0003_add_audit_locale_sqlite.sql` when upgrading so the trusted execution-context locale remains a first-class column. Database immutability still requires least-privilege credentials and retention controls. `occurredAt` is application time, not authoritative ingestion order. `AuditFake` provides defensive assertions.

Audit is neither logging nor domain-event serialization. Do not pass request/response bodies or arbitrary models. Automatic policy/HTTP auditing is deferred to a future neutral `audit-http` bridge.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#audit). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/audit`](../audit/README.md), [`@nuxt-laravelize/migrations-drizzle`](../migrations-drizzle/README.md).

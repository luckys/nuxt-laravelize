# Candidate Roadmap

English | [Espanol](./roadmap.es.md)

This document records Laravel-inspired capabilities that could add product value to Nuxt Laravelize. It is a prioritized set of candidates, not a release commitment. A candidate enters implementation only after its contracts, runtime support, security boundaries, migration impact, and maintenance owner are agreed.

## Product principles

- Preserve focused packages, explicit dependencies, and opt-in infrastructure adapters.
- Adapt useful Laravel semantics to Nuxt and Nitro instead of copying Laravel APIs literally.
- Keep portable contracts separate from Node, database, cloud, and vendor adapters.
- Fail closed at authentication, authorization, tenancy, persistence, and operator boundaries.
- Require durable stores for production behavior that survives process loss.
- Add testing fakes, operational diagnostics, migration guidance, and public entrypoint smoke coverage with each feature.
- Avoid implicit global state, magic discovery, and adapters bundled into the main preset without a safe portable default.

## Delivery sequence

### Phase 1: complete conventional applications

1. Authentication, sessions, CSRF, and Sanctum-style tokens.
2. Console commands and a unified migration runner.
3. A Nuxt 4 scheduler.
4. Central exception handling and typed API contracts.

### Phase 2: development and operations

5. Telescope-style local diagnostics.
6. Horizon/Pulse-style queue and application operations.
7. Queue chains, batches, uniqueness, and job middleware.
8. Precognition and production notification channels.

### Phase 3: product integrations

9. Social authentication, advanced filesystem URLs, and browser realtime.
10. Billing, tenancy guardrails, and additional platform adapters.

## Priority candidates

### Authentication, Fortify, and Sanctum semantics

Candidate packages: `@nuxt-laravelize/auth`, `@nuxt-laravelize/auth-better-auth`, and `@nuxt-laravelize/auth-drizzle`.

The portable package would define trusted session and principal contracts. An initial Better Auth adapter would provide the protocol implementation rather than introducing a new authentication engine. The feature should cover cookie sessions, login/logout, session rotation and revocation, password reset, email verification, password confirmation, TOTP and recovery codes, personal access tokens, token abilities, credential throttling, CSRF integration, and security audit events.

It must integrate with `principalResolverToken`, execution context, authorization, hashing, encryption, rate limiting, mail, notifications, and audit. Account enumeration resistance, session fixation, token hashing, cookie policy, recovery replay, and key rotation are release-blocking security requirements.

### Session, cookie, and CSRF primitives

Candidate packages: `@nuxt-laravelize/session`, `@nuxt-laravelize/session-redis`, and `@nuxt-laravelize/csrf`.

These packages would support signed or server-side sessions, ID regeneration, flash data, session locks, memory/Redis/database stores, encrypted cookies, secure defaults, and SPA-compatible CSRF protection. They should remain usable without the authentication package.

### Console commands

Candidate package: `@nuxt-laravelize/console`.

Status: implemented as an opt-in portable runtime with Node and testing adapters.

The console runtime would provide typed command registration, arguments, options, help, exit codes, prompts, dependency injection, command-scoped execution context, logs, traces, and isolated testing. Existing worker, reconciliation, pruning, seeding, indexing, and migration executables could share this runtime without becoming one monolithic Artisan clone.

### Unified migrations

Candidate packages: `@nuxt-laravelize/migrations` and `@nuxt-laravelize/migrations-drizzle`.

Status: implemented with transactional PostgreSQL/SQLite backends, explicit application discovery, console commands, and aggregate package sources.

The runner would discover application and package migrations, track IDs and checksums, lock concurrent deployments, expose status/up/rollback/reset/fresh/pretend commands, select one explicit dialect, and support test schemas. It would aggregate existing audit, idempotency, reliability, Scout, and workflow migrations while remaining ORM-neutral.

### Nuxt 4 scheduler

Candidate package: `@nuxt-laravelize/scheduler-nuxt`.

Status: implemented as an opt-in Nuxt 4/Nitro 2 module with timezone-aware provider triggers and Redis/Valkey locks.

The existing framework-neutral schedule definitions need a Nuxt 4-compatible execution layer. The adapter should support cron helpers, timezones, queue dispatch, `withoutOverlapping`, `onOneServer`, maintenance behavior, success/failure hooks, schedule listing, distributed Redis/Valkey locks, and provider triggers for Node cron, Cloudflare, and Vercel. It should run reconciliation, pruning, retention, reports, and indexing without replacing Nuxt's Nitro version.

### Central exception handling

Candidate package: `@nuxt-laravelize/exceptions`.

This boundary would register reporters and renderers, map domain errors to HTTP Problem Details, suppress selected reports, throttle repeated failures, attach correlation IDs, redact sensitive data, and integrate with observability. It should replace duplicated HTTP error translation without leaking stack traces, payloads, or secrets.

### Typed API contracts and OpenAPI

Candidate packages: `@nuxt-laravelize/contracts` and `@nuxt-laravelize/openapi`.

A contract would declare method, path, path parameters, query, body, status-specific responses, errors, and authorization metadata once. Adapters could generate runtime validation, OpenAPI 3.1, typed `useHttp` calls, fixtures, and CI breaking-change reports. The design should extend `routes`, `validation`, Form Requests, resources, and pagination. Standard Schema implementations without introspection require explicit metadata or schema-specific adapters.

### Telescope-style diagnostics

Candidate package: `@nuxt-laravelize/telescope`.

The development dashboard could inspect requests, exceptions, logs, slow queries, jobs, events, mail, notifications, cache, outbound HTTP, webhooks, and workflows. Production use must be explicitly enabled and authorized. Request bodies and arbitrary headers stay disabled by default, secrets are redacted, and storage is bounded by retention limits.

### Horizon/Pulse-style operations

Candidate packages: `@nuxt-laravelize/queue-operations` and `@nuxt-laravelize/pulse`, potentially sharing the existing dead-letter operations shell.

The operations surface would report queue depth, throughput, latency, worker heartbeats, delayed/failed jobs, outbox lag, workflow stalls, scheduler runs, cache metrics, HTTP latency, and dead letters. Fenced and audited actions could retry, cancel, reconcile, pause, resume, and perform bounded bulk operations. Payload disclosure remains a separate privileged capability.

### Queue chains, batches, uniqueness, and middleware

The queue contract could add sequential chains, durable batches with progress/cancellation hooks, unique jobs, after-commit dispatch, tags, priorities, graceful draining, and middleware such as `WithoutOverlapping`, `RateLimited`, `ThrottlesExceptions`, and tenant/principal requirements. Durable metadata must be versioned, bounded, and compatible with at-least-once execution. This capability should not turn workflows into an implicit DAG engine.

### Notification delivery ecosystem

Delivered: opt-in `notifications-mail`, `notifications-queue`, and `notifications-database` bridges with bounded rendering/payloads, explicit durable type versions, opaque recipient references, worker-side recipient/preference/locale reload, trusted tenant checks, terminal malformed-version handling, durable inbox deduplication, tenant-fenced cursor reads, and idempotent read/unread records backed by PostgreSQL or SQLite/Turso.

Remaining candidates include `notifications-broadcast`, `notifications-webhook`, per-channel delays, delivery/failure events, richer assertions, and later SMS, push, and Slack/Teams adapters. Queue dead letters currently belong to the configured queue backend; delivery remains at-least-once at external provider boundaries.

### Precognition

Candidate package: `@nuxt-laravelize/precognition`.

Vue composables would call the same server validation used by Form Requests without executing the controller. The feature should support field subsets, debounce, cancellation, transformed values, error bags, dirty state, and Standard Schema types.

### Socialite semantics

Candidate package: `@nuxt-laravelize/socialite`, built after authentication.

Initial providers could include GitHub, Google, Microsoft, Apple, Discord, and generic OpenID Connect. State, nonce, PKCE, explicit account linking, email takeover prevention, encrypted refresh tokens, and audited link/unlink events are mandatory.

### Echo and realtime clients

Candidate packages: `@nuxt-laravelize/echo` and `@nuxt-laravelize/echo-pusher`.

The browser layer would provide SSR-safe Vue composables for public, private, and presence channels, typed events, subscription authentication, reconnect/resubscribe behavior, and automatic disposal. A self-hosted Reverb-style server should be considered only after the client contract is stable; Pusher remains the lower-risk first adapter.

### Advanced filesystem capabilities

Delivered in the portable filesystem contracts and opt-in adapters: fail-closed capability guards, immutable constrained upload policies and confirmation, scoped/read-only disks, explicit quarantine release/reject, primary-write/read-fallback behavior, and stream/multipart contracts. The S3 adapter provides SigV4 temporary GET URLs and constrained presigned POST uploads with real content-length ranges, exact MIME/metadata/checksum conditions, metadata confirmation, visibility, SHA-256 checksums, native bodies, and explicit multipart lifecycle. The local adapter provides streams, checksums, and visibility; the R2 binding adapter provides streams but intentionally does not claim signing or other unsupported capabilities.

Virus scanning and transformation remain application queue/workflow responsibilities after confirmation; no scanner is claimed. A Redis/Valkey issuance adapter now provides atomic shared confirmation state, while failover durability, immutable-version race protection, provider lifecycle configuration, and replica verification remain provider/application infrastructure rather than fabricated portable behavior.

### Database factory improvements

Delivered in `@nuxt-laravelize/database/runtime`: indexed states/sequences, explicit nested `has`/`for` composition, local deterministic recycling, seeded Faker with a fixed clock, typed sync/async persistence adapters, callback compatibility, and sequential before/after hooks. Composition remains ORM-neutral and explicit; ORM metadata, implicit foreign keys, global recycle pools, bulk persistence/transactions, and an Eloquent clone are intentionally not provided.

### Cashier-style billing

Candidate packages: `@nuxt-laravelize/cashier` and `@nuxt-laravelize/cashier-stripe`.

The first adapter could cover customers, subscriptions, trials, usage billing, invoices, Checkout, customer portal links, idempotent webhooks, and entitlement synchronization with Pennant. Billing state changes should use reliability and workflows for retry and compensation. Paddle or other providers would remain separate adapters.

### OAuth authorization servers

Sanctum-style personal tokens and external OIDC adapters should come before a Passport-style OAuth server. A first-party authorization server should be considered only with demonstrated demand and a dedicated security maintenance commitment.

### Server localization

Implemented: server-only `ServerLocalization`, request and eventless factories, generated dictionary/fallback/plural reuse, locale-aware Intl formatting, strict configured-locale validation, request resolution, execution-context and queue propagation, and first-class audit persistence. Validation documentation shows localized Standard Schema construction. Follow-ups remain for recipient preference storage, notification/mail rendering and queued-delivery adapters, and vendor-specific validation adapters.

### Maintenance mode

Maintenance support could include console activation, a secret bypass, `Retry-After`, pre-rendered responses, shared Redis/database state, selected worker/scheduler exceptions, metrics, and audit events. It must behave consistently across multiple instances.

### Laravel-style outbound HTTP

The HTTP client could add named clients, retries and backoff, timeouts, request pools, middleware, circuit breakers, idempotency keys, testing fakes/assertions, safe observability, redaction, and response typing from API contracts.

### Multi-tenancy guardrails

Candidate packages: `@nuxt-laravelize/tenancy` and optional database adapters.

The feature would resolve a tenant from a trusted source, verify membership, require tenant context for selected handlers and jobs, scope cache/files/search, propagate tenant identity with worker reauthorization, and support PostgreSQL RLS/session-variable integrations. Context metadata alone must never be treated as authorization, and no ORM-independent package can promise complete query isolation.

## Quick wins

The following smaller additions can provide value before the larger packages:

1. A `doctor` command for configuration, adapter, migration, worker, and historical workflow checks.
2. A privacy-bounded `audit-http` bridge for route, outcome, duration, and authorization decisions.
3. Bounded bulk actions in dead-letter operations.
4. Database/broadcast/webhook notification channels and delivery events; mail and queue bridges are delivered.
5. `WithoutOverlapping` and `RateLimited` job middleware.
6. Temporary URLs for S3 and R2.
7. Maintenance mode backed by a shared store.
8. Generators for policies, jobs, workflows, notifications, commands, and migrations.
9. A production example using PostgreSQL, Redis/Valkey, BullMQ, and OpenTelemetry.

## Deliberate non-goals

The roadmap does not currently prioritize:

- An Eloquent-compatible ORM or Active Record layer.
- Global facades or hidden process-wide state.
- A first-party Passport/OAuth server without dedicated security ownership.
- A Reverb server before a stable browser client exists.
- Octane semantics that duplicate Nitro's runtime model.
- Automatic arbitrary migration of in-flight workflows.
- Unbounded workflow DAGs, event sourcing, or fan-out/fan-in before linear workflow invariants remain stable under production use.
- Bundling infrastructure-specific adapters into the main preset by default.

## Candidate graduation

A roadmap item is ready to become a committed feature only when it has an accepted portable contract, explicit runtime matrix, threat model where applicable, durable production adapter or documented external dependency, testing strategy, operational lifecycle, migration plan, package ownership, and release compatibility classification.

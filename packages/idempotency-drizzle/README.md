# `@luckys_luis/nuxt-laravelize-idempotency-drizzle`

[Espanol](./README.es.md) | English

Durable Drizzle idempotency stores for PostgreSQL, SQLite and Turso

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-idempotency-drizzle @luckys_luis/nuxt-laravelize-idempotency drizzle-orm
```

## Package-specific usage


### Bind a durable idempotency store

Apply exactly one dialect migration before binding the store. PostgreSQL uses Drizzle `execute`; SQLite and Turso use `all` so conditional returning statements preserve lease fencing and replay data.

```ts
import { DrizzlePostgresIdempotencyStore } from '@luckys_luis/nuxt-laravelize-idempotency-drizzle/postgres'
import { idempotencyStoreToken } from '@luckys_luis/nuxt-laravelize-idempotency/runtime'

container.instance(idempotencyStoreToken, new DrizzlePostgresIdempotencyStore(db))
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
| `./migrations/postgres` | Public entrypoint for this package. |
| `./migrations/sqlite` | Public entrypoint for this package. |

## HTTP

`@luckys_luis/nuxt-laravelize-http` provides the auto-imported Nuxt client `useHttp`, plus requests, middleware, resources, pagination, gates and policies for Nitro.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-http'],
  laravelizeHttp: {
    baseURL: 'https://api.example.com',
    signingKey: '',
    signingOrigin: 'https://app.example.com',
  },
})
```

Generate at least 32 random bytes with `openssl rand -base64 32` and set the private key through `NUXT_LARAVELIZE_HTTP_SIGNING_KEY`. Never place it under `runtimeConfig.public` or commit a production key. `signingOrigin` gives validation a canonical, allowlisted origin instead of trusting request `Host` and forwarded-protocol headers.

```ts
const { data, error, status, refresh } = await useHttp<User>('/users/1')
const { data: created } = await useHttp<User>('/users', {
  method: 'POST',
  body: { name: 'Ada' },
})
```

### Form requests and handlers

`FormRequest.body()`, `query()` and `params()` accept any Standard Schema implementation. `authorize(event)` returns a boolean. `defineLaravelizedHandler()` resolves a controller token, runs global and route middleware, validates input and serializes resources.

The example uses Zod as the Standard Schema implementation: `pnpm add zod`.

```ts
import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { FormRequest, LengthAwarePaginator, Resource, defineLaravelizedHandler, type ValidatedInput } from '@luckys_luis/nuxt-laravelize-http/runtime'
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

Implement `Middleware.handle(event, next)` and register its token in the handler's `middleware` array. `globalMiddlewareToken` stores middleware tokens applied to every Laravelized handler.

### Signed and temporary URLs

`HmacUrlSigner` protects the origin, path and query with HMAC-SHA256. The configured service is available through `useUrlSigner(event)` and `urlSignerToken`.

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

Protect a Laravelized handler with the auto-imported `validateSignatureToken`:

```ts
export default defineLaravelizedHandler({
  controller: invitationControllerToken,
  method: 'accept',
  middleware: [validateSignatureToken],
})
```

Use the same middleware in an ordinary Nitro handler:

```ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const middleware = new ValidateSignature(useUrlSigner(event), { origin: signingOrigin })
  return await middleware.handle(event, async () => ({ accepted: true }))
})
```

| API | Purpose |
|---|---|
| `HmacUrlSigner(secret)` | Creates a portable Web Crypto HMAC-SHA256 signer. Keys shorter than 32 bytes throw `MissingUrlSigningKeyError`. |
| `sign(url, options?)` | Replaces an existing signature; options support expiration, relative mode and HTTP method binding. |
| `hasValidSignature(url, options?)` | Rejects missing, malformed, modified or expired signatures and can require expiration. |
| `ValidateSignature` | Middleware that rejects invalid requests with HTTP 403; it supports canonical origin, required expiration and method binding. |
| `urlSignerToken` / `useUrlSigner(event)` | Resolves the configured signer from the request container. |
| `validateSignatureToken` | Default absolute-signature middleware; resolving it requires configured `signingOrigin`. |

Absolute signing is the default and includes the origin. For proxy-independent links, call both signing and validation with `{ absolute: false }`; relative mode protects only path and query and must not cross host-based tenant boundaries. Query order is canonicalized, fragments are ignored because browsers do not send them to the server, and a temporary URL is invalid at its exact expiration second. Rotating the key invalidates existing links.

Signed URLs are bearer credentials and are replayable. Use short expirations for verification, invitation and state-changing links; bind those signatures to the HTTP method with `sign(..., { method: 'POST' })` and `new ValidateSignature(signer, { bindMethod: true, requireExpiration: true })`. Enforce HTTPS at a trusted proxy and use application storage when a link must be single-use.

### HTTP idempotency

`@luckys_luis/nuxt-laravelize-idempotency` provides an opt-in H3 middleware and an atomic store contract for mutating requests. It fingerprints the method, canonical route and query, principal, content type, and exact request bytes. Reusing a key with another fingerprint returns `409`; active leases are renewed and stale owners cannot complete reclaimed work. Completed responses are replayed with an allowlist of safe headers. Failures are retained by default because retrying after an ambiguous application error can duplicate committed side effects.

```ts
import { createIdempotencyMiddleware } from '@luckys_luis/nuxt-laravelize-idempotency/runtime'

const idempotency = createIdempotencyMiddleware({
  principal: event => event.context.user.id,
})
```

The memory driver is volatile and must be explicitly enabled. Clustered and serverless deployments must bind an atomic durable `IdempotencyStore`. Streaming and direct response writes are rejected because they cannot be replayed faithfully.

For durable storage, `@luckys_luis/nuxt-laravelize-idempotency-drizzle` provides PostgreSQL, SQLite, and Turso adapters plus schemas and explicit migrations. PostgreSQL accepts Drizzle's `execute(SQL)` boundary; SQLite/Turso accept `all(SQL)` so conditional `UPSERT/UPDATE ... RETURNING` statements return the fenced row. Apply exactly one matching migration before binding the store token.

```ts
import { DrizzlePostgresIdempotencyStore } from '@luckys_luis/nuxt-laravelize-idempotency-drizzle/postgres'

container.singleton(idempotencyStoreToken, () => new DrizzlePostgresIdempotencyStore(db))
```

The `signature` and `expires` query names are reserved. Signing replaces `signature`; pass `expiresAt` explicitly to create or replace `expires`.

### Resources and pagination

| API | Purpose |
|---|---|
| `Resource.toArray(event)` | Transforms one value. Use protected `when()` and `mergeWhen()` for conditional fields. |
| `Resource.collection(items)` | Creates a normal or paginated resource collection. |
| `withoutWrapping()` / `restoreWrapping()` | Globally disables or restores the `{ data: ... }` wrapper. |
| `ResourceCollection.toArray()` | Serializes every resource. |
| `LengthAwarePaginator` | Adds totals, page metadata and links; `fromRequest()` reads query parameters. |
| `SimplePaginator` | Provides previous/next links without a total count. |
| `CursorPaginator` | Provides encoded cursor navigation. |
| `parsePageParams()` / `parseCursorParams()` | Reads and bounds request pagination parameters. |
| `encodeCursor()` / `decodeCursor()` | Converts cursor objects to and from URL-safe strings. |
| `buildPageUrl()` / `buildCursorUrl()` / `getRequestPath()` | Builds links while preserving the request path and query. |
| `isPaginator()` and resource guards | Narrow paginator and resource values at runtime. |

```ts
const paginator = LengthAwarePaginator.fromRequest(event, users, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})
return UserResource.collection(paginator)
```

### Gates and policies

These HTTP gate/policy APIs remain for concrete backward compatibility. New code should use `@luckys_luis/nuxt-laravelize-authorization`; unlike the legacy constructor-name policy lookup and caller-supplied user argument below, it uses explicit resource keys and reloads the scoped principal. The legacy `authorize()` keeps its H3-specific 403 mapping.

| API | Purpose |
|---|---|
| `define(rule, callback)` | Registers an authorization rule. |
| `allows()` / `denies()` | Checks one rule. |
| `authorize()` | Throws an H3 403 error when denied. |
| `any()` / `none()` | Checks multiple rules. |
| `DefaultPolicyRegistry.register(modelName, policy)` | Registers a policy for a model constructor name. |
| `Policy.before(user)` | Optionally allows or denies every action before its method runs. |
| `discoverPoliciesByConvention(rootDir)` | Finds policy files for adapter registration. |

```ts
import { InMemoryGate } from '@luckys_luis/nuxt-laravelize-http/runtime'

const gate = new InMemoryGate()
gate.define('update-invoice', (user, invoice) => user.id === invoice.ownerId)
await gate.authorize('update-invoice', currentUser, invoice)
```

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#http). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-idempotency`](../idempotency/README.md), [`@luckys_luis/nuxt-laravelize-migrations-drizzle`](../migrations-drizzle/README.md).

# `@nuxt-laravelize/filesystem-aws`

[Espanol](./README.es.md) | English

AWS S3 filesystem adapter for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/filesystem-aws
```

## Package-specific usage


### Register the AWS S3 filesystem

Use the factory for the standard AWS SDK client, or inject compatible command and signing ports for tests and custom runtimes. Credentials stay in server-only configuration. The same adapter supports temporary URLs, direct uploads with SHA-256 confirmation, streams, and multipart operations when its capabilities are available.

```ts
import { createAwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'

const archive = createAwsS3Filesystem({
  bucket: 'app-archive',
  prefix: 'production',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
})

await archive.write('reports/2025.csv', csv)
const url = await archive.temporaryUrl?.('reports/2025.csv', {
  expiresAt: new Date(Date.now() + 300_000),
})
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |

## Filesystem

`@nuxt-laravelize/filesystem` provides Laravel-style named disks behind a portable byte-oriented contract.

```bash
pnpm add @nuxt-laravelize/filesystem
```

The complete preset registers an in-memory default disk. Use `useFilesystem(event, disk?)` in Nitro handlers.

```ts
export default defineEventHandler(async (event) => {
  const files = useFilesystem(event)
  await files.write('exports/report.csv', csv)
  return { bytes: await files.size('exports/report.csv') }
})
```

| API | Purpose |
|---|---|
| `write()` / `read()` / `readText()` | Stores strings or bytes and reads defensive byte copies or UTF-8 text. |
| `exists()` / `delete()` / `size()` | Inspects and removes files. |
| `copy()` / `move()` | Copies or moves a file within one disk. |
| `list(prefix?)` | Recursively lists normalized logical paths in stable order. |
| `FilesystemManager` | Registers and resolves named disks. |
| `FilesystemFake` | In-memory fake with assertions and reset support. |

The portable `InMemoryFilesystem` is intended for tests, development, or ephemeral files in one process. For persistent Node deployments, register `LocalFilesystem` from `@nuxt-laravelize/filesystem/node` in a custom provider:

```ts
import { LocalFilesystem } from '@nuxt-laravelize/filesystem/node'

manager.register('reports', new LocalFilesystem('/srv/app/storage/reports'))
```

`LocalFilesystem` normalizes separators, rejects null bytes, `..` traversal and symbolic links, and confines every operation to its configured root. Do not use it as shared storage across serverless instances; register an object-storage adapter instead.

Cloud storage adapters are optional packages and are not installed by the complete preset:

```ts
import { CloudflareR2Filesystem } from '@nuxt-laravelize/filesystem-cloudflare'

manager.register('uploads', new CloudflareR2Filesystem(env.UPLOADS, {
  prefix: 'production/uploads',
  maxListObjects: 20_000,
}))
```

The Cloudflare adapter is structural and binding-native: it does not import Workers types or the AWS SDK. The binding must provide `get`, `head`, `put`, `delete`, and paginated `list`. For AWS S3, or Cloudflare R2 through its S3-compatible API outside Workers, use the isolated AWS package:

```ts
import { createAwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'

manager.register('archive', createAwsS3Filesystem({
  bucket: 'app-archive',
  prefix: 'production',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
}))
```

For R2 use endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`, and `forcePathStyle: true`. Both adapters require already-normalized relative paths and prefixes: absolute paths, backslashes, repeated separators, dot segments, traversal, and null bytes are rejected. Listing follows provider pagination, verifies prefix boundaries, and fails instead of returning partial data if the configurable object cap is exceeded or a continuation token does not progress. Keep credentials in private server configuration; factories never read environment variables or emit credentials.

Cloud object moves are copy-then-delete, not atomic. The source is deleted only after a successful destination write/copy. A later delete failure can leave both objects; retry or reconcile that state in application workflows that require exactly one copy. Same-path moves verify existence and perform no mutation.

### Advanced filesystem capabilities

Advanced behavior is optional and discovered with guards such as `isTemporaryUrlFilesystem()`, `isDirectUploadFilesystem()`, `isUploadConfirmationFilesystem()`, `isStreamFilesystem()`, and `isMultipartFilesystem()`. A false guard means unsupported; callers must not synthesize URLs or emulate security semantics.

Create direct-upload authority with `createDirectUploadPolicy()`. Policies are frozen JSON values and require one normalized path inside `keyPrefix`, a positive `maxBytes`, MIME allowlist, actor, tenant, and an expiry no more than seven days away. Checksum remains optional in the portable contract for adapters with another immutable promotion mechanism, but S3 issuance requires exact SHA-256. S3 returns a presigned POST whose policy enforces `content-length-range` from zero through `maxBytes` plus exact key, selected MIME, actor/tenant metadata, and checksum conditions. Submit the returned form fields unchanged. After upload, call `confirmUpload(grant)` with the trusted server-held grant and continue only when provider size, selected MIME, metadata, and checksum match.

```ts
import { createDirectUploadPolicy, isDirectUploadFilesystem, isUploadConfirmationFilesystem } from '@nuxt-laravelize/filesystem/runtime'

const policy = createDirectUploadPolicy({
  path: `quarantine/${crypto.randomUUID()}`,
  keyPrefix: 'quarantine',
  maxBytes: bytes,
  mimeTypes: ['application/pdf'],
  checksum: { algorithm: 'sha256', value: sha256Hex },
  actorId: user.id,
  tenantId: tenant.id,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
})

if (!isDirectUploadFilesystem(files) || !isUploadConfirmationFilesystem(files)) throw new Error('Direct upload is unsupported')
const grant = await files.createDirectUpload({ policy, mimeType: 'application/pdf' })
// Return the bearer grant only from an authenticated, authorized, rate-limited server endpoint.
// Keep this trusted grant server-side; do not accept a serialized grant from the browser for confirmation.
const confirmed = await files.confirmUpload(grant)
```

Actor and tenant form metadata are exact signed-policy correlation values, not authentication. Scoped wrappers bind issuance to the canonical scope audience and validate the exact returned prefix boundary. S3 confirmation atomically reserves the canonical record by random grant ID: concurrent attempts fail, provider and metadata/checksum failures release it for retry until expiry, and success atomically removes it, immediately releasing bounded capacity while `confirmUpload()` replay remains rejected. The provider-issued presigned POST is separate authority and remains reusable until its signed expiry; confirmation does not and cannot fake revocation. Use a short TTL, a unique private quarantine key per issuance, idempotent/event-deduplicated processing, and provider lifecycle cleanup. The default store is process-local; a durable shared `S3UploadIssuanceStore` must implement atomic conditional `reserve`, `release`, and `complete` for restart-safe or multi-instance confirmation. The mandatory S3 checksum means a replayable POST can only replace the object with identical bytes and exact metadata. Confirmation is not content inspection, virus scanning, or authorization. Authenticate and authorize issuance independently, scan/transform in an application queue or workflow, and release only the accepted object. Never log signed URLs or form fields. The R2 binding cannot sign and intentionally fails URL capability guards; use the S3-compatible adapter with server-only credentials.

For multi-instance confirmation, inject `RedisS3UploadIssuanceStore` from `@nuxt-laravelize/filesystem-aws-redis`. Its single-key Lua transitions use Redis time, preserve the policy TTL, check audience before exposing reservation state, fence release/completion by random token, and reject corrupt records. Choose an application-specific prefix and keep Redis persistent; asynchronous Redis failover can still lose acknowledged state, so uploads remain quarantined and downstream processing must be idempotent.

`scopedFilesystem(files, prefix)` applies confinement to both operands and every exposed optional capability. `readOnlyFilesystem(files)` rejects base mutations and omits optional mutation methods. `quarantineFilesystem()` provides explicit `disk`, `release()`, and `reject()` operations and performs no implicit scan. Secure `release({ accepted: true, path, checksum: { algorithm: 'sha256', value } }, destination, destinationPath?)` accepts only trusted scanner/workflow evidence for the normalized path and exact digest; it reads one coherent byte snapshot, verifies and writes those exact bytes, and retains the quarantine source in every successful case. A concurrent replacement is neither promoted nor deleted. Never accept release evidence from a client. Cleanup is an explicit later `reject()` or provider-lifecycle action only after the caller establishes an immutable path/version; `release()` performs no read-then-delete because the portable contract has no conditional-delete/version primitive. Mutable `ReadFallbackFilesystem(primary, fallback, tombstones)` requires an explicit async `FilesystemTombstoneStore`; production stores must be durable, shared, and namespaced to that logical disk pair. Tombstones are monotonic authoritative deletion history and are never automatically cleared. Delete records before primary removal. A non-same-path compatibility move creates the primary destination, records the source tombstone, then removes the primary source; it is not atomic, so a crash or delete failure can leave both primary objects, while destination failure leaves the source visible and untombstoned. Concurrent source writers require external serialization or provider fencing because the portable contract has no conditional move. A present primary path is visible even when tombstoned; if that primary later disappears, stale fallback remains suppressed. Fallback `read`, `readText`, `size`, and `exists` recheck the tombstone after fallback work and perform one bounded primary recheck to prefer a concurrent replacement; `list()` deliberately retains snapshot semantics. Compaction is deliberately not a runtime API: administrators may compact only after verifying fallback deletion/retention, with explicit growth, retention, backup, and monitoring policy. `InMemoryFilesystemTombstoneStore` is process-local testing/development support, not a production default. Authorization, integrity, and other errors never trigger fallback.

Streams pass native provider bodies when available. The R2 adapter converts async iterables to pull-based web streams without collecting the complete body. Multipart is an explicit `startMultipart` / `uploadPart` / `completeMultipart` / `abortMultipart` lifecycle and is currently implemented by S3. Keep upload IDs server-side and actor/tenant scoped, bound manifests and total bytes, always expose abort/recovery, and configure provider cleanup for abandoned parts.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#filesystem). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/filesystem`](../filesystem/README.md), [`@nuxt-laravelize/filesystem-aws-redis`](../filesystem-aws-redis/README.md).

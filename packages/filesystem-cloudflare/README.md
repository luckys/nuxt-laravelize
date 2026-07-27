# @nuxt-laravelize/filesystem-cloudflare

Cloudflare R2 binding-native implementation of the `@nuxt-laravelize/filesystem` contract. It imports no Workers types or AWS SDK.

```bash
pnpm add @nuxt-laravelize/filesystem @nuxt-laravelize/filesystem-cloudflare
```

```ts
import { CloudflareR2Filesystem } from '@nuxt-laravelize/filesystem-cloudflare'

const files = new CloudflareR2Filesystem(env.UPLOADS, { prefix: 'production/uploads' })
```

The binding only needs structural `get`, `head`, `put`, `delete`, and `list` methods. Paths and the optional prefix must already be normalized relative paths. Listings are paginated and capped at 100,000 objects by default (`maxListObjects`). Native `ReadableStream` bodies are passed through; `AsyncIterable<Uint8Array>` writes are adapted to a pull-based web stream without full buffering, including cancellation and error propagation. Moves use read, write, then delete; a failed write keeps the source, while a failed delete after a successful write can leave both objects.

The binding-native adapter deliberately does not claim temporary URL, direct-upload, visibility, checksum, or multipart capabilities because the structural binding cannot securely provide all required semantics. Capability guards fail closed. Use the S3 API adapter with server-only R2 credentials for SigV4 temporary URLs; do not place those credentials in a Worker client or browser.

For R2 via its S3 API outside Workers, use `@nuxt-laravelize/filesystem-aws` instead of duplicating this adapter.

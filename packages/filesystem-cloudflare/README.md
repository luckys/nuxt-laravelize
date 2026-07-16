# @nuxt-laravelize/filesystem-cloudflare

Cloudflare R2 binding-native implementation of the `@nuxt-laravelize/filesystem` contract. It imports no Workers types or AWS SDK.

```bash
pnpm add @nuxt-laravelize/filesystem @nuxt-laravelize/filesystem-cloudflare
```

```ts
import { CloudflareR2Filesystem } from '@nuxt-laravelize/filesystem-cloudflare'

const files = new CloudflareR2Filesystem(env.UPLOADS, { prefix: 'production/uploads' })
```

The binding only needs structural `get`, `head`, `put`, `delete`, and `list` methods. Paths and the optional prefix must already be normalized relative paths. Listings are paginated and capped at 100,000 objects by default (`maxListObjects`). Moves use read, write, then delete; a failed write keeps the source, while a failed delete after a successful write can leave both objects.

For R2 via its S3 API outside Workers, use `@nuxt-laravelize/filesystem-aws` instead of duplicating this adapter.

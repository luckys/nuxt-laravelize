# @nuxt-laravelize/filesystem-aws

AWS SDK S3 implementation of the `@nuxt-laravelize/filesystem` contract.

```bash
pnpm add @nuxt-laravelize/filesystem @nuxt-laravelize/filesystem-aws
```

```ts
import { createAwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'

const files = createAwsS3Filesystem({
  bucket: 'app-files',
  prefix: 'production/uploads',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
})
```

You may inject an existing command client with `new AwsS3Filesystem({ bucket, prefix, client })`. Configuration is explicit: this package does not read environment variables or log credentials. Paths and prefixes must already be normalized relative paths. Listings are capped at 100,000 objects by default. Moves copy before delete and are not atomic; a delete failure can leave both objects.

For Cloudflare R2's S3 API use endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`, and `forcePathStyle: true`. Keep credentials in server-only secrets.

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

You may inject an existing command client with `new AwsS3Filesystem({ bucket, prefix, client })`. URL tests can inject `signer` for temporary GETs and `postSigner` for direct uploads; production uses `@aws-sdk/s3-request-presigner` and `@aws-sdk/s3-presigned-post`. Configuration is explicit: this package does not read environment variables or log credentials. Paths and prefixes must already be normalized relative paths. Listings are capped at 100,000 objects by default. Moves copy before delete and are not atomic; a delete failure can leave both objects.

The adapter supports temporary GET URLs, constrained presigned POST grants, confirmation through `HeadObject`, native streams, SHA-256 metadata checksums, object ACL visibility, and explicit S3 multipart start/upload/complete/abort. URL expiry is capped at seven days. Portable policies allow adapters to choose an immutability mechanism, but S3 direct-upload issuance requires an exact SHA-256 checksum. Its POST policy enforces `content-length-range` from zero through `maxBytes` and exact conditions for key, selected MIME, actor/tenant metadata, and checksum. Clients submit the returned form fields unchanged. Confirmation requests provider checksum metadata and rejects expired, oversized, wrong-MIME, wrong-checksum, actor-mismatched, or tenant-mismatched objects. Reusing the still-live POST can only write bytes matching the same SHA-256 and exact metadata.

Presigned URLs and form fields are bearer credentials. Actor and tenant metadata are policy-constrained correlation values, not authentication or authorization. Issue grants only after application auth/authz and quotas, retain the trusted grant ID server-side rather than accepting confirmation authority from a client, use unique private quarantine keys, never log grants, and do not expose an object before confirmation and application scanning. Scoped wrappers bind each issuance to its canonical scope audience and reject provider paths outside the exact prefix boundary. `confirmUpload()` atomically reserves a pending canonical issuance; concurrent confirmation fails, provider or validation failure releases it for retry until expiry, and success atomically removes it so replay fails and capacity is immediately released. Capacity counts only live pending/reserved records. The default `InMemoryS3UploadIssuanceStore` is bounded and single-process. A durable shared implementation must make `reserve`, `release`, and `complete` conditional and atomic for multi-instance or restart-safe confirmation. Metadata MIME is not content inspection, and confirmation is not virus scanning. Multipart methods are server-side low-level capabilities: keep upload IDs scoped to an authenticated actor/tenant, bound part counts and bytes, abort failures, and configure provider cleanup for abandoned uploads.

For Cloudflare R2's S3 API use endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`, and `forcePathStyle: true`. Keep credentials in server-only secrets.

# @nuxt-laravelize/filesystem-aws-redis

Redis/Valkey-backed `S3UploadIssuanceStore` for multi-instance S3 direct-upload confirmation. It uses single-key Lua scripts compatible with ioredis 5.x.

```sh
pnpm add @nuxt-laravelize/filesystem-aws @nuxt-laravelize/filesystem-aws-redis ioredis
```

```ts
import Redis from 'ioredis'
import { AwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'
import { RedisS3UploadIssuanceStore } from '@nuxt-laravelize/filesystem-aws-redis'

const redis = new Redis(process.env.REDIS_URL!)
const issuanceStore = new RedisS3UploadIssuanceStore(redis, {
  prefix: 'my-app:s3-upload-issuance:',
})
const files = new AwsS3Filesystem({ bucket, client: s3, issuanceStore })

// The application owns connection shutdown.
await redis.quit()
```

The prefix defaults to `laravelize:filesystem-aws:issuance:` and must be non-empty, at most 256 characters, contain no NUL byte, and end in `:`. Issuance IDs are also validated before key construction. Scripts receive all data through `KEYS`/`ARGV` and touch one key, so they are suitable for ioredis Cluster and Valkey.

`save()` is create-only while an issuance is live. Redis `TIME` decides whether an issuance is already expired, and `PEXPIREAT` applies its absolute policy expiry. Reserve/release mutate hash fields without replacing the key, preserving the original TTL. Audience is checked before reserved state so another scope cannot discover an in-progress confirmation. Reservation tokens are generated with `crypto.randomUUID()` and fence both release and completion; stale holders cannot mutate a newer reservation. Missing or expired completion fails rather than confirming after expiry.

Stored envelopes and decoded issuances are validated and corruption fails closed with `RedisS3UploadIssuanceCorruptionError`. Do not log grant IDs, issuance payloads, or reservation tokens. Redis failover can still lose acknowledged writes depending on durability settings, and completing the Redis record does not revoke an already-issued S3 POST. Keep uploads quarantined, use short expiries and provider cleanup, and authorize/scan before exposure.

## Redis verification

The unit suite uses a structural fake. Run the opt-in real Redis suite before release:

```sh
REDIS_URL='redis://localhost:6379' pnpm test:redis
```

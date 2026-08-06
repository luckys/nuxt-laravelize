# `@nuxt-laravelize/encryption`

[Espanol](./README.es.md) | English

Authenticated application encryption with key rotation for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/encryption
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/encryption'],
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

## Encryption

`@nuxt-laravelize/encryption` provides authenticated AES-256-GCM encryption through the Web Crypto API.

```bash
pnpm add @nuxt-laravelize/encryption
```

Generate a base64url key once and store it in a private environment variable. Never commit production keys.

```ts
import { generateEncryptionKey } from '@nuxt-laravelize/encryption/runtime'

console.log(generateEncryptionKey())
```

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    laravelizeEncryption: {
      key: process.env.NUXT_LARAVELIZE_ENCRYPTION_KEY,
      previousKeys: process.env.NUXT_LARAVELIZE_ENCRYPTION_PREVIOUS_KEYS?.split(',') ?? [],
    },
  },
})
```

Use the auto-imported `useEncrypter(event)` for strings or bytes. A purpose is authenticated but not stored separately; the same purpose is required for decryption.

```ts
const crypt = useEncrypter(event)
const payload = await crypt.encryptString(userId, { purpose: 'password-reset' })
const restored = await crypt.decryptString(payload, { purpose: 'password-reset' })
```

The primary key encrypts new payloads. `previousKeys` are tried only for decryption, enabling rolling rotation without accepting old keys for new ciphertext. Invalid keys fail at service resolution, while malformed, tampered, wrong-purpose and wrong-key payloads all produce the same `DecryptionError` without exposing authentication details.

Encrypted payloads provide confidentiality and integrity, not expiration or replay prevention. Store expiry and one-time-use state separately when building reset links or session tokens.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#encryption). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/hashing`](../hashing/README.md), [`@nuxt-laravelize/core`](../core/README.md).

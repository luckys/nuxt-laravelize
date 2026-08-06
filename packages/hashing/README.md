# `@nuxt-laravelize/hashing`

[Espanol](./README.es.md) | English

Portable password hashing for Nuxt Laravelize

## Install

```bash
pnpm add @nuxt-laravelize/hashing
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/hashing'],
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

## Hashing

`@nuxt-laravelize/hashing` provides password hashing through PBKDF2-SHA-256 and Web Crypto.

```bash
pnpm add @nuxt-laravelize/hashing
```

```ts
const hasher = useHasher(event)
const hash = await hasher.make(password)

if (await hasher.check(password, hash) && hasher.needsRehash(hash)) {
  await users.updatePasswordHash(userId, await hasher.make(password))
}
```

Hashes include a random 128-bit salt, algorithm identifier and iteration count. Different calls for the same password produce different hashes. `check()` accepts older valid costs while `needsRehash()` compares them with the current configuration.

The default is 600,000 iterations. Benchmark production hardware before increasing it, and configure `runtimeConfig.laravelizeHashing.iterations` consistently across instances. Embedded costs above 10,000,000 are rejected before deriving a key to bound denial-of-service risk from untrusted or corrupted hash strings.

Hashing is one-way and intended for passwords. Use `@nuxt-laravelize/encryption` when the original value must be recovered. Rate-limit authentication endpoints independently; password hashing does not prevent online guessing.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#hashing). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/encryption`](../encryption/README.md).

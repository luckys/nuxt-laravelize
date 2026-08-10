---
"@luckys_luis/nuxt-laravelize-filesystem": minor
"@luckys_luis/nuxt-laravelize-filesystem-aws": minor
"@luckys_luis/nuxt-laravelize-filesystem-cloudflare": minor
---

Add fail-closed advanced filesystem capabilities, constrained S3 URLs and upload confirmation, native streams, multipart lifecycle, scoped/read-only/quarantine/fallback wrappers, checksums, and visibility. Quarantine release requires accepted path-and-SHA-256 evidence, promotes one verified byte snapshot, and retains the source for explicit safe cleanup; fallback reads close deletion races, and compatibility moves create the destination before recording the monotonic source tombstone.

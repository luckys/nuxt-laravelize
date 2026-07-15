---
"@nuxt-laravelize/http": patch
"@nuxt-laravelize/mail": patch
"@nuxt-laravelize/notifications": patch
"@nuxt-laravelize/nuxt": patch
"@nuxt-laravelize/queue": patch
---

Allow the preset mailer and notification manager to deliver through an observable fallback logger, add server helpers for mail and queue, expose Policy APIs from the HTTP runtime entry point, and add a Nuxt-native `useHttp` composable powered by `createUseFetch`.

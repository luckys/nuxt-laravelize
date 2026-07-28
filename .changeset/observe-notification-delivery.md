---
'@nuxt-laravelize/events': minor
'@nuxt-laravelize/broadcasting': patch
'@nuxt-laravelize/notifications': minor
'@nuxt-laravelize/notifications-queue': patch
---

Add privacy-bounded notification delivery and attempt-failure events with stable queued correlation metadata, observer failures isolated from delivery outcomes, and explicit boot listener definitions shared across request and worker scopes without leaking scoped registrations.

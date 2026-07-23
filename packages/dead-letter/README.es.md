# `@nuxt-laravelize/dead-letter`

Gestión portable de mensajes fallidos, siempre calificada por origen. El manager valida entradas y cursores opacos y delega en un solo adaptador; **no autoriza** al usuario.

La aplicación debe exigir `dead-letters.list`, `dead-letters.view`, `dead-letters.view-payload`, `dead-letters.view-error-summary`, `dead-letters.retry`, `dead-letters.discard` y el permiso reforzado `dead-letters.retry-inbox`. Nunca use actor o tenant del sobre para autorizar. Payload, resumen de error y pista de tenant requieren inclusión explícita y pueden ser sensibles. Las capacidades de mutación del adapter se deniegan por defecto si se omiten.

Reintentar inbox es al-menos-una-vez y puede repetir efectos. Los recibos ofrecen idempotencia de operación y metadatos de auditoría, no historial inmutable completo. Un fallo del observador no revierte una mutación confirmada. No hay operaciones masivas.

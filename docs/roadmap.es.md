# Roadmap de candidatas

[English](./roadmap.md) | Espanol

Este documento registra capacidades inspiradas en Laravel que podrian aportar valor a Nuxt Laravelize. Es un conjunto priorizado de candidatas, no un compromiso de release. Una candidata solo entra en implementacion cuando se acuerdan sus contratos, runtimes soportados, limites de seguridad, impacto de migracion y responsable de mantenimiento.

## Principios de producto

- Conservar paquetes enfocados, dependencias explicitas y adapters de infraestructura opt-in.
- Adaptar la semantica util de Laravel a Nuxt y Nitro en lugar de copiar literalmente sus APIs.
- Separar contratos portables de adapters Node, database, cloud y vendor.
- Fallar de forma cerrada en autenticacion, autorizacion, tenancy, persistencia y operaciones privilegiadas.
- Exigir stores durables para comportamiento de produccion que deba sobrevivir a la perdida del proceso.
- Incluir fakes, diagnostico operativo, migraciones y smoke tests de entrypoints con cada feature.
- Evitar estado global implicito, descubrimiento magico y adapters dentro del preset principal sin un default portable seguro.

## Secuencia de entrega

### Fase 1: completar aplicaciones convencionales

1. Autenticacion, sesiones, CSRF y tokens estilo Sanctum.
2. Comandos de consola y runner unificado de migraciones.
3. Scheduler para Nuxt 4.
4. Manejo central de excepciones y contratos API tipados.

### Fase 2: desarrollo y operaciones

5. Diagnostico local estilo Telescope.
6. Operaciones de queues y aplicacion estilo Horizon/Pulse.
7. Chains, batches, unicidad y middleware de jobs.
8. Precognition y canales de notificacion de produccion.

### Fase 3: integraciones de producto

9. Autenticacion social, filesystem avanzado y realtime en navegador.
10. Billing, guardrails multi-tenant y adapters adicionales de plataforma.

## Candidatas prioritarias

### Autenticacion, Fortify y semantica Sanctum

Paquetes candidatos: `@nuxt-laravelize/auth`, `@nuxt-laravelize/auth-better-auth` y `@nuxt-laravelize/auth-drizzle`.

El paquete portable definiria contratos confiables de sesion y principal. Un adapter inicial para Better Auth proporcionaria la implementacion de protocolos en vez de introducir un motor de autenticacion nuevo. Debe cubrir sesiones cookie, login/logout, rotacion y revocacion, recuperacion de password, verificacion de email, confirmacion de password, TOTP y recovery codes, personal access tokens, abilities de token, throttling de credenciales, integracion CSRF y eventos de seguridad auditados.

Debe integrarse con `principalResolverToken`, execution context, authorization, hashing, encryption, rate limiting, mail, notifications y audit. La resistencia a enumeracion de cuentas, session fixation, hashing de tokens, politica de cookies, replay de recovery y rotacion de claves son requisitos bloqueantes.

### Sesiones, cookies y CSRF

Paquetes candidatos: `@nuxt-laravelize/session`, `@nuxt-laravelize/session-redis` y `@nuxt-laravelize/csrf`.

Soportarian sesiones firmadas o server-side, regeneracion de ID, flash data, locks de sesion, stores memory/Redis/database, cookies cifradas, defaults seguros y proteccion CSRF compatible con SPA. Deben poder utilizarse sin el paquete de autenticacion.

### Comandos de consola

Paquete candidato: `@nuxt-laravelize/console`.

Estado: implementado como runtime portable opt-in con adapters Node y de testing.

El runtime proporcionaria registro tipado de comandos, argumentos, opciones, help, exit codes, prompts, inyeccion de dependencias, execution context por comando, logs, trazas y testing aislado. Los ejecutables actuales de workers, reconciliacion, pruning, seeding, indexacion y migracion podrian compartirlo sin convertirse en un clon monolitico de Artisan.

### Migraciones unificadas

Paquetes candidatos: `@nuxt-laravelize/migrations` y `@nuxt-laravelize/migrations-drizzle`.

Estado: implementado con backends transaccionales PostgreSQL/SQLite, discovery explicito de aplicacion, comandos console y fuentes agregadas de paquetes.

El runner descubriria migraciones de aplicacion y paquetes, guardaria IDs y checksums, bloquearia deploys concurrentes y ofreceria status/up/rollback/reset/fresh/pretend. Tambien seleccionaria un dialecto explicito y soportaria schemas de test. Agregaria las migraciones existentes de audit, idempotency, reliability, Scout y workflows sin introducir un ORM.

### Scheduler para Nuxt 4

Paquete candidato: `@nuxt-laravelize/scheduler-nuxt`.

Estado: implementado como modulo opt-in Nuxt 4/Nitro 2 con triggers timezone-aware y locks Redis/Valkey.

Las definiciones actuales necesitan una capa de ejecucion compatible con Nuxt 4. El adapter deberia soportar helpers cron, timezones, dispatch de jobs, `withoutOverlapping`, `onOneServer`, mantenimiento, hooks de resultado, listado de schedules, locks distribuidos Redis/Valkey y triggers para Node cron, Cloudflare y Vercel. Debe ejecutar reconciliacion, pruning, retencion, informes e indexacion sin reemplazar la version Nitro de Nuxt.

### Manejo central de excepciones

Paquete candidato: `@nuxt-laravelize/exceptions`.

Este boundary registraria reporters y renderers, mapearia errores de dominio a HTTP Problem Details, excluiria reportes seleccionados, limitaria fallos repetidos, adjuntaria correlation IDs, redactaria datos sensibles y se integraria con observability. Debe reemplazar traducciones HTTP duplicadas sin filtrar stack traces, payloads o secretos.

### Contratos API tipados y OpenAPI

Paquetes candidatos: `@nuxt-laravelize/contracts` y `@nuxt-laravelize/openapi`.

Un contrato declararia una sola vez metodo, path, parametros, query, body, respuestas por status, errores y metadata de autorizacion. Los adapters podrian generar validacion runtime, OpenAPI 3.1, llamadas `useHttp` tipadas, fixtures e informes CI de breaking changes. El diseño extenderia routes, validation, Form Requests, resources y paginacion. Las implementaciones Standard Schema sin introspeccion requeriran metadata explicita o adapters especificos.

### Diagnostico estilo Telescope

Paquete candidato: `@nuxt-laravelize/telescope`.

El dashboard de desarrollo podria inspeccionar requests, excepciones, logs, queries lentas, jobs, eventos, mail, notificaciones, cache, HTTP saliente, webhooks y workflows. Su uso en produccion debe habilitarse y autorizarse explicitamente. Bodies y headers arbitrarios permanecen desactivados por defecto, los secretos se redactan y el almacenamiento tiene retencion acotada.

### Operaciones estilo Horizon/Pulse

Paquetes candidatos: `@nuxt-laravelize/queue-operations` y `@nuxt-laravelize/pulse`, posiblemente compartiendo el shell de dead-letter operations.

La superficie mostraria profundidad, throughput y latencia de queues; heartbeats; jobs retrasados/fallidos; lag de outbox; workflows bloqueados; ejecuciones del scheduler; metricas de cache y HTTP; y dead letters. Acciones fenced y auditadas podrian reintentar, cancelar, reconciliar, pausar, reanudar y ejecutar bulk operations acotadas. La revelacion de payloads seguiria siendo una capacidad privilegiada separada.

### Chains, batches, unicidad y middleware de queues

Entregado: semantica portable de delayed release, prioridades locales a cada queue, deduplicacion explicita de admision local a cada queue, tags diagnosticos acotados, graceful draining BullMQ reforzado, dispatch after-commit best-effort explicito y middleware opt-in `WithoutOverlapping`, `RateLimited` y `ThrottlesExceptions` de ventana fija en los adapters memory y BullMQ, con metadata acotada, politica fail-closed para cache distribuido y observabilidad consciente de releases. Quedan como candidatos chains secuenciales, batches durables con progreso/cancelacion y requisitos de tenant/principal. La metadata durable debe ser versionada, acotada y compatible con ejecucion at-least-once. Esto no debe convertir workflows en un motor DAG implicito.

### Ecosistema de notificaciones

Entregado: bridges opt-in `notifications-mail`, `notifications-queue`, `notifications-database`, `notifications-broadcast` y `notifications-webhook` con rendering/payloads acotados, versiones de tipo durables explicitas, referencias opacas de destinatario y endpoint, recarga de destinatario/preferencias/locale en worker, comprobacion de tenant confiable, fallos terminales para versiones invalidas, deduplicacion durable mediante inbox/outbox, lecturas por cursor tenant-fenced, registros idempotentes leido/no leido respaldados por PostgreSQL o SQLite/Turso, canales realtime privados deterministas, jobs webhook firmados con IDs estables, eventos de lifecycle de entrega/fallo acotados por privacidad, delays de queue validados por destinatario/canal y assertions mas ricas para el fake.

Quedan como candidatos los adapters SMS, push y Slack/Teams. Los eventos de lifecycle son observaciones sincronas best-effort, no recibos terminales durables. Los dead letters pertenecen al backend de queue configurado; la entrega sigue siendo at-least-once en el limite del proveedor externo.

### Precognition

Paquete candidato: `@nuxt-laravelize/precognition`.

Composables Vue invocarian la misma validacion server de Form Requests sin ejecutar el controller. Debe soportar subconjuntos de campos, debounce, cancelacion, valores transformados, error bags, dirty state y tipos Standard Schema.

### Semantica Socialite

Paquete candidato: `@nuxt-laravelize/socialite`, posterior a auth.

Los primeros providers podrian ser GitHub, Google, Microsoft, Apple, Discord y OpenID Connect generico. State, nonce, PKCE, account linking explicito, prevencion de takeover por email, refresh tokens cifrados y eventos link/unlink auditados son obligatorios.

### Echo y realtime

Paquetes candidatos: `@nuxt-laravelize/echo` y `@nuxt-laravelize/echo-pusher`.

La capa browser proporcionaria composables Vue SSR-safe para canales publicos, privados y presence, eventos tipados, autenticacion, reconexion/resubscripcion y dispose automatico. Un servidor propio estilo Reverb solo deberia considerarse tras estabilizar el contrato cliente; Pusher es el primer adapter de menor riesgo.

### Filesystem avanzado

Entregado en los contratos portables y adapters opt-in: guards de capacidades fail-closed, politicas inmutables de upload restringido y confirmacion, discos scoped/read-only, release/reject explicito de cuarentena, fallback de lectura con escrituras solo al primario y contratos de streams/multipart. El adapter S3 proporciona URLs SigV4 GET temporales y uploads POST prefirmados con rangos reales de tamaño y condiciones exactas de MIME/metadata/checksum, confirmacion de metadata, visibility, checksums SHA-256, bodies nativos y lifecycle multipart explicito. El adapter local proporciona streams, checksums y visibility; el binding R2 proporciona streams pero no declara signing ni capacidades que no pueda garantizar.

El escaneo antivirus y las transformaciones siguen siendo responsabilidad de queues/workflows de la aplicacion tras confirmar; no se declara ningun scanner. Un adapter Redis/Valkey ya proporciona estado compartido atomico para confirmacion; la durabilidad ante failover, proteccion de carreras mediante versiones inmutables, configuracion lifecycle del provider y verificacion de replicas siguen siendo infraestructura de aplicacion/provider, no semantica portable simulada.

### Mejoras de factories

Entregado en `@nuxt-laravelize/database/runtime`: states/sequences indexados, composicion explicita y anidada `has`/`for`, recycling local determinista, Faker con seed y reloj fijo, adapters tipados sync/async, compatibilidad con callbacks y hooks before/after secuenciales. La composicion sigue siendo explicita e independiente del ORM; deliberadamente no se incluyen metadata ORM, foreign keys implicitas, pools globales, persistencia/transacciones bulk ni un clon de Eloquent.

### Billing estilo Cashier

Paquetes candidatos: `@nuxt-laravelize/cashier` y `@nuxt-laravelize/cashier-stripe`.

El primer adapter podria cubrir customers, subscriptions, trials, usage billing, invoices, Checkout, customer portal, webhooks idempotentes y sincronizacion de entitlements con Pennant. Los cambios de billing usarian reliability y workflows para retry y compensacion. Paddle u otros providers serian adapters separados.

### Servidores OAuth

Los personal tokens estilo Sanctum y adapters OIDC externos deben preceder a un servidor OAuth estilo Passport. Un authorization server propio solo debe considerarse con demanda demostrada y mantenimiento de seguridad dedicado.

### Localizacion server

Implementado: `ServerLocalization` solo-server, factories con request y sin event, reutilizacion de diccionarios/fallback/plural generados, formato Intl por locale, validacion estricta contra locales configurados, resolucion de request, propagacion por execution context y queue, y persistencia audit de primera clase. La documentacion de validation muestra como construir Standard Schema localizado. Quedan pendientes preferencias de destinatario, adapters de rendering y entrega encolada para notifications/mail, y adapters de validation especificos de vendors.

### Maintenance mode

El soporte podria incluir activacion por consola, secret bypass, `Retry-After`, respuestas pre-renderizadas, estado compartido Redis/database, excepciones para workers/scheduler, metricas y audit. Debe ser consistente entre multiples instancias.

### HTTP saliente estilo Laravel

El cliente HTTP podria añadir clients nombrados, retries y backoff, timeouts, pools, middleware, circuit breakers, idempotency keys, fakes/assertions, observabilidad segura, redaccion y respuestas tipadas desde contratos API.

### Guardrails multi-tenant

Paquetes candidatos: `@nuxt-laravelize/tenancy` y adapters de base de datos opcionales.

Resolverian tenant desde una fuente confiable, verificarian membership, exigirian contexto tenant en handlers/jobs seleccionados, aplicarian scope a cache/files/search, propagarian identidad con reautorizacion del worker y soportarian integraciones PostgreSQL RLS o session variables. La metadata de contexto nunca equivale a autorizacion y ningun paquete independiente del ORM puede garantizar aislamiento total de queries.

## Quick wins

Estas mejoras menores pueden aportar valor antes de los paquetes grandes:

1. Comando `doctor` para configuracion, adapters, migraciones, workers y definiciones historicas.
2. Bridge `audit-http` acotado a route, outcome, duracion y decisiones de autorizacion.
3. Bulk actions acotadas en dead-letter operations.
4. Entregado: assertions de notificaciones mas ricas y delays de queue validados por canal.
5. Entregado: middleware `WithoutOverlapping` y `RateLimited` con delayed release portable.
6. URLs temporales para S3 y R2.
7. Maintenance mode sobre un store compartido.
8. Generadores para policies, jobs, workflows, notifications, commands y migrations.
9. Ejemplo productivo con PostgreSQL, Redis/Valkey, BullMQ y OpenTelemetry.

## No objetivos deliberados

El roadmap no prioriza actualmente:

- Un ORM compatible con Eloquent o Active Record.
- Facades globales o estado process-wide oculto.
- Un servidor Passport/OAuth propio sin ownership de seguridad dedicado.
- Un servidor Reverb antes de disponer de cliente browser estable.
- Semantica Octane que duplique el modelo runtime de Nitro.
- Migracion automatica arbitraria de workflows en vuelo.
- DAGs sin limites, event sourcing o fan-out/fan-in antes de validar ampliamente los invariantes de workflows lineales en produccion.
- Incluir adapters especificos de infraestructura en el preset principal por defecto.

## Graduacion de candidatas

Una candidata puede convertirse en feature comprometida cuando tenga contrato portable aceptado, matriz de runtimes, threat model cuando corresponda, adapter durable o dependencia externa documentada, estrategia de tests, lifecycle operativo, plan de migracion, ownership del paquete y clasificacion de compatibilidad del release.

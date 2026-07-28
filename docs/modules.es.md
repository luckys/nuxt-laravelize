# Guia de modulos y API

[English](./modules.md) | Espanol

Esta guia cubre todos los paquetes publicos de Nuxt Laravelize. Los imports desde rutas no incluidas aqui son internos y pueden cambiar sin aviso.

## Preset Nuxt

Instala `@nuxt-laravelize/nuxt` para activar juntos los modulos estables, el bridge reliability-queue y `nuxt-i18n-micro`. BullMQ, los adapters durables de reliability y el scheduler experimental se excluyen intencionalmente.

```bash
pnpm add @nuxt-laravelize/nuxt
```

```ts
// nuxt.config.ts
import Laravelize from '@nuxt-laravelize/nuxt'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'es', iso: 'es-ES', dir: 'ltr' }],
    defaultLocale: 'es',
    translationDir: 'locales',
  },
})
```

Usa `$t()` en templates o `useI18n().$t()` en scripts. Define `i18n: false` para desactivar la integracion.

Los handlers Nitro usan los mismos diccionarios generados, fallback y funcion plural de `nuxt-i18n-micro` mediante la API solo-server:

```ts
export default defineEventHandler(async (event) => {
  const i18n = await useServerLocalization(event)
  return { message: i18n.t('welcome', { name: 'Ada' }), count: i18n.tc('apples', 2) }
})

import { createServerLocalization } from '@nuxt-laravelize/nuxt/runtime/server'
const i18n = await createServerLocalization(context.snapshot().locale ?? 'es')
```

`createServerLocalization()` sirve para jobs, preparacion de mail, notifications, CLI y scheduler sin H3 event. `ServerLocalization` expone `locale` canonico, `localeCode` configurado exacto, `defaultLocale`, `fallbackLocale`, `fallbackLocales`, `availableLocales`, `t`, `tc`, `tn`, `td` y `tdr`. La resolucion de request respeta path/query, cookie de locale, `Accept-Language` y default configurados; los aliases code, ISO y language configurados participan en la deteccion automatica. Los locales publicos y el formato Intl usan tags BCP 47 canonicos, mientras los diccionarios y las reglas plurales custom reciben el code configurado exacto (por ejemplo, `en_US` expone `en-US`, pero plural recibe `en_US`). Los locales explicitos y detectados solo coinciden con aliases configurados, y valores malformados o no soportados nunca forman paths de assets. La cadena fallback del locale seleccionado se aplica antes del fallback global/default, acotando duplicados y ciclos; cada referencia debe resolver a un locale habilitado. Se soportan los modos de payload `source` y premerged. Los payloads global/index ausentes se comportan como diccionarios vacios, manteniendo route-specific los layouts con traducciones solo de pagina. Cada objeto queda aislado por request. El entrypoint server publico se puede importar desde Node y `createServerLocalization(locale, source)` acepta un source inyectable sin event. Las APIs de localizacion y la integracion Nitro no se registran si i18n es false, falta o no tiene locales utilizables.

## Autorizacion

`@nuxt-laravelize/authorization` esta incluido en el preset. Su core no depende de H3: resuelve `authorizationToken` en scopes HTTP, queues, workflows o CLI, y usa el autoimport `useAuthorization(event)` solo en el borde HTTP. Las abilities globales y policies de recursos se registran una vez mediante el singleton `authorizationRegistryToken`; los tipos de recurso usan keys estables explicitas y los duplicados fallan inmediatamente.

El authorizer scoped llama al `principalResolverToken` reemplazable para recargar el principal vigente. Los snapshots propagados o serializados son metadata, nunca credenciales. En contextos de cola, un principal ordinario se deniega centralmente; devuelve `trustQueuePrincipal(principal)` solo despues de que la aplicacion autentique independientemente la delegacion o la identidad actual del worker. Esta afirmacion es responsabilidad de la aplicacion y no debe derivarse del actor, tenant, atributos u otros claims del envelope. El resolver por defecto no devuelve principal y por ello deniega. `inspect` devuelve una decision tipada y acotada; `allows`, `denies`, `authorize`, `any` y `none` agregan conveniencia. El nombre de ability de recurso `before` esta reservado para el hook de policy; la accion solicitada debe existir antes de ejecutar el hook y `null`/`undefined` significa continuar. Los errores portables no dependen de H3; el borde HTTP debe mapear denegaciones a 403.

## Rutas tipadas

`@nuxt-laravelize/routes` genera `#laravelize/routes` desde declaraciones explicitas y esta incluido en el preset. Solo infiere parametros de URL y metodos HTTP; intencionalmente **no infiere** bodies de request ni responses.

```ts
// routes.ts
import { route } from '@nuxt-laravelize/routes/runtime'

export default {
  users: {
    show: route('GET', '/users/{user}/{section?}'),
    files: route('GET', '/users/{user}/files/{path+}'),
    browse: route('GET', '/files/{path*}'),
  },
} as const
```

El archivo convencional `routes.ts` se carga automaticamente. Configura `laravelizeRoutes.declarations` para otros archivos explicitos y `baseURL` para un prefijo comun. Usa `{id}` para valores obligatorios, `{id?}` para opcionales, `{path+}` para un catch-all obligatorio no vacio y `{path*}` para uno opcional.

```ts
import routes from '#laravelize/routes'

routes.users.show({ user: 42 }, { query: { preview: true } })
// { method: 'GET', url: '/users/42?preview=1' }
```

Los valores de path se codifican. Los arrays catch-all conservan sus segmentos, mientras `.` y `..` se rechazan para impedir URLs con traversal. Las keys query se ordenan, los arrays conservan su orden, los booleanos usan `1`/`0` y los valores nullish se omiten. Los autores de paquetes pueden registrar declaraciones con `addRoutesDeclaration()` desde `@nuxt-laravelize/routes/kit`.

## Cache

`@nuxt-laravelize/cache` proporciona un contrato cache async portable, operaciones al estilo Laravel y un driver en memoria por defecto.

```bash
pnpm add @nuxt-laravelize/cache
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/cache'],
})
```

El preset completo ya registra este modulo.

Usa el autoimport `useCache(event)` en handlers Nitro. Los TTL numericos son segundos; un `Date` es una expiracion absoluta; omitir TTL guarda para siempre.

```ts
export default defineEventHandler(async (event) => {
  const cache = useCache(event)
  const users = await cache.remember('users:active', 60, () => loadActiveUsers())
  return { users }
})
```

| API | Proposito |
|---|---|
| `get(key, default?)` / `has(key)` | Lee un valor o comprueba una key no expirada. |
| `put(key, value, ttl?)` / `forever()` | Guarda temporalmente o para siempre. Un TTL no positivo elimina. |
| `add(key, value, ttl?)` | Guarda atomicamente solo si la key no existe. |
| `pull(key, default?)` | Lee y elimina un valor. |
| `forget(key)` / `flush()` | Elimina una key o todas. |
| `forgetIf(key, expected)` | Elimina atomicamente una key solo si su valor todavia coincide. |
| `remember(key, ttl, factory)` | Carga y guarda un valor ausente; llamadas concurrentes en el proceso comparten una promise. |
| `rememberForever(key, factory)` | Memoriza sin expiracion. |
| `increment()` / `decrement()` | Cambia atomicamente un numero y crea contadores ausentes desde cero. |
| `cacheToken` | Resuelve la implementacion `Cache` configurada desde el contenedor. |
| `CacheFake` | Fake en memoria con `assertHas()`, `assertMissing()` y `reset()`. |

```ts
await cache.add('locks:report', ownerId, 30)
await cache.increment('login-attempts:user_1', 1, 60)
const token = await cache.pull<string>('password-reset:user_1')
```

`InMemoryCache` sirve para tests, desarrollo y un solo proceso persistente. Elimina expiraciones accedidas de forma lazy y limpia oportunistamente valores expirados no accedidos durante escrituras. No coordina workers, instancias, regiones ni invocaciones serverless. Liga un adapter compartido a `cacheToken` para cache distribuido u operaciones atomicas entre procesos. Cache es un limite de optimizacion: no hagas que la correccion del dominio dependa de datos cacheados.

`undefined` esta reservado para un cache miss y no puede guardarse; usa `null` cuando la ausencia sea el valor cacheado. Las mutaciones invalidan la escritura de un `remember()` pendiente para que loaders antiguos no sobrescriban valores nuevos.

### Locks atomicos

Crea un lock seguro por owner con `useCacheLock(event, name, ttlSeconds)`. `run()` ejecuta inmediatamente si adquiere el lock y devuelve `undefined` cuando esta ocupado. `block()` reintenta hasta adquirirlo o lanza `LockTimeoutError`.

```ts
export default defineEventHandler(async (event) => {
  return await useCacheLock(event, 'reports:daily', 30).block(5, async () => {
    return await generateDailyReport()
  })
})
```

Cada lock expone un token opaco `owner`. Pasa ese token como cuarto argumento de `useCacheLock()` para restaurar y liberar ownership desde otro proceso. `release()` usa compare-and-delete atomico y no puede borrar un lock readquirido por otro owner despues de expirar. Reserva `forceRelease()` para recuperacion administrativa porque ignora ownership intencionalmente.

Usa `lock.renew(ttlSeconds?)` para extender atomicamente un lease solo mientras coincida su owner. La capacidad `Cache.expireIf` es opcional para mantener compatibilidad con adapters personalizados; la renovacion falla de forma segura con `false` cuando no esta disponible y nunca se emula con una lectura y escritura expuestas a carreras. Los locks de cache no tienen fencing token, y un failover o lag de replicacion de Redis/Valkey puede romper la exclusion mutua.

Para despliegues Node compartidos, instala `@nuxt-laravelize/cache-redis` con ioredis 5. Soporta Redis y Valkey, usa un prefijo obligatorio y deja a la aplicacion el inicio/cierre de la conexion. No esta incluido en el preset `@nuxt-laravelize/nuxt`. Su `flush()` por prefijo usa `SCAN` escapado y lotes acotados de `UNLINK`/`DEL`, no es atomico y debe ejecutarse en cada primario de Redis Cluster.

Los locks distribuidos requieren que los adapters cache compartidos implementen `add()` y `forgetIf()` atomicamente. El TTL debe superar la operacion protegida; la expiracion evita deadlocks permanentes pero no cancela un callback que tarde demasiado.

## Rate limiting

`@nuxt-laravelize/rate-limiter` proporciona limites de ventana fija respaldados por cache. El preset completo lo registra automaticamente; una instalacion granular puede agregarlo directamente.

```bash
pnpm add @nuxt-laravelize/rate-limiter
```

Consume un intento con el autoimport `useRateLimiter(event)`. La metadata devuelta sirve para respuestas y logs de aplicacion.

```ts
export default defineEventHandler(async (event) => {
  const result = await useRateLimiter(event).hit(`login:${userId}`, 5, 60)
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfter: result.retryAfter,
  }
})
```

Usa `ThrottleRequests` en un pipeline de middleware Laravelized para rechazar exceso de requests con `429 Too Many Requests`. Agrega `X-RateLimit-Remaining`, `X-RateLimit-Reset` y, al rechazar, `Retry-After`.

```ts
const throttle = new ThrottleRequests(useRateLimiter(event), {
  key: event => getRequestIP(event, { xForwardedFor: true }) ?? 'unknown',
  maxAttempts: 60,
  decaySeconds: 60,
})

return await throttle.handle(event, next)
```

| API | Proposito |
|---|---|
| `hit(key, maxAttempts, decaySeconds?)` | Consume atomicamente un intento y devuelve metadata de la ventana. |
| `attempts(key)` / `remaining(key, max)` | Inspecciona el uso actual sin consumir un intento. |
| `clear(key)` | Elimina intentos y timer de una key logica. |
| `rateLimiterToken` | Resuelve o reemplaza el limiter configurado. |
| `useRateLimiter(event)` | Resuelve el singleton en Nitro. |

La aplicacion distribuida requiere un adapter de cache compartido cuyas operaciones `add` e `increment` sean atomicas. El `InMemoryCache` por defecto solo coordina requests atendidos por un proceso persistente. Deriva keys de identificadores confiables y acotados; hashear input no acotado evita crecimiento de keys controlado por atacantes.

## Encryption

`@nuxt-laravelize/encryption` proporciona cifrado autenticado AES-256-GCM mediante Web Crypto.

```bash
pnpm add @nuxt-laravelize/encryption
```

Genera una clave base64url una vez y guardala en una variable de entorno privada. Nunca hagas commit de claves de produccion.

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

Usa el autoimport `useEncrypter(event)` para strings o bytes. El proposito se autentica pero no se guarda por separado; el mismo proposito es obligatorio al descifrar.

```ts
const crypt = useEncrypter(event)
const payload = await crypt.encryptString(userId, { purpose: 'password-reset' })
const restored = await crypt.decryptString(payload, { purpose: 'password-reset' })
```

La clave primaria cifra payloads nuevos. `previousKeys` solo se prueban al descifrar, permitiendo rotacion gradual sin aceptar claves antiguas para ciphertext nuevo. Claves invalidas fallan al resolver el servicio, mientras payloads malformados, manipulados, con otro proposito u otra clave producen el mismo `DecryptionError` sin revelar detalles de autenticacion.

Los payloads cifrados proporcionan confidencialidad e integridad, no expiracion ni prevencion de replay. Guarda expiracion y estado de uso unico por separado al construir reset links o tokens de sesion.

## Hashing

`@nuxt-laravelize/hashing` proporciona hashing de passwords mediante PBKDF2-SHA-256 y Web Crypto.

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

Los hashes incluyen salt aleatorio de 128 bits, identificador de algoritmo y numero de iteraciones. Distintas llamadas para el mismo password generan hashes diferentes. `check()` acepta costes anteriores validos mientras `needsRehash()` los compara con la configuracion actual.

El valor por defecto es 600.000 iteraciones. Mide el hardware de produccion antes de aumentarlo y configura `runtimeConfig.laravelizeHashing.iterations` de forma consistente entre instancias. Costes embebidos superiores a 10.000.000 se rechazan antes de derivar una clave para limitar riesgo de denegacion de servicio por hashes no confiables o corruptos.

El hashing es unidireccional y esta pensado para passwords. Usa `@nuxt-laravelize/encryption` cuando debas recuperar el valor original. Aplica rate limiting a endpoints de autenticacion por separado; el hashing no evita intentos online.

## Filesystem

`@nuxt-laravelize/filesystem` proporciona discos nombrados al estilo Laravel sobre un contrato portable orientado a bytes.

```bash
pnpm add @nuxt-laravelize/filesystem
```

El preset completo registra un disco en memoria por defecto. Usa `useFilesystem(event, disk?)` en handlers Nitro.

```ts
export default defineEventHandler(async (event) => {
  const files = useFilesystem(event)
  await files.write('exports/report.csv', csv)
  return { bytes: await files.size('exports/report.csv') }
})
```

| API | Proposito |
|---|---|
| `write()` / `read()` / `readText()` | Guarda strings o bytes y lee copias defensivas o texto UTF-8. |
| `exists()` / `delete()` / `size()` | Inspecciona y elimina archivos. |
| `copy()` / `move()` | Copia o mueve un archivo dentro de un disco. |
| `list(prefix?)` | Lista recursivamente paths logicos normalizados en orden estable. |
| `FilesystemManager` | Registra y resuelve discos nombrados. |
| `FilesystemFake` | Fake en memoria con assertions y reset. |

El `InMemoryFilesystem` portable sirve para tests, desarrollo o archivos efimeros en un proceso. Para despliegues Node persistentes, registra `LocalFilesystem` desde `@nuxt-laravelize/filesystem/node` en un provider propio:

```ts
import { LocalFilesystem } from '@nuxt-laravelize/filesystem/node'

manager.register('reports', new LocalFilesystem('/srv/app/storage/reports'))
```

`LocalFilesystem` normaliza separadores, rechaza bytes null, traversal `..` y enlaces simbolicos, y confina cada operacion al root configurado. No lo uses como almacenamiento compartido entre instancias serverless; registra un adapter de object storage.

Los adapters cloud son paquetes opcionales y el preset completo no los instala:

```ts
import { CloudflareR2Filesystem } from '@nuxt-laravelize/filesystem-cloudflare'

manager.register('uploads', new CloudflareR2Filesystem(env.UPLOADS, {
  prefix: 'production/uploads',
  maxListObjects: 20_000,
}))
```

El adapter Cloudflare es estructural y nativo del binding: no importa tipos de Workers ni el AWS SDK. El binding debe proporcionar `get`, `head`, `put`, `delete` y `list` paginado. Para AWS S3, o Cloudflare R2 mediante su API compatible con S3 fuera de Workers, usa el paquete AWS aislado:

```ts
import { createAwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'

manager.register('archive', createAwsS3Filesystem({
  bucket: 'app-archive',
  prefix: 'production',
  region: 'eu-west-1',
  credentials: { accessKeyId, secretAccessKey },
}))
```

Para R2 usa el endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto` y `forcePathStyle: true`. Ambos adapters exigen paths y prefijos relativos ya normalizados: rechazan paths absolutos, backslashes, separadores repetidos, segmentos punto, traversal y bytes null. El listado sigue la paginacion del proveedor, verifica los limites del prefijo y falla en vez de devolver datos parciales si supera el limite configurable o el token no avanza. Guarda credenciales en configuracion privada del servidor; los factories nunca leen variables de entorno ni muestran credenciales.

Los moves cloud hacen copy y despues delete; no son atomicos. El source solo se elimina tras escribir/copiar correctamente el destino. Si el delete posterior falla pueden quedar ambos objetos; reintenta o reconcilia ese estado cuando el workflow exija una sola copia. Un move al mismo path verifica que exista y no muta nada.

### Capacidades avanzadas de filesystem

El comportamiento avanzado es opcional y se descubre con guards como `isTemporaryUrlFilesystem()`, `isDirectUploadFilesystem()`, `isUploadConfirmationFilesystem()`, `isStreamFilesystem()` e `isMultipartFilesystem()`. Un guard falso significa no soportado; el caller no debe inventar URLs ni emular semantica de seguridad.

Crea autoridad de upload directo con `createDirectUploadPolicy()`. Las politicas son valores JSON congelados y requieren un path normalizado dentro de `keyPrefix`, `maxBytes` positivo, allowlist MIME, actor, tenant y expiracion maxima de siete dias. El checksum sigue opcional en el contrato portable para adapters con otro mecanismo de promocion inmutable, pero S3 exige SHA-256 exacto para emitir. S3 devuelve un POST prefirmado cuya policy impone `content-length-range` desde cero hasta `maxBytes` y condiciones exactas para key, MIME seleccionado, metadata actor/tenant y checksum. Envia los campos devueltos sin modificarlos. Tras el upload, llama `confirmUpload(grant)` con el grant confiable retenido en server y continua solo si tamaño, MIME seleccionado, metadata y checksum del provider coinciden.

```ts
import { createDirectUploadPolicy, isDirectUploadFilesystem, isUploadConfirmationFilesystem } from '@nuxt-laravelize/filesystem/runtime'

const policy = createDirectUploadPolicy({
  path: `quarantine/${crypto.randomUUID()}`,
  keyPrefix: 'quarantine',
  maxBytes: bytes,
  mimeTypes: ['application/pdf'],
  checksum: { algorithm: 'sha256', value: sha256Hex },
  actorId: user.id,
  tenantId: tenant.id,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
})

if (!isDirectUploadFilesystem(files) || !isUploadConfirmationFilesystem(files)) throw new Error('Upload directo no soportado')
const grant = await files.createDirectUpload({ policy, mimeType: 'application/pdf' })
// Devuelve el bearer grant solo desde un endpoint server autenticado, autorizado y limitado.
// Conserva este grant confiable en server; no aceptes del browser un grant serializado para confirmar.
const confirmed = await files.confirmUpload(grant)
```

La metadata actor/tenant del formulario son valores de correlacion restringidos por la policy firmada, no autenticacion. Los wrappers scoped ligan la emision a la audiencia canonica del scope y validan el limite exacto del prefijo devuelto. La confirmacion S3 reserva atomicamente el registro canonico por ID aleatorio: intentos concurrentes fallan, errores del provider o de metadata/checksum liberan la reserva para reintentar hasta expirar, y el exito lo elimina atomicamente, liberando capacidad acotada de inmediato y rechazando el replay de `confirmUpload()`. El POST prefirmado emitido por el provider es una autoridad separada y sigue reutilizable hasta su expiracion firmada; confirmar no lo revoca ni debe simular una revocacion inexistente. Usa TTL corto, una key privada y unica de cuarentena por emision, procesamiento idempotente/con deduplicacion de eventos y lifecycle cleanup del provider. El store por defecto es local al proceso; un `S3UploadIssuanceStore` durable compartido debe implementar `reserve`, `release` y `complete` condicionales y atomicos. El checksum S3 obligatorio hace que un POST repetido solo pueda reemplazar con bytes y metadata identicos. Confirmar no es inspeccionar contenido, escanear virus ni autorizar. Autentica y autoriza la emision por separado, escanea/transforma en una queue o workflow y libera solo el objeto aceptado. Nunca registres URLs ni campos firmados. El binding R2 no puede firmar y sus guards de URL fallan intencionadamente; usa el adapter S3-compatible con credenciales solo server.

Para confirmacion multi-instancia, inyecta `RedisS3UploadIssuanceStore` desde `@nuxt-laravelize/filesystem-aws-redis`. Sus transiciones Lua de una sola key usan tiempo Redis, conservan el TTL de la policy, comprueban audience antes de revelar la reserva, aplican fencing por token a release/completion y rechazan registros corruptos. Usa un prefijo propio y Redis persistente; un failover Redis asincrono aun puede perder estado confirmado, por lo que los uploads permanecen en cuarentena y el procesamiento posterior debe ser idempotente.

`scopedFilesystem(files, prefix)` aplica confinamiento a ambos operandos y cada capacidad opcional expuesta. `readOnlyFilesystem(files)` rechaza mutaciones base y omite metodos opcionales mutables. `quarantineFilesystem()` proporciona operaciones explicitas `disk`, `release()` y `reject()` sin scan implicito. El `release({ accepted: true, path, checksum: { algorithm: 'sha256', value } }, destination, destinationPath?)` seguro solo acepta evidencia confiable del scanner/workflow para el path normalizado y digest exacto; lee un snapshot coherente de bytes, verifica y escribe esos mismos bytes, y conserva el source de cuarentena en todos los casos exitosos. Un reemplazo concurrente no se promociona ni se elimina. Nunca aceptes evidencia de release desde un cliente. El cleanup es una accion posterior y explicita mediante `reject()` o lifecycle del provider, solo despues de que el caller garantice un path/version inmutable; `release()` no hace read-then-delete porque el contrato portable no ofrece delete condicional/versionado. El mutable `ReadFallbackFilesystem(primary, fallback, tombstones)` exige un `FilesystemTombstoneStore` async explicito; en produccion debe ser durable, compartido y namespaced para ese par logico. Los tombstones son historial autoritativo monotono y nunca se limpian automaticamente. Delete registra antes de retirar el primario. Un move de compatibilidad entre paths distintos crea primero el destino primario, registra el tombstone del source y despues retira el source primario; no es atomico, por lo que un crash o fallo de delete puede dejar ambos objetos primarios, mientras un fallo de destino deja el source visible y sin tombstone. Los writers concurrentes del source requieren serializacion externa o fencing del provider porque el contrato portable no ofrece move condicional. Un path primario presente sigue visible aunque tenga tombstone; si desaparece despues, el fallback obsoleto permanece bloqueado. `read`, `readText`, `size` y `exists` vuelven a comprobar el tombstone tras operar sobre fallback y hacen una unica comprobacion acotada del primario para preferir un reemplazo concurrente; `list()` conserva deliberadamente semantica de snapshot. La compactacion no forma parte del API runtime: solo puede hacerla administracion tras verificar delete/retention del fallback, con politicas explicitas de crecimiento, retencion, backup y monitorizacion. `InMemoryFilesystemTombstoneStore` es process-local para testing/desarrollo, nunca default de produccion. Errores de autorizacion, integridad u otros nunca activan fallback.

Los streams pasan bodies nativos del provider cuando existen. El adapter R2 convierte iterables async en web streams pull-based sin reunir el body completo. Multipart tiene lifecycle explicito `startMultipart` / `uploadPart` / `completeMultipart` / `abortMultipart` y actualmente lo implementa S3. Mantiene los upload IDs server-side y ligados a actor/tenant, limita manifests y bytes totales, ofrece abort/recovery y configura limpieza del provider para partes abandonadas.

## Core

`@nuxt-laravelize/core` proporciona el contenedor de dependencias, tokens tipados, service providers, ciclo de vida y logging. Los modulos de features lo instalan automaticamente.

```bash
pnpm add @nuxt-laravelize/core
```

### Contenedor y tokens

| API | Proposito |
|---|---|
| `createToken<T>(key)` | Crea un identificador de servicio tipado. |
| `createContainer()` | Crea un contenedor vacio. |
| `bind(token, factory)` | Registra un servicio transitorio. |
| `singleton(token, factory)` | Registra una instancia compartida. |
| `scoped(token, factory)` | Registra una instancia por scope hijo. |
| `instance(token, value)` | Registra un valor existente. |
| `make(token)` / `has(token)` | Resuelve un servicio o comprueba su registro. |
| `createScope()` | Crea un scope de request u operacion. |
| `seal()` | Impide nuevos registros. Nuxt sella el contenedor despues del boot. |
| `dispose()` | Libera este contenedor. Libera cada scope hijo por separado. |

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

interface Clock { now(): Date }
const clockToken = createToken<Clock>('app.clock')
const container = createContainer()

container.singleton(clockToken, () => ({ now: () => new Date() }))
container.seal()

const now = container.make(clockToken).now()
```

Implementa `ServiceProvider.register()` para bindings y el metodo opcional `boot()` para trabajo que requiere todos los providers registrados.

```ts
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

export default class ClockServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(clockToken, () => ({ now: () => new Date() }))
  }
}
```

Registra un provider desde un modulo Nuxt con `addLaravelizeProvider(nuxt, path, mode)` de `@nuxt-laravelize/core/kit`. En handlers Nitro, los autoimports `useContainer(event)` y `useLogger(event)` resuelven el scope del request actual.

### Logging

| API | Proposito |
|---|---|
| `ConsoleLogger` | Escribe registros legibles en una consola. |
| `StructuredLogger` | Escribe registros JSON estructurados. |
| `FileLogger` | Agrega registros a un archivo; usalo en runtimes Node. |
| `loggerFor(resolver)` | Resuelve `loggerToken` o devuelve un logger de consola con nivel warning. |
| `shouldEmit(level, minimum)` | Compara niveles usando `LOG_LEVELS`. |
| `FakeLogger` | Guarda logs para assertions mediante `/testing`. |

```ts
import { ConsoleLogger } from '@nuxt-laravelize/core/runtime'

const logger = new ConsoleLogger({ threshold: 'info' })
logger.info('Invoice created', { invoiceId: 'inv_1' })
```

Las clases de ciclo de vida `LaravelizeApplication` y `Kernel`, errores del contenedor, contratos de logger y opciones se exportan para autores de frameworks y adapters. Las aplicaciones normalmente usan providers y helpers de runtime Nuxt.

## Events

`@nuxt-laravelize/events` despacha eventos de forma sincrona. Las definiciones de listeners registradas durante boot se comparten con dispatchers de requests y workers, mientras las instancias y dependencias de cada listener se resuelven desde el scope actual.

```bash
pnpm add @nuxt-laravelize/events
```

```ts
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'
import { InMemoryDispatcher, type Listener } from '@nuxt-laravelize/events/runtime'

class UserRegistered {
  constructor(readonly userId: string) {}
  toPayload() { return [this.userId] }
}

const listenerToken = createToken<Listener<UserRegistered>>('listeners.welcome-user')
const container = createContainer()
container.singleton(listenerToken, () => ({
  handle: async event => console.log(`Welcome ${event.userId}`),
}))

const events = new InMemoryDispatcher(container)
events.listen(UserRegistered, listenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Proposito |
|---|---|
| `listen(Event, listenerToken)` | Registra un listener para una clase de evento. |
| `listenAny(listenerToken)` | Registra un listener para todos los eventos. |
| `subscribe(subscriberToken)` | Permite que un `EventSubscriber` registre varios listeners. |
| `dispatch(event)` | Ejecuta listeners en orden; devolver `false` detiene la propagacion. |
| `ShouldQueue` | Marca un listener con `shouldQueue: true` para el adapter de cola opcional. |
| `dispatcherToken` | Resuelve el `Dispatcher`; `useDispatcher(event)` se autoimporta en Nitro. |
| `eventListenerRegistryToken` | Registra definiciones de listeners de boot compartidas por dispatchers de requests y workers. |
| `EventFake` | Guarda eventos y ofrece `assertDispatched`, `assertNotDispatched` y `reset`. |

Los providers de aplicacion que registran listeners durante boot deben resolver `eventListenerRegistryToken`; un `EventSubscriber` puede recibir ese registry directamente desde el provider. `dispatcher.listen()`, `listenAny()` y `subscribe()` permanecen locales al dispatcher del request o worker actual y nunca filtran registros a scopes hermanos.

```ts
import { EventFake } from '@nuxt-laravelize/events/testing'

const events = new EventFake()
await events.dispatch(new UserRegistered('user_1'))
events.assertDispatched(UserRegistered, event => event.userId === 'user_1')
```

## Broadcasting

`@nuxt-laravelize/broadcasting` forma parte del preset y conecta eventos `ShouldBroadcast` con canales publicos, privados o de presencia. Cada evento debe implementar `broadcastWith()` explicitamente; nunca se reflejan sus propiedades, evitando filtrar payloads por accidente. Registra autorizaciones privadas y de presencia mediante el registro `useBroadcastChannels(event)`. El preset falla cerrado por defecto; el driver acotado en memoria se habilita explicitamente solo para desarrollo o tests.

```ts
import { PrivateChannel } from '@nuxt-laravelize/broadcasting/runtime'

class OrderUpdated {
  constructor(readonly orderId: string, readonly internalNote: string) {}
  broadcastOn() { return new PrivateChannel(`orders.${this.orderId}`) }
  broadcastAs() { return 'order.updated' }
  broadcastWith() { return { orderId: this.orderId } }
}

useBroadcastChannels(event).channel('orders.{orderId}', (user, { orderId }) => userCanView(user, orderId))
```

`@nuxt-laravelize/broadcasting-pusher` es un **adapter de servidor** opt-in. Inyecta `PusherBroadcaster` mediante `broadcasterToken` y guarda las credenciales en runtime config privado. No incluye ni instala cliente WebSocket para navegador ni Laravel Echo; las suscripciones cliente se eligen y configuran por separado.

## AI SDK

`@nuxt-laravelize/ai-sdk` es un modulo de servidor opt-in construido sobre AI SDK 7. Proporciona conexiones de modelos nombradas, `useAi(event)`, agentes reutilizables tipados, streaming de texto, tools, structured output, comprobaciones explicitas de capacidades y `AiFake`. No forma parte del preset y requiere Node.js 22 o superior.

```bash
pnpm add @nuxt-laravelize/ai-sdk ai zod @ai-sdk/anthropic
```

Registra los providers explicitamente en `server/providers`; el modulo nunca importa paquetes de providers ni lee sus credenciales:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { AiConnectionRegistry, aiConnectionsToken } from '@nuxt-laravelize/ai-sdk/runtime'

export default class AiConnectionsServiceProvider implements ServiceProvider {
  register(container: Container) {
    container.singleton(aiConnectionsToken, () => {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      return new AiConnectionRegistry().register('anthropic', {
        defaultModel: 'claude-sonnet-4-6',
        model: model => anthropic(model),
      })
    })
  }
}
```

Genera con `await useAi(event).generate({ prompt })`, o devuelve `useAi(event).stream({ prompt }).toTextStreamResponse()` desde Nitro. `defineAgent<Input, Result>()` agrupa instrucciones, tools, schema de salida, seleccion de modelo y construccion del prompt sin asumir persistencia. Cloudflare Workers AI se conecta mediante su provider compatible con AI SDK. Flue y Cloudflare Agents son runtimes de agentes, no providers de modelos, y quedan fuera de esta API.

Las opciones especificas del provider pasan sin cambios. Las capacidades se consideran habilitadas salvo que la conexion las desactive. El paquete no registra, audita, cachea ni persiste prompts o respuestas automaticamente porque pueden contener credenciales, datos personales o informacion regulada.

## Agent SDK

`@nuxt-laravelize/agent-sdk` es una API comun opt-in separada para runtimes de agentes con estado. Registra runtimes nombrados en el contenedor existente y expone `useAgentRuntime(event)`, definiciones tipadas con `defineAgent()`, `invoke` sincrono, receipts de `dispatch` asincrono y streams `observe` iterables. Resultados, receipts, eventos, offsets y clientes conservan escapes `native`. Las capacidades distinguen streams de eventos, conversaciones y estado JSON, sin fingir que son el mismo modelo.

`@nuxt-laravelize/agents-cloudflare` usa RPC callable de Cloudflare Agents 0.17.x y conserva clase e identidad Durable Object. `@nuxt-laravelize/agents-flue` separa conversaciones de agentes y runs de workflows con paquetes `1.0.0-beta.9` fijados; sus offsets siguen opacos. Ninguno de los tres paquetes forma parte del preset. Guarda credenciales en runtime config privado y autoriza identidades antes de invocar.

## Auditoria

`@nuxt-laravelize/audit` esta incluido en el preset y expone `useAudit(event)`. El registro es explicito. El recorder genera ID y fecha y enriquece actor, tenant, ejecucion, correlacion, causacion, source y trace desde el contexto confiable; el caller no puede reemplazarlos.

Actions y referencias usan identificadores seguros y acotados. Changes y metadata solo aceptan JSON plano acotado. Se rechazan funciones, symbols, ciclos, prototipos personalizados y limites excesivos. Las claves comunes de credenciales y las configuradas se convierten en `[REDACTED]`.

El preset usa memoria acotada y sin eviction en desarrollo, y persistencia deshabilitada en produccion; ambos avisan y el modo deshabilitado falla cerrado. Configura `laravelizeAudit.driver: 'memory'` explicitamente solo si la volatilidad es aceptable, o reemplaza `auditStoreToken` por almacenamiento durable. `requireTenantId: true` exige tenant confiable. `@nuxt-laravelize/audit-drizzle` es append-only por interfaz; al actualizar aplica `0002_add_audit_locale.sql` o `0003_add_audit_locale_sqlite.sql` para conservar el locale confiable del execution context como columna de primera clase. La inmutabilidad real requiere credenciales de minimo privilegio y controles de retencion. `occurredAt` es tiempo de aplicacion, no orden autoritativo de ingestion.

Audit no es logging ni serializacion de domain events. No se pasan bodies request/response ni modelos arbitrarios. La auditoria automatica policy/HTTP queda para un futuro bridge neutral `audit-http`.

## Reliability y webhooks

`@nuxt-laravelize/reliability` proporciona envelopes JSON-safe versionados, procesamiento outbox con leases y deduplicacion inbox. El preset incluye `@nuxt-laravelize/reliability-queue` para registrar handlers fiables y `ReliableMessageJob`, pero no liga stores volatiles en produccion. Cada aplicacion debe ligar stores Inbox y Outbox durables y compartidos; `reliability-drizzle` es opcional. Webhooks sigue siendo opt-in. La entrega es **at least once**: reintentos, expiracion del lease, crashes y ambiguedad del acknowledgement (el efecto se confirmo pero se perdio su confirmacion) pueden repetir mensajes, asi que cada handler debe ser idempotente.

La gestion dead-letter es opt-in mediante `@nuxt-laravelize/dead-letter`; el preset no instala adaptadores administrativos. La aplicacion debe autorizar listar/ver/payload/resumen-de-error/reintentar/descartar y exigir un permiso reforzado para inbox. Payload, resumenes de error y pista de tenant son opt-in y nunca autorizan. Las capacidades omitidas del adapter se deniegan. Reliability admite reintentos programados y descarte; BullMQ solo reintento inmediato. Reintentar inbox puede repetir efectos. Los recibos son metadatos acotados de idempotencia/auditoria, no historial completo. La evidencia activa se conserva por defecto. El fencing BullMQ es optimista; su adapter lista snapshots acotados de hasta 1000 jobs fallidos retenidos y rechaza fuentes mayores, que requieren una cola o retencion mas estrecha. No hay acciones masivas.

Instala `@nuxt-laravelize/dead-letter-operations` por separado para el dashboard opcional. Esta desactivado por defecto y ausente del preset. Al activarlo debes definir al menos un `allowedOrigins` canonico exacto, paths literales no solapados, adapters desde un provider de la aplicacion y las abilities dead-letter centrales. La API fija autoriza cada endpoint, expone payload solo en su endpoint dedicado, nunca expone pistas de tenant, protege mutaciones JSON con CSRF y revision, y devuelve 503 sin adapters. Consulta el README del paquete.

```bash
pnpm add @nuxt-laravelize/reliability @nuxt-laravelize/webhooks
# Adapter Drizzle durable opcional:
pnpm add @nuxt-laravelize/reliability-drizzle drizzle-orm
```

El snapshot del execution context del envelope solo es procedencia de correlacion. **NO DEBE** autorizar tenant, actor, rol ni recurso. Reautentica y reautoriza contra estado actual y confiable dentro del consumer.

```ts
import { createEnvelope } from '@nuxt-laravelize/reliability'
import { DrizzlePostgresReliabilityStore } from '@nuxt-laravelize/reliability-drizzle/postgres'

const store = new DrizzlePostgresReliabilityStore(db)
const envelope = createEnvelope({
  type: 'invoice.paid.v1',
  payload: { invoiceId: 'inv_1' },
})

await db.transaction(async (tx) => {
  await markInvoicePaid(tx, 'inv_1')
  await store.appendWith(tx, envelope, {
    availableAt: new Date(Date.now() + 60_000).toISOString(),
  })
})
```

`availableAt` es el primer instante elegible para claim y usa `occurredAt` por defecto; agendar nunca cambia cuando ocurrio el evento. Ambos valores requieren timestamps ISO canonicos. Repetir un append con el mismo ID, envelope normalizado y disponibilidad es idempotente. Reutilizar un ID con contenido o disponibilidad diferente lanza `OutboxMessageConflictError` en vez de descartar silenciosamente un mensaje.

La escritura de negocio y `appendWith(tx, envelope, options)` **deben usar la misma transaccion y conexion de base de datos**. Agregar antes o despues reintroduce el dual-write gap y puede perder un evento o publicar estado revertido. Aplica la migracion base seguida por la migracion de append availability del dialecto. El schedule inmutable permanece estable mientras la disponibilidad mutable avanza durante reintentos. El store en memoria de `/testing` es acotado, volatil y solo sirve para tests/desarrollo; produccion requiere store durable compartido, IDs de owner estables, leases/reintentos acotados, heartbeat/renovacion del lease para trabajo que pueda superarlo, monitorizacion de mensajes dead y operaciones de retencion/reconciliacion. Drizzle sigue siendo opcional.

Aplica la migracion de tiempo terminal del dialecto (`0004` PostgreSQL o `0005` SQLite/Turso) y ejecuta pasadas acotadas con `store.prune({ namespace: 'outbox', completedBefore, states: ['delivered'], types: ['laravelize.workflow.wake.v1'], limit: 500 })`. La retencion usa `terminal_at` autoritativo, nunca el tiempo del envelope ni de elegibilidad; filas terminales legacy permanecen null hasta un backfill explicito del operador. Las filas dead requieren seleccion explicita y normalmente deben conservarse como evidencia. El pruning acorta la deduplicacion durable por ID, por lo que la retencion debe superar clock skew y la ventana maxima de replay.

Ejecuta la entrega outbox como proceso supervisado. Su modulo de configuracion exporta un `OutboxWorker`; SIGINT/SIGTERM detienen la entrada, drenan trabajo en curso y cierran recursos. Usa `--once` para una pasada operativa, tambien desde un scheduler; nunca ejecutes `run()` desde el scheduler.

```bash
pnpm exec outbox-work --config ./outbox-worker.config.js
pnpm exec outbox-work --once --config ./outbox-worker.config.js
pnpm exec webhook-work --config ./webhook-worker.config.js
```

`@nuxt-laravelize/webhooks` ofrece `OutgoingWebhookProcessor`, verificacion HMAC del body raw y `WebhookInboxReceiver`. Su transport es **solo para Node** porque usa DNS, crypto, buffers y fetch de servidor de Node. Resuelve secrets de firma al entregar; el outbox solo guarda `secretId`. Los constructores de produccion exigen stores outbox/inbox durables.

```ts
import { OutgoingWebhookProcessor, createWebhookEnvelope } from '@nuxt-laravelize/webhooks'

await store.append(createWebhookEnvelope({
  url: 'https://hooks.example.com/orders',
  secretId: 'customer-42-current',
  body: { orderId: 'order_1' },
}))

const webhooks = new OutgoingWebhookProcessor(store, {
  owner: 'webhooks-worker-1',
  resolveSecret: secrets.resolve,
  production: true,
})
await webhooks.runOnce()
```

Las URLs salientes exigen HTTPS por puerto 443, rechazan credenciales y direcciones privadas/reservadas, desactivan redirects y limitan timeouts. Los transports personalizados deben conservar esas restricciones de redirect, timeout, DNS/IP y TLS. El riesgo SSRF se reduce, no se elimina: la validacion DNS y la conexion posterior no estan fijadas atomicamente, dejando un residual DNS-rebinding/TOCTOU. Para destinos no confiables, exige un proxy egress con allowlist o pinning de direccion a nivel de conexion, ademas de politica de red saliente. Verifica firmas entrantes contra los bytes raw exactos, limita la tolerancia temporal, autentica/autoriza ownership del endpoint por separado y conserva la deduplicacion inbox al menos durante la ventana de reintentos del sender.

## Queue

`@nuxt-laravelize/queue` define jobs portables e incluye una cola en memoria. El autoimport Nitro `useQueue(event)` resuelve el driver activo.

```bash
pnpm add @nuxt-laravelize/queue
```

```ts
import { createToken, type Resolver } from '@nuxt-laravelize/core/runtime'
import { Job } from '@nuxt-laravelize/queue/runtime'

interface SendReportPayload extends Record<string, unknown> { reportId: string }
interface ReportService { send(reportId: string): Promise<void> }
const reportServiceToken = createToken<ReportService>('services.reports')

export class SendReport extends Job<SendReportPayload> {
  static readonly tries = 3
  static readonly queue = 'reports'
  static readonly backoff = [1_000, 5_000]

  readonly payload: SendReportPayload

  constructor(payload: Record<string, unknown>) {
    super()
    if (typeof payload.reportId !== 'string') throw new Error('reportId is required')
    this.payload = { reportId: payload.reportId }
  }
  async handle(resolver: Resolver) {
    await resolver.make(reportServiceToken).send(this.payload.reportId)
  }
}
```

Registra los jobs serializados antes de que un worker los rehidrate y usa el contrato `Queue`.

```ts
registry.register(SendReport.name, SendReport)
await queue.push(new SendReport({ reportId: 'report_1' }))
await queue.later(60_000, new SendReport({ reportId: 'report_2' }))
await queue.sync(new SendReport({ reportId: 'report_3' }))
```

| API | Proposito |
|---|---|
| `Job.serialize()` | Produce el payload versionado. Implementa `handle()` y opcionalmente `failed()`. |
| `InMemoryJobRegistry.register()` | Asocia el nombre serializado con su constructor. |
| `InMemoryJobRegistry.rehydrate()` | Recrea un job o lanza `JobNotRegisteredError`. |
| `JobRunner.run()` / `failed()` | Ejecuta un job serializado y su hook de fallo en un scope. |
| `Queue.push()` / `later()` / `sync()` | Encola, retrasa o ejecuta inmediatamente un job. |
| `Queue.size()` / `clear()` | Consulta o limpia jobs, opcionalmente por nombre de cola. |
| `Queue.onFailed()` | Registra un observador de fallos terminales. |
| `PushOptions` | Sobrescribe `tries`, `delay`, `queue` y `backoff`. |
| `QueueFake` | Guarda pushes; usa `assertPushed()`, `size()` y `clear()`. |

```ts
import { QueueFake } from '@nuxt-laravelize/queue/testing'

const queue = new QueueFake()
await queue.push(new SendReport({ reportId: 'report_1' }))
queue.assertPushed(SendReport)
```

## Adapter BullMQ

`@nuxt-laravelize/queue-bullmq` es un driver persistente opcional y solo para Node; ni el preset ni reliability-queue lo instalan. Instalalo con la cola portable y proporciona un cliente `ioredis`.

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq bullmq ioredis
```

```ts
import Redis from 'ioredis'
import { BullMQConnection, BullMQQueue, BullMQWorker } from '@nuxt-laravelize/queue-bullmq/runtime'
import { jobSerializerToken } from '@nuxt-laravelize/queue/runtime'

const connection = new BullMQConnection(new Redis(process.env.REDIS_URL!))
const queue = new BullMQQueue(connection, runner, container.make(jobSerializerToken))
const worker = new BullMQWorker(connection, registry, runner)

await queue.push(new SendReport({ reportId: 'report_1' }))
await worker.work('reports', 4)
// Durante el apagado ordenado:
await worker.stop()
await queue.close()
```

`FailureReporter.listen()` observa fallos terminales y `report()` notifica a los observadores. El CLI del worker carga un export default `{ worker }` desde `laravelize.queue.config.mjs` (o `--config=path`):

```js
// laravelize.queue.config.mjs
import { worker } from './server/queue.js'

export default { worker }
```

```bash
pnpm exec laravelize-queue-work --queue=reports --concurrency=4
```

## Listeners encolados

`@nuxt-laravelize/events-queue` conecta listeners marcados con `shouldQueue: true` a una cola sin acoplar los paquetes base.

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue @nuxt-laravelize/events-queue
```

```ts
class WelcomeUserListener implements Listener<UserRegistered> {
  readonly shouldQueue = true as const
  async handle(event: UserRegistered) { /* send welcome message */ }
}

events.listen(UserRegistered, welcomeUserListenerToken)
await events.dispatch(new UserRegistered('user_1'))
```

| API | Proposito |
|---|---|
| `EventRegistry.register()` | Registra constructores serializables por nombre. El adapter lo llama automaticamente. |
| `EventRegistry.make(name, args)` | Recrea un evento registrado desde argumentos de constructor. |
| `QueueListenerAdapter.enqueue()` | Encola eventos que implementan `toPayload()` como `ListenerJob`; devuelve `false` para los demas. |
| `ListenerJob` | Resuelve y ejecuta el listener original dentro del worker. |
| `eventRegistryToken` | Resuelve el registro compartido. |

## Mail

`@nuxt-laravelize/mail` ofrece mailables portables y transports de log y compatibles con Resend. Nodemailer esta aislado en `/node`. `useMailer(event)` se autoimporta en Nitro.

```bash
pnpm add @nuxt-laravelize/mail
```

```ts
import { Mailable } from '@nuxt-laravelize/mail/runtime'

class WelcomeMail extends Mailable {
  constructor(private readonly email: string) { super() }
  to() { return this.email }
  from() { return 'team@example.com' }
  subject() { return 'Welcome' }
  render() { return '<h1>Welcome!</h1>' }
  text() { return 'Welcome!' }
  attachments() { return [{ filename: 'guide.txt', content: 'Getting started' }] }
}

await mailer.send(new WelcomeMail('ada@example.com'))
```

| API | Proposito |
|---|---|
| `Mailable.toMessage()` | Construye un `MailMessage` normalizado desde los metodos de la clase. |
| `LogMailer.send()` | Registra mensajes sin entrega externa. |
| `ResendMailer(client, defaultFrom)` | Envia mediante un cliente que implemente `ResendClient`. |
| `NodemailerMailer(transport, defaultFrom)` | Envia con un transport compatible con Nodemailer desde `/node`. |
| `mailerToken` | Resuelve el `Mailer` configurado. |
| `MailFake` | Guarda correos; usa `assertSent()` y `reset()`. |

## Notifications

`@nuxt-laravelize/notifications` enruta notificaciones por canales nombrados. El paquete base solo registra log y no instala mail ni queue. `useNotifications(event)` se autoimporta en Nitro.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'

class InvoicePaid extends Notification {
  via() { return ['log'] as const }
  toLog() { return 'Invoice inv_1 was paid' }
}

const user = {
  routeNotificationFor: (channel: string) => channel === 'mail' ? 'ada@example.com' : 'user_1',
}
await notifications.send(user, new InvoicePaid())
```

| API | Proposito |
|---|---|
| `DefaultNotificationManager.register()` | Registra un `NotificationChannel` personalizado. |
| `send()` / `sendNow()` | Envia a uno o varios notifiables mediante `via()`. |
| `route(channel, address)` | Inicia un `PendingNotification`; encadena `.route()` y termina con `.notify()`. |
| `LogChannel.send()` | Registra `notification.toLog()` o `toArray()`. |
| `notificationManagerToken` | Resuelve el manager configurado. |
| `NotificationFake` | Guarda notificaciones y ofrece assertions con predicado, conteo, negativas y reset. |
| `NotificationDelivered` | Observa una invocacion de canal completada. |
| `NotificationDeliveryFailed` | Observa un intento de canal rechazado o abortado. |

```ts
await notifications
  .route('log', 'user_1')
  .notify(new InvoicePaid())
```

`NotificationFake.assertSentTo()` acepta un predicado opcional con la notificacion tipada y los canales seleccionados por `via()`. Los tests tambien pueden usar `assertSentToTimes()`, `assertSentTimes()`, `assertNotSentTo()`, `assertCount()`, `assertNothingSent()` y `reset()`. El fake registra la intencion sin invocar canales ni emitir eventos de lifecycle.

Cuando `@nuxt-laravelize/events` tambien esta registrado, el manager despacha eventos de lifecycle acotados por privacidad alrededor de intentos de entrega. Listeners confiables pueden acceder explicitamente a `notifiable`, `notification` y al `error` de fallo, que no son enumerables; la serializacion generica solo expone canal, tipo de evento, el flag `aborted` de los fallos y la metadata copiada `locale`, `tenantId`, `idempotencyKey` y `occurredAt`. Los eventos no implementan contrato durable ni payload encolable, y los fallos de listeners se registran con metadata segura y se aislan del resultado original del canal. Entre observers sigue aplicando el orden normal del dispatcher: un error o retorno `false` detiene los listeners posteriores de ese evento.

`NotificationDelivered` significa que el metodo del canal termino: se acepto una escritura database o append al outbox webhook, o retorno una llamada al provider mail/broadcast. No demuestra recepcion final ni entrega HTTP del webhook. `NotificationDeliveryFailed` describe un intento de entrega, incluida una señal ya abortada antes de invocar el canal, no el agotamiento de retries. Destinatarios ausentes, canales deshabilitados, payloads queued invalidos y tenant mismatches rechazados antes del manager no emiten estos eventos. Crashes y ejecucion at-least-once pueden omitir o duplicar observaciones, por lo que listeners con efectos deben deduplicar durablemente por tenant, idempotency key, canal y tipo de evento. No uses estos eventos best-effort como unico ledger de auditoria; `NotificationFake` no los emite.

Instala `@nuxt-laravelize/notifications-mail` para registrar el canal `mail` opt-in. La notificacion implementa `toMail()`, pero el destino procede exclusivamente de `routeNotificationFor('mail')`; el contenido no puede reemplazarlo. El canal acepta una direccion simple por entrada, rechaza inyeccion de headers/listas y excesos de recursos, y propaga locale, abort signal e idempotency key al mailer configurado.

Instala `@nuxt-laravelize/notifications-database` para registrar el canal `database` opt-in. Las notificaciones declaran `databaseType()`, `databaseVersion()` y JSON acotado mediante `toDatabase()`; los destinatarios exponen una route opaca `{ type, id, tenantId? }`. El tenant debe coincidir con execution context confiable. `useDatabaseNotifications(event)` ofrece listado por cursor y operaciones tenant-fenced `markRead()` / `markUnread()`. Desarrollo puede usar memoria acotada, mientras produccion exige un store durable como `@nuxt-laravelize/notifications-database-drizzle`. Los retries idempotentes suprimen contenido identico y rechazan reutilizaciones conflictivas.

Instala `@nuxt-laravelize/notifications-broadcast` para registrar el canal `broadcast` opt-in. Las notificaciones declaran `broadcastType()`, `broadcastVersion()` y JSON acotado mediante `toBroadcast()`; los destinatarios exponen una route opaca `{ type, id, tenantId? }`. El paquete deriva un canal privado determinista desde el tenant confiable y el destinatario, y emite el evento fijo `notification.created` con `{ id, type, version, data, locale? }`. El contenido no puede reemplazar el destino ni el evento. Usa `broadcastNotificationChannelName()` para autorizacion y suscripcion en browser, y configura por separado un adapter de servidor como `@nuxt-laravelize/broadcasting-pusher`. La entrega sigue siendo at-least-once en el limite del proveedor; los clientes deben deduplicar por `id`. Este paquete no aloja WebSockets ni instala un cliente browser.

Instala `@nuxt-laravelize/notifications-webhook` para registrar el canal `webhook` opt-in y exclusivo de Node. Las notificaciones implementan `webhookType()`, `webhookVersion()` y JSON acotado mediante `toWebhook()`, mientras el destinatario expone solo `{ endpointId, tenantId? }`. Liga `webhookNotificationOutboxStoreToken` a un outbox durable compartido y `webhookNotificationEndpointResolverToken` a un resolver confiable que consulta tenant e ID juntos. El contenido no puede seleccionar URLs, headers ni claves; el resolver devuelve una URL HTTPS sin query y un `secretId` opaco, y debe demostrar ownership del tenant confiable. Los replays de queue conservan ID y fecha entre inbox y outbox. Ejecuta `OutgoingWebhookProcessor` por separado y resuelve claves por `context.tenantId` y `secretId`; exige deduplicacion en el receptor, revoca claves al desactivar endpoints ya publicados y usa egress fijado o allowlisted porque validar DNS no elimina por completo el rebinding.

`@nuxt-laravelize/notifications-queue` expone `QueuedNotificationDispatcher`, registries explicitos de codecs y resolvers con type/version, y `QueuedNotificationJob` versionado. No serializa routes, direcciones ni objetos `Notifiable`: el worker recarga destinatario, preferencias, locale, canales y tenant confiable antes de entregar un solo canal. Destinatarios ausentes o canales desactivados se omiten; payloads/versiones invalidos y tenant mismatch son terminales. Una notificacion puede implementar `withDelay(notifiable)` y devolver delays por canal en milisegundos enteros entre 0 y 86.400.000; el plan completo de destinatarios/canales se valida antes de publicar su primer job y los delays se aplican como metadata de queue. Omitir un canal conserva el delay por defecto del backend, mientras un `0` explicito lo reemplaza con disponibilidad inmediata. La entrega directa sigue siendo inmediata. Produccion exige queue e `InboxStore` durables; usa outbox cuando enqueue deba confirmar junto con estado de dominio. Un inbox completado suprime duplicados confirmados, pero el proveedor externo determina si el efecto final es idempotente. Su backoff de queue de un segundo coincide con el retry por defecto del inbox para no agotar intentos mientras un claim fallido aun no esta disponible. Los eventos de lifecycle conservan el delivery ID y fecha originales de queue, pero siguen siendo por intento y no durables.

## Feature flags

`@nuxt-laravelize/pennant` ofrece feature flags lazy por scope, con valores booleanos o ricos. El preset registra un store en memoria; en despliegues distribuidos reemplaza `featureManagerToken` por un manager respaldado por un `FeatureStore` compartido.

```ts
const features = useFeatures(event)
features.define('new-checkout', scope => scope.plan === 'pro' ? 'variant-b' : false)
const accountFeatures = features.for({ plan: 'pro', toFeatureIdentifier: () => 'account:42' })
if (await accountFeatures.active('new-checkout')) return { variant: await accountFeatures.value('new-checkout') }
```

Las definiciones se evaluan solo despues de un miss del store y su resultado se persiste. Usa `activate()`, `deactivate()` y `forget()` para un scope, `purge()` para los datos almacenados del rollout y `flushCache()` en limites explicitos del ciclo de vida. Los scopes objeto deben implementar `toFeatureIdentifier()` para evitar identidades inestables por serializacion.

## Busqueda Scout

`@nuxt-laravelize/scout` ofrece contratos portables para modelos y motores, builder fluido, importacion por lotes y el auto-import de servidor `useScout(event)`. Configura `laravelizeScout.driver` (por defecto: `memory`). Los motores tienen nombre, se crean de forma diferida y se cachean; registra adapters en un provider antes de seleccionarlos. `@nuxt-laravelize/scout-drizzle` ofrece helpers para PostgreSQL, SQLite local y Turso/libSQL mediante `/postgres`, `/sqlite` y `/turso`.

```ts
const scout = useScout(event)
const results = await scout.search('articles', 'cuidados de apoyo')
  .where('status', 'published')
  .whereIn('locale', ['en', 'es'])
  .orderBy('published_at', 'desc')
  .paginate(1, 20)

registerDrizzlePostgresDriver(scout, 'postgres', db, allowlists)
scout.use('postgres')
```

SQLite local y Turso usan la misma API de Scout con registros separados:

```ts
import { registerDrizzleSQLiteDriver } from '@nuxt-laravelize/scout-drizzle/sqlite'
import { registerTursoDriver } from '@nuxt-laravelize/scout-drizzle/turso'

registerDrizzleSQLiteDriver(scout, 'sqlite', sqliteDb, allowlists)
registerTursoDriver(scout, 'turso', tursoClient, allowlists)
scout.use('turso')
```

Los modelos implementan `searchableKey()`, `searchableType()` y `toSearchableDocument()`. Usa `update`, `delete`, `import` y `flush` para mantener el indice. PostgreSQL usa `websearch_to_tsquery` y `tsvector` con GIN; SQLite/libSQL usan FTS5 y JSON1. Todos parametrizan valores, deniegan por defecto campos de filtro/orden y hacen atomica la sincronizacion multi-escritura cuando el cliente soporta transacciones. La paginacion esta limitada a 100 y la importacion a 10.000 documentos por lote. SQLite/libSQL requiere FTS5; aplica `0001_create_scout_documents_sqlite.sql`. Autoriza el acceso antes de usar Scout y no indexes secretos ni datos personales innecesarios.

## Validation

`@nuxt-laravelize/validation` valida cualquier implementacion de [Standard Schema](https://standardschema.dev/), incluyendo Zod, Valibot y ArkType, sin acoplar servicios de aplicacion a HTTP.

```bash
pnpm add @nuxt-laravelize/validation
```

Usa `validate()` cuando input invalido sea excepcional, o `safeValidate()` cuando el caller controle el flujo.

```ts
const validator = useValidator(event)
const user = await validator.validate(CreateUserSchema, input)

const result = await validator.safeValidate(CreateUserSchema, input, { prefix: 'body' })
if (!result.success) {
  return {
    message: result.errors.first('body.email'),
    errors: result.errors.all(),
  }
}
```

| API | Proposito |
|---|---|
| `validate(schema, input, options?)` | Devuelve el output tipado y transformado o lanza `ValidationError`. |
| `safeValidate()` | Devuelve un resultado discriminado success/error sin lanzar. |
| `ErrorBag.first()` / `get()` / `has()` | Lee mensajes de un campo en notacion dot. |
| `ErrorBag.all()` / `any()` | Devuelve un snapshot defensivo o comprueba si hay issues. |
| `validatorToken` | Reemplaza o resuelve el validator compartido. |

Paths de objetos y arrays anidados se convierten en notacion dot estable como `body.users.0.email`; multiples issues de un campo conservan el orden del schema. `FormRequest` usa internamente este mismo validator, por lo que validacion standalone y respuestas HTTP `422` comparten semantica de paths y mensajes.

Construye mensajes Standard Schema localizados al crear el schema; no traduzcas genericamente codes ni strings arbitrarios emitidos por vendors despues de validar:

```ts
const i18n = await useServerLocalization(event)
const schema = z.object({ email: z.email({ error: i18n.t('validation.email') }) })
const result = await useValidator(event).safeValidate(schema, input)
```

## HTTP

`@nuxt-laravelize/http` proporciona el cliente Nuxt autoimportado `useHttp`, requests, middleware, resources, paginacion, gates y policies para Nitro.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/http'],
  laravelizeHttp: {
    baseURL: 'https://api.example.com',
    signingKey: '',
    signingOrigin: 'https://app.example.com',
  },
})
```

Genera al menos 32 bytes aleatorios con `openssl rand -base64 32` y define la clave privada mediante `NUXT_LARAVELIZE_HTTP_SIGNING_KEY`. Nunca la coloques bajo `runtimeConfig.public` ni incluyas una clave de produccion en el repositorio. `signingOrigin` proporciona un origen canonico permitido en vez de confiar en `Host` y headers de protocolo reenviados por el request.

```ts
const { data, error, status, refresh } = await useHttp<User>('/users/1')
const { data: created } = await useHttp<User>('/users', {
  method: 'POST',
  body: { name: 'Ada' },
})
```

### Form requests y handlers

`FormRequest.body()`, `query()` y `params()` aceptan cualquier implementacion Standard Schema. `authorize(event)` devuelve un boolean. `defineLaravelizedHandler()` resuelve un controller token, ejecuta middleware global y de ruta, valida el input y serializa resources.

El ejemplo usa Zod como implementacion Standard Schema: `pnpm add zod`.

```ts
import { createToken } from '@nuxt-laravelize/core/runtime'
import { FormRequest, LengthAwarePaginator, Resource, defineLaravelizedHandler, type ValidatedInput } from '@nuxt-laravelize/http/runtime'
import { z } from 'zod'

class CreateUserRequest extends FormRequest {
  body() { return z.object({ name: z.string().min(1) }) }
  authorize() { return true }
}

class UserResource extends Resource<{ id: string, name: string }> {
  toArray() { return { id: this.resource.id, name: this.resource.name } }
}

class UserController {
  async store(input: ValidatedInput<CreateUserRequest>) {
    return new UserResource({ id: 'user_1', name: input.body.name })
  }
}

const userControllerToken = createToken<UserController>('controllers.users')

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'store',
  request: CreateUserRequest,
})
```

Implementa `Middleware.handle(event, next)` y registra su token en el array `middleware` del handler. `globalMiddlewareToken` contiene tokens aplicados a todos los handlers Laravelized.

### URLs firmadas y temporales

`HmacUrlSigner` protege origen, path y query con HMAC-SHA256. El servicio configurado esta disponible mediante `useUrlSigner(event)` y `urlSignerToken`.

```ts
// server/api/invitations/[id]/link.get.ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const target = new URL(`/api/invitations/${getRouterParam(event, 'id')}`, signingOrigin)
  const url = await useUrlSigner(event).sign(target, {
    expiresAt: Date.now() + 30 * 60 * 1000,
  })
  return { url }
})
```

Protege un handler Laravelized con el autoimport `validateSignatureToken`:

```ts
export default defineLaravelizedHandler({
  controller: invitationControllerToken,
  method: 'accept',
  middleware: [validateSignatureToken],
})
```

Usa el mismo middleware en un handler Nitro normal:

```ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const middleware = new ValidateSignature(useUrlSigner(event), { origin: signingOrigin })
  return await middleware.handle(event, async () => ({ accepted: true }))
})
```

| API | Proposito |
|---|---|
| `HmacUrlSigner(secret)` | Crea un signer HMAC-SHA256 portable con Web Crypto. Claves menores de 32 bytes lanzan `MissingUrlSigningKeyError`. |
| `sign(url, options?)` | Reemplaza una firma; sus opciones soportan expiracion, modo relativo y binding al metodo HTTP. |
| `hasValidSignature(url, options?)` | Rechaza firmas ausentes, mal formadas, manipuladas o expiradas y puede exigir expiracion. |
| `ValidateSignature` | Middleware que rechaza requests invalidos con HTTP 403; soporta origen canonico, expiracion obligatoria y binding al metodo. |
| `urlSignerToken` / `useUrlSigner(event)` | Resuelve el signer configurado desde el contenedor del request. |
| `validateSignatureToken` | Middleware por defecto para firmas absolutas; resolverlo exige `signingOrigin`. |

La firma absoluta es el modo por defecto e incluye el origen. Para links independientes del proxy, usa `{ absolute: false }` tanto al firmar como al validar; el modo relativo protege solo path y query y no debe cruzar limites de tenants basados en host. El orden del query se normaliza, los fragments se ignoran porque el navegador no los envia al servidor y una URL temporal deja de ser valida en su segundo exacto de expiracion. Rotar la clave invalida links existentes.

Las URLs firmadas son credenciales bearer y pueden reutilizarse. Usa expiraciones cortas para verificacion, invitaciones y acciones con cambios de estado; liga esas firmas al metodo HTTP con `sign(..., { method: 'POST' })` y `new ValidateSignature(signer, { bindMethod: true, requireExpiration: true })`. Exige HTTPS en un proxy confiable y usa storage de la aplicacion cuando un link deba ser de un solo uso.

### Idempotencia HTTP

`@nuxt-laravelize/idempotency` proporciona un middleware H3 opt-in y un contrato de store atomico para requests con mutaciones. El fingerprint incluye metodo, ruta y query canonicos, principal, content type y bytes exactos del request. Reutilizar una clave con otro fingerprint devuelve `409`; los leases activos se renuevan y un owner obsoleto no puede completar trabajo reclamado. Las respuestas completadas se reproducen con una allowlist de headers seguros. Los fallos se conservan por defecto porque reintentar tras un error ambiguo puede duplicar efectos ya confirmados.

```ts
import { createIdempotencyMiddleware } from '@nuxt-laravelize/idempotency/runtime'

const idempotency = createIdempotencyMiddleware({
  principal: event => event.context.user.id,
})
```

El driver memory es volatil y debe habilitarse explicitamente. Despliegues cluster o serverless deben ligar un `IdempotencyStore` durable y atomico. Streaming y escrituras directas se rechazan porque no pueden reproducirse fielmente.

Para almacenamiento durable, `@nuxt-laravelize/idempotency-drizzle` proporciona adapters PostgreSQL, SQLite y Turso, schemas y migraciones explicitas. PostgreSQL acepta el boundary `execute(SQL)` de Drizzle; SQLite/Turso aceptan `all(SQL)` para que las sentencias condicionales `UPSERT/UPDATE ... RETURNING` devuelvan la fila protegida. Aplica exactamente una migracion compatible antes de ligar el token del store.

```ts
import { DrizzlePostgresIdempotencyStore } from '@nuxt-laravelize/idempotency-drizzle/postgres'

container.singleton(idempotencyStoreToken, () => new DrizzlePostgresIdempotencyStore(db))
```

Los nombres de query `signature` y `expires` estan reservados. La firma reemplaza `signature`; pasa `expiresAt` explicitamente para crear o reemplazar `expires`.

### Resources y paginacion

| API | Proposito |
|---|---|
| `Resource.toArray(event)` | Transforma un valor. Usa `when()` y `mergeWhen()` para campos condicionales. |
| `Resource.collection(items)` | Crea una coleccion normal o paginada. |
| `withoutWrapping()` / `restoreWrapping()` | Desactiva o restaura globalmente el wrapper `{ data: ... }`. |
| `ResourceCollection.toArray()` | Serializa cada resource. |
| `LengthAwarePaginator` | Agrega totales, metadata y links; `fromRequest()` lee query params. |
| `SimplePaginator` | Ofrece links anterior/siguiente sin total. |
| `CursorPaginator` | Ofrece navegacion por cursor codificado. |
| `parsePageParams()` / `parseCursorParams()` | Lee y limita parametros de paginacion. |
| `encodeCursor()` / `decodeCursor()` | Convierte cursores a y desde strings seguros para URLs. |
| `buildPageUrl()` / `buildCursorUrl()` / `getRequestPath()` | Construye links preservando path y query. |
| `isPaginator()` y guards de resources | Estrechan tipos en runtime. |

```ts
const paginator = LengthAwarePaginator.fromRequest(event, users, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})
return UserResource.collection(paginator)
```

### Gates y policies

Estas APIs HTTP se conservan por compatibilidad concreta. El codigo nuevo debe usar `@nuxt-laravelize/authorization`: en lugar del lookup legacy por nombre de constructor y el user suministrado por el caller, usa keys de recurso explicitas y recarga el principal scoped. El `authorize()` legacy mantiene su mapping 403 especifico de H3.

| API | Proposito |
|---|---|
| `define(rule, callback)` | Registra una regla de autorizacion. |
| `allows()` / `denies()` | Comprueba una regla. |
| `authorize()` | Lanza un error H3 403 cuando se deniega. |
| `any()` / `none()` | Comprueba varias reglas. |
| `DefaultPolicyRegistry.register(modelName, policy)` | Registra una policy para el nombre del constructor del modelo. |
| `Policy.before(user)` | Permite o deniega opcionalmente todas las acciones antes de su metodo. |
| `discoverPoliciesByConvention(rootDir)` | Encuentra archivos de policies para adapters. |

```ts
import { InMemoryGate } from '@nuxt-laravelize/http/runtime'

const gate = new InMemoryGate()
gate.define('update-invoice', (user, invoice) => user.id === invoice.ownerId)
await gate.authorize('update-invoice', currentUser, invoice)
```

## Database

`@nuxt-laravelize/database` proporciona factories, seeders y contratos explicitos de transaccion/unit of work independientes del ORM. Tu aplicacion proporciona callbacks o adapters de persistencia; las relaciones se componen explicitamente sin metadata ORM.

```bash
pnpm add @nuxt-laravelize/database
```

```ts
import { Factory, builtInFaker, recycle } from '@nuxt-laravelize/database/runtime'

interface UserDraft { name: string, email: string, active: boolean, teamId?: string }

class UserFactory extends Factory<UserDraft, number> {
  protected definition(): UserDraft {
    return {
      name: this.faker.string.word(),
      email: `${this.faker.string.sample()}@example.com`,
      active: true,
    }
  }
}

const teams = recycle([{ id: 'team-a' }, { id: 'team-b' }])
const ids = await new UserFactory(builtInFaker({ seed: 42, now: Date.UTC(2025, 0, 1) }))
  .count(3)
  .state({ active: false })
  .sequence([(_draft, index) => ({ name: `User ${index}` })])
  .for(teams, (_user, team) => ({ teamId: team.id }))
  .beforeCreate(validateUser)
  .afterCreate(id => auditCreatedUser(id))
  .create({ persist: draft => userRepository.insert(draft) })

// La persistencia por callback existente sigue devolviendo drafts.
const draft = await new (class extends Factory<UserDraft> {
  protected definition(): UserDraft { return { name: 'Ada', email: 'ada@example.com', active: true } }
})().create(async (draft) => {
  await db.insert(users).values(draft)
})
```

| API | Proposito |
|---|---|
| `Factory<TDraft, TPersisted = TDraft>.count()` | Define y tipa la cardinalidad escalar (`1`) o array (`>1`). |
| `state()` | Aplica un valor parcial o mutator indexado a cada item. |
| `sequence()` | Alterna estados indexados especificos por item. |
| `for(factoryOrRecycle, composer)` | Compone un parent/valor reciclado explicito en cada raiz. |
| `has(factory, composer)` | Compone el escalar o array de la factory relacionada en cada raiz. |
| `recycle(values)` | Crea un pool local no vacio y congelado que rota por indice raiz. |
| `make(overrides?)` | Construye valores sin persistir. |
| `create(callback, overrides?)` | Persiste secuencialmente y devuelve drafts por compatibilidad. |
| `create(adapter, overrides?)` | Devuelve secuencialmente records o IDs tipados desde `FactoryPersistenceAdapter`. |
| `beforeCreate()` / `afterCreate()` | Registra hooks ordenados async-capable alrededor de cada persistencia. |
| `builtInFaker(seedOrOptions?)` | Devuelve `FakerShim`; `{ seed, now }` fija random y fechas. |
| `DefaultFactoryRegistry` | Proporciona `register`, `list`, `has` y `resolve`. |
| `DefaultSeederRegistry` | Proporciona las mismas operaciones para factories async de seeders. |
| `Seeder.call(name)` | Ejecuta otro seeder registrado en el mismo registry. |
| `discoverSeedersByConvention(rootDir)` | Encuentra archivos de seeders para adapters. |

La composicion siempre ejecuta definition -> states -> sequence -> `for` -> `has` -> overrides de llamada. Para cada item creado ejecuta draft -> todos los hooks before -> persistencia -> todos los hooks after, de forma secuencial y fail-fast. `make()` es sincrono y deliberadamente no ejecuta hooks lifecycle. Una factory relacionada reutilizada conserva count/state y reinicia su indice de sequence local para cada raiz mientras su stream Faker avanza normalmente; no existe un pool recycle oculto. Una factory de `for()` debe producir exactamente un item, mientras `has()` conserva su forma escalar/array. Los composers deben devolver un objeto raiz completo o parcial.

```ts
import { DefaultSeederRegistry, Seeder } from '@nuxt-laravelize/database/runtime'

class UserSeeder extends Seeder {
  async run() { await new UserFactory().create(saveUser) }
}

class DatabaseSeeder extends Seeder {
  async run() { await this.call('users') }
}

const seeders = new DefaultSeederRegistry()
seeders.register('users', () => new UserSeeder())
seeders.register('database', () => new DatabaseSeeder())
await (await seeders.resolve('database')).run()
```

El CLI de seeders carga factories de providers desde `laravelize.seed.config.mjs` (o `--config=path`). Los providers deben registrar `seederRegistryToken` y los seeders solicitados.

```js
// laravelize.seed.config.mjs
import DatabaseServiceProvider from './server/providers/DatabaseServiceProvider.js'

export default {
  providers: [() => new DatabaseServiceProvider()],
}
```

```bash
pnpm exec laravelize-db-seed --class=database
```

Omite `--class` para ejecutar todos los seeders registrados en el orden del registry.

### Transacciones y unit of work

```ts
import { DrizzleTransactionManager } from '@nuxt-laravelize/database-drizzle'

const transactions = new DrizzleTransactionManager(db)
await transactions.transaction(async (unitOfWork) => {
  await orders.save(unitOfWork.session, order)
  await outbox.appendIn(unitOfWork, envelope)
  unitOfWork.afterCommit(() => metrics.increment('orders.created'))
})
```

Los repositorios reciben `unitOfWork.session` explicitamente para compartir la transaccion fisica entre cambios de dominio y outbox. Llama a `unitOfWork.markRollbackOnly(error)` cuando un fallo interno capturado aun debe abortar la transaccion. Los gestores deben lanzar antes del commit nativo y omitir los hooks `afterCommit` cuando la unidad quede marcada; las implementaciones personalizadas deben ofrecer la misma garantia. En los demas casos, los hooks `afterCommit` solo se ejecutan despues de confirmar el commit y su fallo no puede revertirlo. Usa `DrizzleSyncTransactionManager` con drivers SQLite sincronicos: rechaza deliberadamente trabajo que devuelve Promise para impedir que escape de la transaccion nativa.

## Workflows y sagas

`@nuxt-laravelize/workflows` implementa workflows lineales persistidos con definiciones versionadas, leases renovables con fencing, reintentos, intentos reanudables, cancelacion cooperativa en curso y compensacion en orden inverso.

Las versiones son strings opacos y sensibles a mayusculas de 1–64 caracteres ASCII, con extremos alfanumericos e interior `[A-Za-z0-9._-]`; `latest`, `default` y `current` estan reservados sin distinguir mayusculas. La resolucion es exacta, sin fallback, alias latest ni rangos. Nunca cambies handlers o steps bajo una tupla publicada; asigna una version nueva. Los snapshots fuente nuevos requieren `snapshotFormatVersion: 1`. El `status` diagnostico normaliza un campo legacy ausente y rechaza formatos desconocidos sin exigir una definicion desplegada; la ejecucion resuelve exactamente incluso filas terminales o en espera antes de claim o mutacion.

Esta validacion de filas persistidas es incompatible. Antes de actualizar, deten todos los writers de workflows y crea un backup verificado. Audita **cada fila**, no solo los identificadores, con el nuevo validador y las definiciones historicas exactas: identidad relacional/JSON y nombres exactos de definicion/steps; monotonicidad de timestamps; orden de estados/steps; outputs, errores y `retryAt` obligatorios; contadores de retry/compensacion frente al `maxAttempts` desplegado; validez del lease; y limites 128/4096 de errores. Los errores de releases anteriores se acotan en lecturas autoritativas y un formato JSON ausente sigue siendo formato 1, pero ninguna compatibilidad repara otras invariantes. Migra columnas relacionales y snapshot JSON atomicamente con un mapping explicito revisado y repite una validacion dry-run. Filas invalidas de stores custom/no confiables requieren reparacion o archivo especifico de la aplicacion; la migracion automatica in-flight sigue sin soporte.

Las antiguas filas de carrera `completed|failed + cancellationRequested` se rechazan explicitamente y no se normalizan silenciosamente. Revisa cada incidente y realiza/verifica compensacion antes de marcar `cancelled`/`compensated`, o documenta el rechazo de la cancelacion antes de limpiar el flag; nunca lo limpies a ciegas. El README de workflows-drizzle incluye queries PostgreSQL de discovery. Tras reparar, registra simultaneamente definiciones validas antiguas y nuevas y conserva versiones historicas mientras una fila o job/wake pendiente las referencie.

```ts
const fulfill = defineWorkflow({
  name: 'orders.fulfill',
  version: '1',
  steps: [
    defineStep({ name: 'reserve', run: reserve, compensate: release }),
    defineStep({ name: 'charge', run: charge, compensate: refund }),
  ],
})

registry.register(fulfill)
const started = await workflows.start(fulfill, { orderId }, orderId)
await workflows.run(started.id)
```

El store en memoria incluido es volatil y solo sirve para tests o desarrollo local. Los stores de produccion deben implementar fencing atomico de revision y lease, incluyendo `renewLease()`. Configura `leaseDurationMs` y un `heartbeatIntervalMs` menor; los contexts reciben `signal`, la cancelacion se observa al ritmo del heartbeat y resultados stale se descartan al perder el lease. Una signal no revierte efectos externos aceptados, asi que se mantienen las claves de idempotencia estables.

`@nuxt-laravelize/workflows-drizzle` proporciona stores durables para PostgreSQL, SQLite y Turso. La identidad e input canonico del workflow son inmutables; las columnas relacionales de revision, cancelacion y lease prevalecen sobre el snapshot serializado al hidratar. Claims y commits usan sentencias condicionales que devuelven la fila, impidiendo que owners obsoletos o expirados persistan estado. Estos stores tambien implementan la capability opcional `RecoverableWorkflowStore`, que devuelve IDs no terminales en paginas acotadas por cursor `(updatedAt, id)`.

```ts
import { DrizzlePostgresWorkflowStore } from '@nuxt-laravelize/workflows-drizzle/postgres'

const workflows = new WorkflowManager(new DrizzlePostgresWorkflowStore(db), registry)
```

### Wake-ups transaccionales por outbox

`@nuxt-laravelize/workflows-reliability` registra atomicamente cada mutacion del workflow y su wake-up futuro en el outbox de reliability. La atomicidad requiere que el adapter de workflow, el adapter outbox y `TransactionManager` usen la misma transaccion fisica y conexion de base de datos.

```ts
const workflowStore = new TransactionalWorkflowStore({
  transactions,
  readStore: new DrizzlePostgresWorkflowStore(db),
  storeForSession: tx => new DrizzlePostgresWorkflowStore(tx),
  outbox: new DrizzlePostgresReliabilityStore(db),
})

const workflows = new WorkflowManager(workflowStore, registry)
registerWorkflowWakeHandler(reliableHandlers, workflows)
```

El helper de registro mantiene el tipo y la version del wake-up, acepta cualquier registry compatible y propaga la signal de reliability. Cada claim y renovacion registra un fallback al expirar el lease; renovacion y fallback comparten una transaccion y no cambian la revision. Los commits no terminales que liberan lease emiten de inmediato o en su deadline de retry, y la cancelacion emite inmediatamente.

Para unirte a una transaccion de dominio existente, llama `workflows.using(workflowStore.in(unitOfWork)).start(...)`. Asi estado de dominio, workflow y wake-up outbox se escriben juntos sin abrir una transaccion anidada. Nunca envuelvas todo `processResult()` en una transaccion: los handlers pueden ejecutar efectos externos lentos entre limites persistidos. Esos efectos siguen siendo at-least-once y requieren sus claves de idempotencia estables.

Ejecuta periodicamente `new WorkflowWakeReconciler(durableWorkflowStore, durableReliabilityStore, { resolver: registry }).reconcileStore({ pageSize: 100 })` para reparar wake-ups dead o perdidos operacionalmente. El resolver exacto es obligatorio y debe coincidir con el de los workers. El scan acotado recarga estado autoritativo y programa despues de cualquier lease activo o deadline de retry de negocio. Los scans repetidos o concurrentes de un workflow sin cambios comparten un wake determinista por cada generacion de 60 segundos; configura `generationMs` si necesitas otro limite de latencia de recuperacion. Las generaciones posteriores usan IDs nuevos, por lo que recovery nunca revive ni modifica una fila dead anterior. Usa `reconcile(ids)` con un indice propio de la aplicacion. Los fallos por workflow se devuelven sin abortar las paginas posteriores.

Para un proceso de larga duracion, `new WorkflowWakeReconciliationWorker(reconciler, { intervalMs: 60_000, reconcile: { pageSize: 100 }, onResult })` ejecuta inmediatamente y luego espera despues de cada scan completado. Agrupa llamadas locales solapadas y drena un scan activo al abortar. Los fallos por workflow se reportan mediante `onResult`; los errores de discovery o del callback detienen el loop. Los IDs deterministas mantienen seguros varios procesos, aunque un unico lider evita scans redundantes.

Despliegalo con `workflow-wake-reconcile --config ./workflow-wake-reconciliation.config.js`, o agrega `--once` para cron. La configuracion ESM debe exportar por defecto `{ worker, close? }`; `close` se ejecuta solo despues de drenar la reconciliacion activa. La ruta por defecto es `workflow-wake-reconciliation.config.js` en el directorio actual. Las senales disparan un unico apagado ordenado, mientras que errores de configuracion, discovery, callback, drain o cleanup terminan con codigo distinto de cero.

Cuando el mismo outbox contiene otros protocolos, configura el `OutboxProcessor` dedicado con `types: [workflowWakeMessageType]`. El claim filtrado por tipo evita que el adapter de entrega de workflows compita con workers de webhooks u otros mensajes.

Ejecuta `DATABASE_URL=postgresql://... pnpm test:integration:postgres` para correr la prueba requerida contra PostgreSQL real en un schema temporal aislado. Verifica commit conjunto, rollback ante fallo outbox, rollback del caller sobre filas de dominio, workflow y outbox, y recovery con un wake nuevo conservando la fila dead. El target falla si falta `DATABASE_URL` en vez de omitir silenciosamente la prueba.

### Scheduling por colas

`@nuxt-laravelize/workflows-queue` agenda una transicion autoritativa por job. El payload solo contiene el ID; cada worker recarga el store y hace claim por revision y lease. Los deadlines de reintentos de negocio crean jobs sucesores diferidos, mientras los reintentos de cola quedan para fallos de transporte, store o publicacion.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/workflows-queue'],
  laravelizeWorkflowsQueue: { queue: 'workflows', tries: 5, backoff: 5000 },
})

await useWorkflows(event).start(fulfill, { orderId }, orderId)

// Ejecutalo periodicamente desde tu scheduler o worker operacional.
await useWorkflows(event).reconcileStore({ pageSize: 100 })
```

Liga `workflowStoreToken` a un store durable y registra definiciones mediante `workflowRegistryToken`. Los IDs deterministas por revision solo optimizan deduplicacion del transporte; el fencing del store garantiza que jobs duplicados sean inocuos. Persistencia y publicacion son operaciones separadas: ejecuta `reconcileStore()` periodicamente cuando el store soporte recovery discovery, o llama `reconcile(ids)` con IDs de un indice propio. Cada scan captura un limite `updatedBefore` para que las actualizaciones concurrentes no vuelvan infinita una pasada; las siguientes pasadas recogen cambios posteriores. Este bridge no promete outbox transaccional.

Los payloads de queue y wake contienen solo el ID para que jobs antiguos recarguen la tupla relacional autoritativa y no lleven metadata de version obsoleta o controlada por el transporte. Enqueue y reconciliacion validan definiciones exactas y continuan tras reportar IDs incompatibles; el handler falla de forma cerrada antes del claim. El reconciler exige `{ resolver: registry }` con el mismo registry de los workers.

## Testing

`@nuxt-laravelize/testing` agrega los fakes oficiales y los monta en un contenedor sellado.

```bash
pnpm add -D @nuxt-laravelize/testing
```

```ts
import { mountLaravelize } from '@nuxt-laravelize/testing'

const app = mountLaravelize()
await app.cache.put('feature:user_1', true, 60)
await app.events.dispatch(new UserRegistered('user_1'))
await app.queue.push(new SendReport({ reportId: 'report_1' }))
await app.mail.send(new WelcomeMail('ada@example.com'))

app.events.assertDispatched(UserRegistered)
app.queue.assertPushed(SendReport)
app.mail.assertSent(WelcomeMail)
await app.cache.assertHas('feature:user_1')
```

`mountLaravelize()` devuelve `container`, `cache`, `encrypter`, `events`, `features`, `filesystem`, `hasher`, `queue`, `mail`, `notifications`, `rateLimiter` y `validator`. El paquete tambien reexporta `CacheFake`, `EventFake`, `FakeLogger`, `FilesystemFake`, `QueueFake`, `MailFake` y `NotificationFake` para tests enfocados.

## Console

`@nuxt-laravelize/console` registra comandos tipados sin una facade global. `CommandRegistry` rechaza nombres duplicados; los schemas de argumentos y opciones controlan parsing, defaults, aliases, validacion y help. `ConsoleRunner` crea un scope Laravelize por invocacion, liga un contexto `cli`, propaga abort, registra logs/spans acotados, normaliza exit codes y siempre libera el scope. El entrypoint portable no lee globals de process. Usa `/node` para adapters TTY/process y `/testing` para fakes deterministas. Los prompts fallan de forma cerrada sin un adapter interactivo.

```ts
const registry = new CommandRegistry().register(defineCommand({
  name: 'reports:send',
  arguments: { report: argument.string() },
  options: { queue: option.string({ short: 'q' }) },
  handler: sendReportHandlerToken,
}))

const exitCode = await new ConsoleRunner({ application, registry, terminal, process }).run()
```

## Migraciones

`@nuxt-laravelize/migrations` es neutral al ORM. Las fuentes son explicitas y los IDs usan `namespace:name`; no se escanean dependencias. Antes de mutar, el runner valida dialectos, dependencias, ciclos, IDs duplicados, historial aplicado y checksums. `up`, `rollback`, `reset` y `fresh` seleccionan trabajo bajo el lock del backend, y cada statement junto con su historial comparte una transaccion. Las migraciones irreversibles rechazan rollback. `fresh` exige un allowlist exacto de ownership y nunca inspecciona objetos ajenos.

`@nuxt-laravelize/migrations-drizzle` aporta backends PostgreSQL y SQLite. PostgreSQL exige una conexion fijada para que advisory lock, SQL e historial compartan sesion y transaccion. SQLite usa transacciones immediate locales al callback. `migrationSourcesFor(dialect)` agrega explicitamente fuentes de audit, idempotency, reliability, Scout y workflows. `discoverApplicationMigrations()` carga fuentes de aplicacion desde paths entregados por el caller.

```ts
const runner = new MigrationRunner({
  dialect: 'postgresql',
  backend: new PostgresMigrationBackend(connectionProvider),
  sources: [...migrationSourcesFor('postgresql'), appMigrations],
})

await runner.up()
```

El entrypoint `/console` aporta `migrate:status`, `migrate:up`, `migrate:rollback`, `migrate:reset`, `migrate:fresh` y `migrate:pretend`. Los comandos destructivos exigen confirmacion interactiva afirmativa.

## Scheduler

`@nuxt-laravelize/scheduler` define schedules inmutables e independientes del framework. No forma parte del preset Nuxt. `@nuxt-laravelize/scheduler-nuxt` es el adapter opt-in para Nuxt 4 y compila declaraciones explicitas como tasks del Nitro 2 gestionado por Nuxt; nunca instala ni reemplaza Nitro.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'

const schedule = defineSchedule((schedule) => {
  schedule.operation('reports:hourly').hourly().withoutOverlapping(30)
  schedule.dispatch('search:sync', { job: 'search:sync', queue: 'maintenance' }).everyFiveMinutes().onOneServer()
  schedule.task('reports:daily').timezone('America/New_York').dailyAt('02:30')
  schedule.task('billing:weekdays').cron('0 8 * * 1-5')
})

console.log(schedule.all())
```

Los schedules soportan helpers cron, zonas IANA, dispatch a queue, `withoutOverlapping`, `onOneServer`, comportamiento en maintenance y hooks nombrados. En providers que solo aceptan cron UTC, las zonas usan un trigger por minuto y un guard DST-safe. Los wrappers Nuxt ejecutan mediante `SchedulerRunner` y un scope runtime aportado por la aplicacion. `/cache-lock` adapta un cache Redis/Valkey verificado: `onOneServer` renueva un claim validado por owner mientras ejecuta, libera fallos capturados para retry y reinicia el TTL completo despues del exito; `withoutOverlapping` usa un lease separado, renovable y validado por owner. Cada runner con locks exige un `namespace` estable por aplicacion y entorno; configura `occurrenceRetentionSeconds` para cubrir la ejecucion maxima y la ventana de replay del provider. Un crash deja el claim hasta la recuperacion por TTL. Los locks locales y los providers sin claims de ocurrencia atomicos se rechazan para `onOneServer`.

La ejecucion es at-least-once ante fallos ambiguos de aplicacion o cleanup. Usa claves de idempotencia estables por ocurrencia para operaciones, dispatch a queue y hooks. La perdida del lease aborta el signal de ejecucion expuesto y rechaza el resultado, pero la cancelacion cooperativa no deshace efectos externos; usa fencing de base de datos cuando los writes duplicados sean inaceptables.

La generacion de triggers sigue perteneciendo a Nitro. Esta integracion soporta Nuxt `>=4.4.5 <5`; verifica que el preset Nitro seleccionado soporte scheduled tasks. Las invocaciones estandar de Nitro 2 no propagan el timestamp programado de Cloudflare o Vercel, por lo que los wrappers generados por el modulo siempre usan un wall clock que avanza. Solo la API low-level `createGeneratedSchedulerTask(..., { timestampSource: 'event' })` puede optar por un timestamp de ocurrencia inmutable aportado explicitamente; el adapter Cloudflare standalone acepta `ScheduledController.scheduledTime`. Configura un `CRON_SECRET` fuerte en cada deployment de produccion en Vercel para que Nitro autentique los endpoints cron generados. Nunca expongas los endpoints de desarrollo de tasks ni envuelvas `runTask()` en una ruta de produccion sin autenticacion.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { compileSchedule, defineScheduledOperation, runScheduledTask } from '@nuxt-laravelize/scheduler/nitro3'

export default defineScheduledOperation('reports:daily', {
  execute: async payload => generateReport(String(payload.reportId ?? 'daily')),
}, 'Generate the daily report')

const nitroSchedule = defineSchedule((schedule) => {
  schedule.task('reports:daily').dailyAt('02:30')
})

const compiled = compileSchedule(nitroSchedule, {
  'reports:daily': { handler: './tasks/reports' },
})

await runScheduledTask('reports:daily', { reportId: 'report_1' })
```

Combina `compiled` con una configuracion Nitro 3 standalone. El soporte real de scheduling depende del preset de deployment seleccionado. Este adapter minimo solo acepta schedules de operaciones simples y rechaza zonas horarias, dispatch a queue, politicas de overlap/one-server, overrides de maintenance y hooks en lugar de ignorarlos silenciosamente.

## Entrypoints publicos

| Paquete | Entrypoints de runtime | Entrypoint de testing |
|---|---|---|
| `cache` | `/runtime` | `/testing` |
| `core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `events` | `/runtime` | `/testing` |
| `queue` | `/runtime` | `/testing` |
| `queue-bullmq` | `/runtime` | - |
| `reliability` | raiz del paquete | `/testing` |
| `reliability-drizzle` | raiz del paquete, `/postgres`, `/sqlite`, `/turso` | - |
| `dead-letter` | raiz del paquete | `/testing` |
| `reliability-queue` | raiz del paquete, `/runtime` | - |
| `routes` | raiz del paquete, `/runtime`, `/kit` | - |
| `events-queue` | `/runtime` | - |
| `mail` | `/runtime`, `/node` | `/testing` |
| `notifications` | `/runtime` | `/testing` |
| `http` | `/runtime` | - |
| `database` | `/runtime` | - |
| `console` | raiz del paquete, `/node` | `/testing` |
| `migrations` | raiz del paquete, `/console` | `/testing` |
| `migrations-drizzle` | raiz, `/postgres`, `/sqlite`, `/sources` | `/testing` |
| `testing` | raiz del paquete | raiz del paquete |
| `scheduler` | raiz del paquete, `/nitro3` | - |
| `scheduler-nuxt` | raiz, `/runtime`, `/adapters`, `/compiler`, `/cache-lock` | - |
| `webhooks` | raiz del paquete | `/testing` |
| `workflows` | raiz del paquete | - |
| `workflows-drizzle` | raiz del paquete, `/postgres`, `/sqlite`, `/turso`, `/schema`, `/sqlite-schema` | - |
| `workflows-reliability` | raiz del paquete | - |
| `workflows-queue` | raiz del paquete, `/runtime` | - |
| `nuxt` | raiz del paquete, `/runtime/server` | - |
## Contexto de ejecucion

`@nuxt-laravelize/execution-context` asigna a cada request Nitro un contexto inmutable, validado y seguro para JSON. `useExecutionContext(event)` devuelve el valor del scope. Los IDs de correlacion entrantes solo se aceptan cuando `trustIncomingCorrelationHeader` esta habilitado explicitamente y son validos; nunca se confian headers de actor o tenant. Los atributos se limitan a 16 strings de 256 caracteres. El `locale` BCP 47 canonical opcional se limita a 35 caracteres, server localization lo resuelve para HTTP, `create`, `derive`, `enrich` y queue lo conservan, y audit lo registra como campo de primera clase.

Usa `snapshot()` para transporte, `derive()` para trabajo hijo, `enrich()` autenticado para actor/tenant y `withExecutionContext()` para logs saneados. Un snapshot transportado solo es procedencia de correlacion y **NO DEBE** autorizar actor o tenant. Los handlers HTTP pasan el contexto de request explicitamente al despachar: `runWithExecutionContext(useExecutionContext(event), () => queue.push(job))`. El bridge de colas conserva la correlacion, crea un execution ID del worker y asigna como causacion el execution ID productor; los adapters persistentes deben recibir el mismo `JobSerializer` registrado.
## Observabilidad y OpenTelemetry

`@nuxt-laravelize/observability` se incluye en el preset como base no-op sin coste. Sus contratos runtime no dependen de H3. Los providers de la aplicación pueden sobrescribir `observabilityToken` si se registran después de los providers del módulo. `@nuxt-laravelize/observability-otel` y `@nuxt-laravelize/observability-queue` son opt-in. El adapter OTel usa solo `@opentelemetry/api` en runtime y nunca instala globals, SDK ni exporters.

Los consumidores de cola crean spans raíz por defecto. Activa `trustTraceContext: true` solo para carriers de confianza. Los metadatos persisten únicamente `traceparent`; `tracestate` requiere `propagateTracestate: true` y baggage nunca se persiste. Los callbacks terminales de fallo no son spans de proceso. Si también se instala execution-context, observabilidad sustituye solo la correlación trace/span y conserva la identidad y procedencia de ejecución del worker.

La confianza del trace HTTP entrante está desactivada por defecto y baggage siempre se descarta. Las integraciones no capturan payloads, bodies, URLs/query, secretos, headers arbitrarios, IPs, mensajes/stacks de error ni IDs de actor/tenant/workflow/mensaje/job como labels. Los IDs no se capturan por defecto. Jobs y colas requieren allowlists explícitas o se convierten en `other`.

Los hooks Nitro inician y terminan spans. El token de observabilidad del request enlaza los servicios Laravelize, `useObservability(event)`, `observe()` y la inyección del productor de colas con ese span de servidor. Esto no es ALS global del handler: la autoinstrumentación externa que evita el token no queda enlazada por este mecanismo.

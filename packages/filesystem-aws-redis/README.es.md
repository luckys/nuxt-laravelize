# `@nuxt-laravelize/filesystem-aws-redis`

[English](./README.md) | Espanol

Store Redis/Valkey compartido para confirmaciones S3 resistentes a reinicios

## Instalacion

```bash
pnpm add @nuxt-laravelize/filesystem-aws-redis @nuxt-laravelize/filesystem-aws ioredis
```

## Uso especifico del package


### Haz la confirmacion de uploads S3 resistente a reinicios

Usa el store de issuance Redis cuando varias instancias Node puedan emitir o confirmar uploads. Sus transiciones Lua reservan, liberan y completan una issuance con token de owner y expiracion controlada por Redis.

```ts
import Redis from 'ioredis'
import { RedisS3UploadIssuanceStore } from '@nuxt-laravelize/filesystem-aws-redis'
import { createAwsS3Filesystem } from '@nuxt-laravelize/filesystem-aws'

const issuanceStore = new RedisS3UploadIssuanceStore(new Redis(process.env.REDIS_URL), {
  prefix: 'uploads:production:',
})
const uploads = createAwsS3Filesystem({ bucket, region, issuanceStore })
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |

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

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#filesystem). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/filesystem-aws`](../filesystem-aws/README.es.md), [`@nuxt-laravelize/filesystem`](../filesystem/README.es.md).

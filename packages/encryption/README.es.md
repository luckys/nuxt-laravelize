# `@nuxt-laravelize/encryption`

[English](./README.md) | Espanol

Cifrado AES-256-GCM, binding por proposito y rotacion de claves

## Instalacion

```bash
pnpm add @nuxt-laravelize/encryption
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/encryption'],
})
```


## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |

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

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#encryption). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/hashing`](../hashing/README.es.md), [`@nuxt-laravelize/core`](../core/README.es.md).

# `@nuxt-laravelize/hashing`

[English](./README.md) | Espanol

Hashing PBKDF2 versionado y deteccion de rehash

## Instalacion

```bash
pnpm add @nuxt-laravelize/hashing
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/hashing'],
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

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#hashing). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/encryption`](../encryption/README.es.md).

# `@nuxt-laravelize/pennant`

[English](./README.md) | Espanol

Feature flags por scope con definiciones lazy, valores ricos y stores portables

## Instalacion

```bash
pnpm add @nuxt-laravelize/pennant
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/pennant'],
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

## Feature flags

`@nuxt-laravelize/pennant` ofrece feature flags lazy por scope, con valores booleanos o ricos. El preset registra un store en memoria; en despliegues distribuidos reemplaza `featureManagerToken` por un manager respaldado por un `FeatureStore` compartido.

```ts
const features = useFeatures(event)
features.define('new-checkout', scope => scope.plan === 'pro' ? 'variant-b' : false)
const accountFeatures = features.for({ plan: 'pro', toFeatureIdentifier: () => 'account:42' })
if (await accountFeatures.active('new-checkout')) return { variant: await accountFeatures.value('new-checkout') }
```

Las definiciones se evaluan solo despues de un miss del store y su resultado se persiste. Usa `activate()`, `deactivate()` y `forget()` para un scope, `purge()` para los datos almacenados del rollout y `flushCache()` en limites explicitos del ciclo de vida. Los scopes objeto deben implementar `toFeatureIdentifier()` para evitar identidades inestables por serializacion.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#feature-flags). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/cache`](../cache/README.es.md), [`@nuxt-laravelize/core`](../core/README.es.md).

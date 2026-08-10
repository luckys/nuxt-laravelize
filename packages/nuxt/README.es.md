# `@luckys_luis/nuxt-laravelize`

[English](./README.md) | Espanol

Preset conveniente con integracion de `nuxt-i18n-micro`

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
// nuxt.config.ts
import Laravelize from '@luckys_luis/nuxt-laravelize'

export default defineNuxtConfig({
  modules: [Laravelize],
})
```


## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |

## Preset Nuxt

Instala `@luckys_luis/nuxt-laravelize` para activar juntos los modulos estables, el bridge reliability-queue y `nuxt-i18n-micro`. BullMQ, los adapters durables de reliability y el scheduler experimental se excluyen intencionalmente.

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
// nuxt.config.ts
import Laravelize from '@luckys_luis/nuxt-laravelize'

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

import { createServerLocalization } from '@luckys_luis/nuxt-laravelize/runtime/server'
const i18n = await createServerLocalization(context.snapshot().locale ?? 'es')
```

`createServerLocalization()` sirve para jobs, preparacion de mail, notifications, CLI y scheduler sin H3 event. `ServerLocalization` expone `locale` canonico, `localeCode` configurado exacto, `defaultLocale`, `fallbackLocale`, `fallbackLocales`, `availableLocales`, `t`, `tc`, `tn`, `td` y `tdr`. La resolucion de request respeta path/query, cookie de locale, `Accept-Language` y default configurados; los aliases code, ISO y language configurados participan en la deteccion automatica. Los locales publicos y el formato Intl usan tags BCP 47 canonicos, mientras los diccionarios y las reglas plurales custom reciben el code configurado exacto (por ejemplo, `en_US` expone `en-US`, pero plural recibe `en_US`). Los locales explicitos y detectados solo coinciden con aliases configurados, y valores malformados o no soportados nunca forman paths de assets. La cadena fallback del locale seleccionado se aplica antes del fallback global/default, acotando duplicados y ciclos; cada referencia debe resolver a un locale habilitado. Se soportan los modos de payload `source` y premerged. Los payloads global/index ausentes se comportan como diccionarios vacios, manteniendo route-specific los layouts con traducciones solo de pagina. Cada objeto queda aislado por request. El entrypoint server publico se puede importar desde Node y `createServerLocalization(locale, source)` acepta un source inyectable sin event. Las APIs de localizacion y la integracion Nitro no se registran si i18n es false, falta o no tiene locales utilizables.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#preset-nuxt). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-core`](../core/README.es.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.es.md), [`@luckys_luis/nuxt-laravelize-reliability-queue`](../reliability-queue/README.es.md).

# `@nuxt-laravelize/validation`

[English](./README.md) | Espanol

Validacion Standard Schema, resultados tipados y error bags

## Instalacion

```bash
pnpm add @nuxt-laravelize/validation
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/validation'],
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

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#validation). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/http`](../http/README.es.md), [`@nuxt-laravelize/nuxt`](../nuxt/README.es.md).

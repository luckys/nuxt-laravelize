# `@luckys_luis/nuxt-laravelize-validation`

[Espanol](./README.es.md) | English

Portable Standard Schema validation and error bags for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-validation
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-validation'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |

## Validation

`@luckys_luis/nuxt-laravelize-validation` validates any [Standard Schema](https://standardschema.dev/) implementation, including Zod, Valibot and ArkType, without coupling application services to HTTP.

```bash
pnpm add @luckys_luis/nuxt-laravelize-validation
```

Use `validate()` when invalid input is exceptional, or `safeValidate()` when the caller owns the control flow.

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

| API | Purpose |
|---|---|
| `validate(schema, input, options?)` | Returns the schema's typed, transformed output or throws `ValidationError`. |
| `safeValidate()` | Returns a discriminated success/error result without throwing. |
| `ErrorBag.first()` / `get()` / `has()` | Reads messages for one dot-notated field. |
| `ErrorBag.all()` / `any()` | Returns a defensive error snapshot or checks if any issue exists. |
| `validatorToken` | Replaces or resolves the shared validator. |

Nested object and array paths become stable dot notation such as `body.users.0.email`; multiple issues for one field preserve schema order. `FormRequest` uses this same validator internally, so standalone validation and HTTP `422` responses share path and message semantics.

Build localized Standard Schema messages when constructing the schema; do not translate vendor issue codes or arbitrary issue strings after validation:

```ts
const i18n = await useServerLocalization(event)
const schema = z.object({ email: z.email({ error: i18n.t('validation.email') }) })
const result = await useValidator(event).safeValidate(schema, input)
```

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#validation). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-http`](../http/README.md), [`@luckys_luis/nuxt-laravelize`](../nuxt/README.md).

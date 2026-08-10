# `@luckys_luis/nuxt-laravelize-console`

[English](./README.md) | Espanol

Comandos tipados con DI, contexto por ejecucion y fakes de testing

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-console
```

## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./node` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Console

`@luckys_luis/nuxt-laravelize-console` registra comandos tipados sin una facade global. `CommandRegistry` rechaza nombres duplicados; los schemas de argumentos y opciones controlan parsing, defaults, aliases, validacion y help. `ConsoleRunner` crea un scope Laravelize por invocacion, liga un contexto `cli`, propaga abort, registra logs/spans acotados, normaliza exit codes y siempre libera el scope. El entrypoint portable no lee globals de process. Usa `/node` para adapters TTY/process y `/testing` para fakes deterministas. Los prompts fallan de forma cerrada sin un adapter interactivo.

```ts
const registry = new CommandRegistry().register(defineCommand({
  name: 'reports:send',
  arguments: { report: argument.string() },
  options: { queue: option.string({ short: 'q' }) },
  handler: sendReportHandlerToken,
}))

const exitCode = await new ConsoleRunner({ application, registry, terminal, process }).run()
```

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#console). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-core`](../core/README.es.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.es.md), [`@luckys_luis/nuxt-laravelize-testing`](../testing/README.es.md).

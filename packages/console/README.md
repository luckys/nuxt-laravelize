# `@luckys_luis/nuxt-laravelize-console`

[Espanol](./README.es.md) | English

Typed, dependency-injected console command runtime for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-console
```

## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./node` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Console

`@luckys_luis/nuxt-laravelize-console` registers typed commands without a global command facade. `CommandRegistry` rejects duplicate names; argument and option schemas own parsing, defaults, aliases, validation, and help. `ConsoleRunner` creates one Laravelize application scope per invocation, binds a `cli` execution context, propagates abort signals, records bounded logs/spans, normalizes exit codes, and always disposes the scope. The portable entrypoint never reads process globals. Use `/node` for TTY/process adapters and `/testing` for deterministic terminal, prompt, and process fakes. Prompts fail closed unless an interactive adapter is installed.

```ts
const registry = new CommandRegistry().register(defineCommand({
  name: 'reports:send',
  arguments: { report: argument.string() },
  options: { queue: option.string({ short: 'q' }) },
  handler: sendReportHandlerToken,
}))

const exitCode = await new ConsoleRunner({ application, registry, terminal, process }).run()
```

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#console). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-core`](../core/README.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.md), [`@luckys_luis/nuxt-laravelize-testing`](../testing/README.md).

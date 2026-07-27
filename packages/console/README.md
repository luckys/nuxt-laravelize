# `@nuxt-laravelize/console`

Portable typed console commands using the Laravelize application container.

```ts
import { createToken, LaravelizeApplication } from '@nuxt-laravelize/core/runtime'
import { argument, CommandRegistry, ConsoleRunner, defineCommand, option, type CommandHandler } from '@nuxt-laravelize/console'
import { FakeProcess, FakeTerminal } from '@nuxt-laravelize/console/testing'

type Arguments = { name: string }
type Options = { loud: boolean }
const greetHandler = createToken<CommandHandler<Arguments, Options>>('app.greet')

const registry = new CommandRegistry().register(defineCommand({
  name: 'greet',
  description: 'Greet a person.',
  arguments: { name: argument.string() },
  options: { loud: option.boolean({ short: 'l' }) },
  handler: greetHandler,
}))

const application = new LaravelizeApplication([AppServiceProvider])
const terminal = new FakeTerminal()
const process = new FakeProcess(['greet', 'Ada', '--loud'])
const exitCode = await new ConsoleRunner({ application, registry, terminal, process }).run()
```

Bind each command handler token in an application service provider. Every invocation receives a fresh container scope with `executionContextToken` set to source `cli`, plus `terminalToken`, `processToken`, `promptToken`, and `abortSignalToken`. Registered logging and observability services are used automatically. Unexpected errors are not printed; commands should write intentional user-facing detail through the terminal.

The default prompt implementation always rejects. Install an explicit `Prompt`, or use `runNodeConsole` from `@nuxt-laravelize/console/node`, which provides TTY-aware Node adapters and maps `SIGINT` to an abort signal. Node-specific APIs are not imported by the portable package entrypoint.

Option values beginning with `-` must use inline long-option syntax, such as `--tag=-draft` or `--count=-1`. This keeps a following option token from being consumed accidentally as another option's value.

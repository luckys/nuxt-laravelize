import { createToken, LaravelizeApplication, type createContainer, type ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { observabilityToken } from '@nuxt-laravelize/observability/runtime'
import { ObservabilityFake } from '@nuxt-laravelize/observability/testing'
import { describe, expect, it, vi } from 'vitest'
import { abortSignalToken, argument, CommandRegistry, ConsoleRunner, defineCommand, EXIT_ABORTED, EXIT_FAILURE, EXIT_SUCCESS, EXIT_USAGE, promptToken, type CommandHandler, type CommandInvocation, terminalToken } from '../src/index'
import { FakeProcess, FakePrompt, FakeTerminal } from '../src/testing'

type Empty = Record<never, never>

describe('ConsoleRunner', () => {
  it('boots the application, creates a CLI scope, injects adapters, logs, and traces', async () => {
    const observed = new ObservabilityFake()
    const invocation = vi.fn<(value: CommandInvocation<{ name: string }, Empty>) => Promise<undefined>>()
    const handlerToken = createToken<CommandHandler<{ name: string }, Empty>>('greet.handler')
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.bind(handlerToken, () => ({ handle: invocation }))
        container.instance(observabilityToken, observed)
      }
    }
    const application = new LaravelizeApplication([Provider])
    const registry = new CommandRegistry().register(defineCommand({ name: 'greet', description: 'Greet.', arguments: { name: argument.string() }, handler: handlerToken }))
    const terminal = new FakeTerminal()
    const process = new FakeProcess(['greet', 'Ada'])
    const prompt = new FakePrompt(['yes'])

    const code = await new ConsoleRunner({ application, registry, terminal, process, prompt }).run()

    expect(code).toBe(EXIT_SUCCESS)
    expect(invocation).toHaveBeenCalledOnce()
    const context = invocation.mock.calls[0]![0]
    expect(context.arguments.name).toBe('Ada')
    expect(context.resolver.make(executionContextToken).snapshot().source).toEqual({ type: 'cli', name: 'greet' })
    expect(context.resolver.make(terminalToken)).toBe(terminal)
    expect(context.resolver.make(promptToken)).toBe(prompt)
    expect(context.resolver.make(abortSignalToken)).toBe(process.signal)
    expect(observed.spans.some(span => span.name === 'console.command')).toBe(true)
    await application.close()
  })

  it('renders list, command help, and usage failures with normalized codes', async () => {
    const handlerToken = createToken<CommandHandler<Empty, Empty>>('noop.handler')
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.instance(handlerToken, { handle: () => 999 })
      }
    }
    const registry = new CommandRegistry().register(defineCommand({ name: 'noop', description: 'Does nothing.', handler: handlerToken }))
    const app = new LaravelizeApplication([Provider])
    const terminal = new FakeTerminal()

    expect(await new ConsoleRunner({ application: app, registry, terminal, process: new FakeProcess([]) }).run()).toBe(EXIT_SUCCESS)
    expect(terminal.output).toContain('Available commands')
    expect(await new ConsoleRunner({ application: app, registry, terminal, process: new FakeProcess(['help', 'noop']) }).run()).toBe(EXIT_SUCCESS)
    expect(terminal.output).toContain('Usage: noop')
    expect(await new ConsoleRunner({ application: app, registry, terminal, process: new FakeProcess(['missing']) }).run()).toBe(EXIT_USAGE)
    expect(await new ConsoleRunner({ application: app, registry, terminal, process: new FakeProcess(['noop']) }).run()).toBe(EXIT_FAILURE)
    await app.close()
  })

  it('fails closed for prompts in non-interactive execution', async () => {
    const promptHandler = createToken<CommandHandler<Empty, Empty>>('prompt.handler')
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.instance(promptHandler, { handle: async ({ resolver }) => {
          await resolver.make(promptToken).confirm('Continue?')
        } })
      }
    }
    const registry = new CommandRegistry().register(defineCommand({ name: 'ask', handler: promptHandler }))
    const terminal = new FakeTerminal({ interactive: false })
    const app = new LaravelizeApplication([Provider])
    expect(await new ConsoleRunner({ application: app, registry, terminal, process: new FakeProcess(['ask']) }).run()).toBe(EXIT_FAILURE)
    expect(terminal.errors).toMatch(/unavailable/i)
    await app.close()
  })

  it('maps aborts to 130 and passes the signal to the command boundary', async () => {
    const token = createToken<CommandHandler<Empty, Empty>>('abort.handler')
    const handle = vi.fn()
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.instance(token, { handle })
      }
    }
    const process = new FakeProcess(['work'])
    process.abort()
    const app = new LaravelizeApplication([Provider])
    const runner = new ConsoleRunner({ application: app, registry: new CommandRegistry().register(defineCommand({ name: 'work', handler: token })), terminal: new FakeTerminal(), process })
    expect(await runner.run()).toBe(EXIT_ABORTED)
    expect(handle).not.toHaveBeenCalled()
    await app.close()
  })

  it('does not invoke the handler when aborted during scope creation', async () => {
    const token = createToken<CommandHandler<Empty, Empty>>('scope-abort.handler')
    const handle = vi.fn()
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.instance(token, { handle })
      }
    }
    const process = new FakeProcess(['work'])
    const app = new LaravelizeApplication([Provider])
    const scope = await app.createScope()
    vi.spyOn(app, 'createScope').mockImplementation(async () => {
      process.abort()
      return scope
    })
    const dispose = vi.spyOn(scope, 'dispose').mockResolvedValue()
    const runner = new ConsoleRunner({ application: app, registry: new CommandRegistry().register(defineCommand({ name: 'work', handler: token })), terminal: new FakeTerminal(), process })

    await expect(runner.run()).resolves.toBe(EXIT_ABORTED)
    expect(handle).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
    await app.close()
  })

  it('disposes the scope and normalizes throwing setup overrides', async () => {
    const token = createToken<CommandHandler<Empty, Empty>>('setup.handler')
    const app = new LaravelizeApplication([])
    const scope = await app.createScope()
    vi.spyOn(app, 'createScope').mockResolvedValue(scope)
    vi.spyOn(scope, 'override').mockImplementationOnce(() => {
      throw new Error('override failed')
    })
    const dispose = vi.spyOn(scope, 'dispose').mockResolvedValue()
    const runner = new ConsoleRunner({ application: app, registry: new CommandRegistry().register(defineCommand({ name: 'setup', handler: token })), terminal: new FakeTerminal(), process: new FakeProcess(['setup']) })

    await expect(runner.run()).resolves.toBe(EXIT_FAILURE)
    expect(dispose).toHaveBeenCalledOnce()
    await app.close()
  })

  it('disposes the scope when optional service resolution throws', async () => {
    const token = createToken<CommandHandler<Empty, Empty>>('resolution.handler')
    const app = new LaravelizeApplication([])
    const scope = await app.createScope()
    vi.spyOn(app, 'createScope').mockResolvedValue(scope)
    vi.spyOn(scope, 'has').mockImplementation(() => {
      throw new Error('resolver failed')
    })
    const dispose = vi.spyOn(scope, 'dispose').mockResolvedValue()
    const runner = new ConsoleRunner({ application: app, registry: new CommandRegistry().register(defineCommand({ name: 'resolve', handler: token })), terminal: new FakeTerminal(), process: new FakeProcess(['resolve']) })

    await expect(runner.run()).resolves.toBe(EXIT_FAILURE)
    expect(dispose).toHaveBeenCalledOnce()
    await app.close()
  })

  it('normalizes disposal failures without leaking the scope', async () => {
    const token = createToken<CommandHandler<Empty, Empty>>('dispose.handler')
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.instance(token, { handle: () => undefined })
      }
    }
    const app = new LaravelizeApplication([Provider])
    const scope = await app.createScope()
    vi.spyOn(app, 'createScope').mockResolvedValue(scope)
    const dispose = vi.spyOn(scope, 'dispose').mockRejectedValue(new Error('dispose failed'))
    const runner = new ConsoleRunner({ application: app, registry: new CommandRegistry().register(defineCommand({ name: 'dispose', handler: token })), terminal: new FakeTerminal(), process: new FakeProcess(['dispose']) })

    await expect(runner.run()).resolves.toBe(EXIT_FAILURE)
    expect(dispose).toHaveBeenCalledOnce()
    await app.close()
  })

  it('does not let disposal failures mask a primary abort', async () => {
    const token = createToken<CommandHandler<Empty, Empty>>('primary.handler')
    class Provider implements ServiceProvider {
      register(container: ReturnType<typeof createContainer>) {
        container.instance(token, { handle: () => {
          throw new DOMException('aborted', 'AbortError')
        } })
      }
    }
    const app = new LaravelizeApplication([Provider])
    const scope = await app.createScope()
    vi.spyOn(app, 'createScope').mockResolvedValue(scope)
    const dispose = vi.spyOn(scope, 'dispose').mockRejectedValue(new Error('dispose failed'))
    const runner = new ConsoleRunner({ application: app, registry: new CommandRegistry().register(defineCommand({ name: 'primary', handler: token })), terminal: new FakeTerminal(), process: new FakeProcess(['primary']) })

    await expect(runner.run()).resolves.toBe(EXIT_ABORTED)
    expect(dispose).toHaveBeenCalledOnce()
    await app.close()
  })
})

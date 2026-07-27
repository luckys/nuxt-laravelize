import { PassThrough } from 'node:stream'
import { createToken, LaravelizeApplication, type Container, type ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { describe, expect, it } from 'vitest'
import { CommandRegistry, ConsoleRunner, defineCommand, EXIT_ABORTED, FailClosedPrompt, NonInteractivePromptError, type CommandHandler } from '../src/index'
import { NodePrompt } from '../src/node'
import { FakeProcess, FakeTerminal } from '../src/testing'

type Empty = Record<never, never>

describe('prompt safety and testing adapters', () => {
  it('never guesses answers when no interactive prompt is installed', async () => {
    const prompt = new FailClosedPrompt()
    await expect(prompt.text('Secret?')).rejects.toBeInstanceOf(NonInteractivePromptError)
    await expect(prompt.confirm('Delete?')).rejects.toBeInstanceOf(NonInteractivePromptError)
  })

  it('captures output and aborts deterministically', () => {
    const terminal = new FakeTerminal()
    terminal.write('out')
    terminal.writeError('err')
    const process = new FakeProcess(['one'])
    process.abort()
    expect({ output: terminal.output, errors: terminal.errors, argv: process.argv, aborted: process.signal.aborted }).toEqual({ output: 'out', errors: 'err', argv: ['one'], aborted: true })
  })

  it('cancels an active Node prompt before destructive command work continues', async () => {
    const handlerToken = createToken<CommandHandler<Empty, Empty>>('destructive.handler')
    let destructiveActionRan = false
    class Provider implements ServiceProvider {
      register(container: Container) {
        container.instance(handlerToken, { handle: async ({ prompt }) => {
          await prompt.confirm('Delete production data?')
          destructiveActionRan = true
        } })
      }
    }
    const application = new LaravelizeApplication([Provider])
    const process = new FakeProcess(['destroy'])
    const terminal = new FakeTerminal()
    const prompt = new NodePrompt(terminal, { signal: process.signal, stdin: new PassThrough(), stdout: new PassThrough() })
    const registry = new CommandRegistry().register(defineCommand({ name: 'destroy', handler: handlerToken }))
    const running = new ConsoleRunner({ application, process, prompt, registry, terminal }).run()
    await new Promise(resolve => setImmediate(resolve))

    process.abort()

    await expect(running).resolves.toBe(EXIT_ABORTED)
    expect(destructiveActionRan).toBe(false)
    await application.close()
  })
})

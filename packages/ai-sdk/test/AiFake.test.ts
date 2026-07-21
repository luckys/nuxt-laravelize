import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { defineAgent, Output } from '../src/runtime/index'
import { AiFake } from '../src/runtime/testing/index'

describe('AiFake', () => {
  it('returns queued typed responses and records prompts', async () => {
    const fake = new AiFake([{ output: { score: 9 }, text: '{"score":9}' }])
    const response = await fake.generate<{ score: number }>({ prompt: 'Review this' })

    expect(response.output.score).toBe(9)
    fake.assertPrompted(prompt => prompt.prompt === 'Review this')
  })

  it('runs reusable agent definitions', async () => {
    const fake = new AiFake([{ output: 'Hello Ada' }])
    const greeter = defineAgent<{ name: string }>({
      name: 'greeter',
      instructions: 'Greet the user.',
      prompt: input => `Hello ${input.name}`,
    })

    const response = await greeter.generate(fake, { name: 'Ada' })

    expect(response.text).toBe('Hello Ada')
    fake.assertPrompted(prompt => prompt.instructions === 'Greet the user.' && prompt.prompt === 'Hello Ada')
  })

  it('preserves structured agent result types', async () => {
    const fake = new AiFake([{ output: { score: 9 } }])
    const reviewer = defineAgent<string, { score: number }>({
      name: 'reviewer',
      instructions: 'Review the input.',
      output: Output.object({ schema: z.object({ score: z.number() }) }),
      prompt: input => input,
    })

    const result = await reviewer.generate(fake, 'code')

    expect(result.output.score).toBe(9)
  })

  it('provides a portable text stream', async () => {
    const fake = new AiFake([{ output: 'streamed' }])
    const stream = fake.stream({ prompt: 'Stream this' })

    expect(await stream.text).toBe('streamed')
    expect(await stream.toTextStreamResponse().text()).toBe('streamed')
  })
})

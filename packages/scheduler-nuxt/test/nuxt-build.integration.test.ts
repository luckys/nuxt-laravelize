import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('./fixtures/enabled', import.meta.url))

await setup({ rootDir, server: true })

describe('enabled scheduler Nuxt module', () => {
  it('builds an executable SchedulerRunner wrapper using an ESM runtime entry', async () => {
    const buildDir = useTestContext().nuxt?.options.buildDir
    expect(buildDir).toBeTruthy()
    const taskFile = resolve(buildDir!, 'laravelize/scheduler', `${Buffer.from('fixture:tick').toString('base64url')}.mjs`)
    const generated = await readFile(taskFile, 'utf8')
    expect(generated).toContain('timestampSource: "wall-clock"')
    expect(generated).not.toContain('createRequire')
  })
})

/* eslint-disable @stylistic/max-statements-per-line */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const nuxi = fileURLToPath(new URL('../node_modules/.bin/nuxi', import.meta.url))
async function expectCollision(name: string, kind: 'Page' | 'Server handler') {
  try { await promisify(execFile)(nuxi, ['build'], { cwd: fixture(name), timeout: 120_000 }); throw new Error('Expected build to fail') }
  catch (error) {
    const output = `${(error as { stdout?: string }).stdout ?? ''}\n${(error as { stderr?: string }).stderr ?? ''}`
    expect(output).toMatch(new RegExp(`dead-letter-operations.*${kind} collision`, 'i'))
  }
}

describe('late route collision detection', () => {
  it('rejects a file-based API route with renamed parameters', () => expectCollision('collision-api', 'Server handler'))
  it('rejects a methodless broad Nitro catch-all handler', () => expectCollision('collision-catchall', 'Server handler'))
  it('rejects a dynamic file-based page matching the privileged path', () => expectCollision('collision-page', 'Page'))
})

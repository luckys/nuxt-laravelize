import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isMissingDefaultDeclaration } from '../src/module'

describe('routes module declarations', () => {
  it('gracefully identifies an absent conventional routes.ts declaration', () => {
    const root = resolve(import.meta.dirname, 'missing-project')
    expect(isMissingDefaultDeclaration(resolve(root, 'routes.ts'), root)).toBe(true)
    expect(isMissingDefaultDeclaration(resolve(root, 'custom-routes.ts'), root)).toBe(false)
  })
})

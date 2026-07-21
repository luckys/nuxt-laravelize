import type { JsonValue, WorkflowDefinition, WorkflowStep } from './types'

export function defineStep<I extends JsonValue>(step: Omit<WorkflowStep<I>, 'maxAttempts'> & { maxAttempts?: number }): WorkflowStep<I> {
  if (!step.name) throw new TypeError('Step name is required')
  const maxAttempts = step.maxAttempts ?? 1
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('maxAttempts must be a positive integer')
  return Object.freeze({ ...step, maxAttempts })
}

export function defineWorkflow<I extends JsonValue>(definition: WorkflowDefinition<I>): WorkflowDefinition<I> {
  if (!definition.name || !definition.version) throw new TypeError('Workflow name and version are required')
  if (definition.steps.length === 0) throw new TypeError('A workflow requires at least one step')
  const names = new Set(definition.steps.map(step => step.name))
  if (names.size !== definition.steps.length) throw new TypeError('Step names must be unique')
  return Object.freeze({ ...definition, steps: Object.freeze([...definition.steps]) })
}

export class WorkflowRegistry {
  private readonly definitions = new Map<string, WorkflowDefinition>()
  register(definition: WorkflowDefinition): this {
    const key = this.key(definition.name, definition.version)
    if (this.definitions.has(key)) throw new Error(`Workflow already registered: ${key}`)
    this.definitions.set(key, definition)
    return this
  }

  get(name: string, version: string): WorkflowDefinition {
    const definition = this.definitions.get(this.key(name, version))
    if (!definition) throw new Error(`Workflow not registered: ${name}@${version}`)
    return definition
  }

  private key(name: string, version: string) { return `${name}\u0000${version}` }
}

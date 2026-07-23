import type { JsonValue, WorkflowDefinition, WorkflowDefinitionReference, WorkflowDefinitionResolver, WorkflowStep } from './types'
import { assertWorkflowName, assertWorkflowVersion } from './validation'

export class DuplicateWorkflowDefinitionError extends Error {
  constructor(readonly workflowName: string, readonly workflowVersion: string) {
    super(`Workflow already registered: ${workflowName}@${workflowVersion}`)
    this.name = 'DuplicateWorkflowDefinitionError'
  }
}

export class WorkflowDefinitionNotFoundError extends Error {
  constructor(readonly workflowName: string, readonly workflowVersion: string) {
    super(`Workflow definition not registered: ${workflowName}@${workflowVersion}`)
    this.name = 'WorkflowDefinitionNotFoundError'
  }
}

export class WorkflowResolverContractError extends Error {
  constructor(
    readonly requested: WorkflowDefinitionReference,
    readonly resolvedName?: unknown,
    readonly resolvedVersion?: unknown,
    options?: ErrorOptions,
  ) {
    super(`Workflow resolver must return the exact requested definition ${requested.name}@${requested.version}`, options)
    this.name = 'WorkflowResolverContractError'
  }
}

export function defineStep<I extends JsonValue>(step: Omit<WorkflowStep<I>, 'maxAttempts'> & { maxAttempts?: number }): WorkflowStep<I> {
  assertWorkflowName(step.name, 'Step name')
  const maxAttempts = step.maxAttempts ?? 1
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('maxAttempts must be a positive safe integer')
  return Object.freeze({ ...step, maxAttempts })
}

export function defineWorkflow<I extends JsonValue>(definition: WorkflowDefinition<I>): WorkflowDefinition<I> {
  assertDefinition(definition)
  const steps = definition.steps.map(step => Object.freeze({ ...step }))
  return Object.freeze({ ...definition, steps: Object.freeze(steps) })
}

function assertDefinition(definition: unknown): asserts definition is WorkflowDefinition {
  if (!isPlainDataObject(definition, new Set(['name', 'version', 'steps']))) throw new TypeError('Workflow resolver returned an invalid definition')
  const candidate = definition as unknown as WorkflowDefinition
  if (!isPlainDataArray(candidate.steps)) throw new TypeError('Workflow steps must be a dense plain data array')
  assertWorkflowName(candidate.name)
  assertWorkflowVersion(candidate.version)
  if (candidate.steps.length === 0) throw new TypeError('A workflow requires at least one step')
  for (const step of candidate.steps) {
    if (!isPlainDataObject(step, new Set(['name', 'run', 'compensate', 'maxAttempts']))) throw new TypeError('Workflow steps must be plain data objects')
    assertWorkflowName(step.name, 'Step name')
    if (typeof step.run !== 'function' || (step.compensate !== undefined && typeof step.compensate !== 'function')) throw new TypeError('Workflow step handlers must be functions')
    if (!Number.isSafeInteger(step.maxAttempts) || step.maxAttempts < 1) throw new TypeError('maxAttempts must be a positive safe integer')
  }
  const names = new Set(candidate.steps.map(step => step.name))
  if (names.size !== candidate.steps.length) throw new TypeError('Step names must be unique')
}

export class WorkflowRegistry implements WorkflowDefinitionResolver {
  private readonly definitions = new Map<string, WorkflowDefinition>()
  private readonly versionsByName = new Map<string, string[]>()
  register(...definitions: WorkflowDefinition[]): this {
    const prepared = definitions.map((candidate) => {
      assertDefinition(candidate)
      return Object.isFrozen(candidate) && Object.isFrozen(candidate.steps) && candidate.steps.every(Object.isFrozen) ? candidate : defineWorkflow(candidate)
    })
    const batchKeys = new Set<string>()
    for (const definition of prepared) {
      const key = this.key(definition.name, definition.version)
      if (batchKeys.has(key) || this.definitions.has(key)) throw new DuplicateWorkflowDefinitionError(definition.name, definition.version)
      batchKeys.add(key)
    }
    for (const definition of prepared) {
      const key = this.key(definition.name, definition.version)
      this.definitions.set(key, definition)
      this.versionsByName.set(definition.name, [...(this.versionsByName.get(definition.name) ?? []), definition.version])
    }
    return this
  }

  get(name: string, version: string): WorkflowDefinition {
    return this.resolve({ name, version })
  }

  resolve(reference: WorkflowDefinitionReference): WorkflowDefinition {
    assertWorkflowName(reference.name)
    assertWorkflowVersion(reference.version)
    const definition = this.definitions.get(this.key(reference.name, reference.version))
    if (!definition) throw new WorkflowDefinitionNotFoundError(reference.name, reference.version)
    return definition
  }

  has(reference: WorkflowDefinitionReference): boolean {
    assertWorkflowName(reference.name)
    assertWorkflowVersion(reference.version)
    return this.definitions.has(this.key(reference.name, reference.version))
  }

  /** Versions are returned in deterministic registration order. */
  versions(name: string): readonly string[] {
    assertWorkflowName(name)
    return Object.freeze([...(this.versionsByName.get(name) ?? [])])
  }

  private key(name: string, version: string) { return `${name}\u0000${version}` }
}

/** Validates custom resolver output and rejects aliases/fallbacks before callers mutate state. */
export function resolveWorkflowDefinitionExact(resolver: WorkflowDefinitionResolver, reference: WorkflowDefinitionReference): WorkflowDefinition {
  assertWorkflowName(reference.name)
  assertWorkflowVersion(reference.version)
  const resolved = resolver.resolve(reference) as WorkflowDefinition | null | undefined
  try {
    assertDefinition(resolved)
  }
  catch (cause) {
    throw new WorkflowResolverContractError(reference, resolved?.name, resolved?.version, { cause })
  }
  if (resolved.name !== reference.name || resolved.version !== reference.version)
    throw new WorkflowResolverContractError(reference, resolved.name, resolved.version)
  const steps = resolved.steps.map(step => Object.freeze({
    name: step.name,
    run: step.run,
    ...(step.compensate ? { compensate: step.compensate } : {}),
    maxAttempts: step.maxAttempts,
  }))
  return Object.freeze({ name: resolved.name, version: resolved.version, steps: Object.freeze(steps) })
}

function isPlainDataObject(value: unknown, allowed: Set<string>): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string' || !allowed.has(key))) return false
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    return descriptor.enumerable && 'value' in descriptor
  })
}

function isPlainDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false
  const keys = Reflect.ownKeys(value)
  if (keys.filter(key => key !== 'length').length !== value.length) return false
  return keys.every((key) => {
    if (key === 'length') return true
    if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    return descriptor.enumerable && 'value' in descriptor
  })
}

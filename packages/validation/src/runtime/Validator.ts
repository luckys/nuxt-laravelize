import type { StandardSchemaV1 } from '@standard-schema/spec'

import { ErrorBag, type ValidationErrors } from './ErrorBag'

export interface ValidationOptions {
  readonly prefix?: string
}

export type SafeValidationResult<T>
  = | { success: true, value: T }
    | { success: false, errors: ErrorBag }

export class ValidationError extends Error {
  readonly errors: ErrorBag

  constructor(errors: ErrorBag) {
    super('Validation failed.')
    this.name = 'ValidationError'
    this.errors = errors
  }
}

export class Validator {
  async validate<TSchema extends StandardSchemaV1>(
    schema: TSchema,
    input: StandardSchemaV1.InferInput<TSchema>,
    options?: ValidationOptions,
  ): Promise<StandardSchemaV1.InferOutput<TSchema>> {
    const result = await this.safeValidate(schema, input, options)
    if (!result.success) throw new ValidationError(result.errors)
    return result.value
  }

  async safeValidate<TSchema extends StandardSchemaV1>(
    schema: TSchema,
    input: StandardSchemaV1.InferInput<TSchema>,
    options: ValidationOptions = {},
  ): Promise<SafeValidationResult<StandardSchemaV1.InferOutput<TSchema>>> {
    const result = await schema['~standard'].validate(input)
    if (result.issues) {
      return { success: false, errors: new ErrorBag(collectIssues(result.issues, options.prefix)) }
    }
    return { success: true, value: result.value }
  }
}

function collectIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>, prefix?: string): ValidationErrors {
  const errors: Record<string, string[]> = {}
  for (const issue of issues) {
    const path = buildPath(issue.path, prefix)
    const messages = errors[path] ?? []
    messages.push(issue.message)
    errors[path] = messages
  }
  return errors
}

function buildPath(path: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined, prefix?: string): string {
  const segments = path?.map(segment => typeof segment === 'object' ? String(segment.key) : String(segment)) ?? []
  if (prefix) segments.unshift(prefix)
  return segments.join('.') || 'value'
}

import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError, getQuery, readBody } from 'h3'

import type { FormRequest } from './FormRequest'

type Section = 'body' | 'query' | 'params'

type ValidationErrors = Record<string, string[]>

interface ValidationResult {
  body: unknown
  query: unknown
  params: unknown
}

export async function validateFormRequest(event: H3Event, request: FormRequest): Promise<ValidationResult> {
  const errors: ValidationErrors = {}
  const result: ValidationResult = { body: undefined, query: undefined, params: undefined }

  if (request.body) {
    const data = await readBody(event)
    result.body = await validateSection(request.body(), data, errors, 'body')
  }

  if (request.query) {
    const data = getQuery(event)
    result.query = await validateSection(request.query(), data, errors, 'query')
  }

  if (request.params) {
    const data = event.context.params ?? {}
    result.params = await validateSection(request.params(), data, errors, 'params')
  }

  if (Object.keys(errors).length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      data: { message: 'Validation failed', errors },
    })
  }

  return result
}

async function validateSection(
  schema: StandardSchemaV1,
  data: unknown,
  errors: ValidationErrors,
  section: Section,
): Promise<unknown> {
  const validation = await schema['~standard'].validate(data)
  if (validation.issues) {
    collectIssues(errors, section, validation.issues)
    return undefined
  }

  return validation.value
}

function collectIssues(errors: ValidationErrors, section: Section, issues: ReadonlyArray<StandardSchemaV1.Issue>): void {
  for (const issue of issues) {
    const path = buildPath(section, issue.path)
    const list = errors[path] ?? []
    list.push(issue.message)
    errors[path] = list
  }
}

function buildPath(section: Section, issuePath: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined): string {
  if (!issuePath || issuePath.length === 0) {
    return section
  }

  const segments = issuePath.map(segment => (typeof segment === 'object' ? String(segment.key) : String(segment)))
  return [section, ...segments].join('.')
}

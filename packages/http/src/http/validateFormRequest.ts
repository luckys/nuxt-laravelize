import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError, getQuery, readBody } from 'h3'
import { Validator } from '@luckys_luis/nuxt-laravelize-validation/runtime'

import type { FormRequest } from './FormRequest'

type Section = 'body' | 'query' | 'params'

type ValidationErrors = Record<string, string[]>

interface ValidationResult {
  body: unknown
  query: unknown
  params: unknown
}

const validator = new Validator()

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
  const validation = await validator.safeValidate(schema, data, { prefix: section })
  if (!validation.success) {
    for (const [field, messages] of Object.entries(validation.errors.all())) errors[field] = [...messages]
    return undefined
  }

  return validation.value
}

import type { StandardSchemaV1 } from '@standard-schema/spec'

export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
}

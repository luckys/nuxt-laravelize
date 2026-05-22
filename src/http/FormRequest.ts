import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'

export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
  authorize?(event: H3Event): boolean | Promise<boolean>
}

import type { StandardSchemaV1 } from '@standard-schema/spec'

import type { FormRequest } from './FormRequest'

type SchemaFor<TRequest, TKey extends 'body' | 'query' | 'params'>
  = TRequest extends Record<TKey, () => infer TSchema>
    ? TSchema extends StandardSchemaV1
      ? StandardSchemaV1.InferOutput<TSchema>
      : undefined
    : undefined

export type ValidatedInput<TRequest extends FormRequest> = {
  body: SchemaFor<TRequest, 'body'>
  query: SchemaFor<TRequest, 'query'>
  params: SchemaFor<TRequest, 'params'>
}

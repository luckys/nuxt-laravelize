export type ValidationResult = boolean | string | undefined
export type Validator<T> = { bivarianceHack(value: T): ValidationResult }['bivarianceHack']

export interface ValueDefinition<T, Required extends boolean = boolean> {
  readonly kind: 'string' | 'integer' | 'number' | 'boolean'
  readonly required: boolean
  readonly description?: string
  readonly defaultValue?: T
  readonly short?: string
  readonly validate?: Validator<T>
  readonly parse: (value: string) => T
  readonly _output?: T
  readonly _required?: Required
}

type FieldOptions<T> = Readonly<{ description?: string, validate?: Validator<T> }>
type RequiredOptions<T> = FieldOptions<T> & Readonly<{ required?: true, default?: never }>
type OptionalOptions<T> = FieldOptions<T> & Readonly<{ required: false, default?: never }>
type DefaultOptions<T> = FieldOptions<T> & Readonly<{ required?: boolean, default: T }>
type OptionFieldOptions<T> = FieldOptions<T> & Readonly<{ short?: string }>
type OptionalOptionOptions<T> = OptionFieldOptions<T> & Readonly<{ default?: never }>
type DefaultOptionOptions<T> = OptionFieldOptions<T> & Readonly<{ default: T }>

function parseInteger(value: string): number {
  if (!/^-?\d+$/.test(value)) throw new TypeError('must be an integer')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new TypeError('must be a safe integer')
  return parsed
}

function parseNumber(value: string): number {
  const parsed = Number(value)
  if (value.trim() === '' || !Number.isFinite(parsed)) throw new TypeError('must be a finite number')
  return parsed
}

function field<T, Required extends boolean>(kind: ValueDefinition<T>['kind'], parse: (value: string) => T, options: FieldOptions<T> & { required?: boolean, default?: T } = {}): ValueDefinition<T, Required> {
  return Object.freeze({ kind, required: options.required ?? options.default === undefined, parse, ...options, ...(options.default !== undefined ? { defaultValue: options.default } : {}) })
}

interface ArgumentFactory<T> {
  (options: OptionalOptions<T>): ValueDefinition<T, false>
  (options: DefaultOptions<T>): ValueDefinition<T, true>
  (options?: RequiredOptions<T>): ValueDefinition<T, true>
}

const argumentString = ((options?: FieldOptions<string> & { required?: boolean, default?: string }) => field('string', value => value, options)) as ArgumentFactory<string>
const argumentInteger = ((options?: FieldOptions<number> & { required?: boolean, default?: number }) => field('integer', parseInteger, options)) as ArgumentFactory<number>
const argumentNumber = ((options?: FieldOptions<number> & { required?: boolean, default?: number }) => field('number', parseNumber, options)) as ArgumentFactory<number>

export const argument = Object.freeze({ string: argumentString, integer: argumentInteger, number: argumentNumber })

interface OptionFactory<T> {
  (options: DefaultOptionOptions<T>): ValueDefinition<T, true>
  (options?: OptionalOptionOptions<T>): ValueDefinition<T, false>
}

const optionString = ((options?: OptionFieldOptions<string> & { default?: string }) => field('string', value => value, { ...options, required: false })) as OptionFactory<string>
const optionInteger = ((options?: OptionFieldOptions<number> & { default?: number }) => field('integer', parseInteger, { ...options, required: false })) as OptionFactory<number>
const optionNumber = ((options?: OptionFieldOptions<number> & { default?: number }) => field('number', parseNumber, { ...options, required: false })) as OptionFactory<number>

export const option = Object.freeze({
  string: optionString,
  integer: optionInteger,
  number: optionNumber,
  boolean: (options: OptionFieldOptions<boolean> & Readonly<{ default?: boolean }> = {}): ValueDefinition<boolean, true> => field('boolean', value => value === 'true', { ...options, required: false, default: options.default ?? false }),
})

export type Schema = Readonly<Record<string, ValueDefinition<unknown, boolean>>>
export type InferSchema<S extends Schema> = { [K in keyof S]: S[K] extends ValueDefinition<infer T, infer Required> ? Required extends true ? T : T | undefined : never }

export function validateValue<T>(name: string, definition: ValueDefinition<T>, value: T): T {
  const result = definition.validate?.(value)
  if (result === false) throw new TypeError(`${name} is invalid`)
  if (typeof result === 'string') throw new TypeError(`${name} ${result}`)
  return value
}

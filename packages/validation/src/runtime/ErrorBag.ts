export type ValidationErrors = Readonly<Record<string, readonly string[]>>

export class ErrorBag {
  readonly #errors: ValidationErrors

  constructor(errors: ValidationErrors = {}) {
    this.#errors = Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, [...messages]]))
  }

  has(field: string): boolean {
    return this.#errors[field] !== undefined
  }

  first(field: string): string | undefined {
    return this.#errors[field]?.[0]
  }

  get(field: string): readonly string[] {
    return this.#errors[field] ?? []
  }

  all(): ValidationErrors {
    return Object.fromEntries(Object.entries(this.#errors).map(([field, messages]) => [field, [...messages]]))
  }

  any(): boolean {
    return Object.keys(this.#errors).length > 0
  }
}

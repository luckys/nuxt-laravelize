import { selectPluralForm } from './pluralize'
import type { TranslationParams, Translator } from './Translator'

export type Dictionary = Readonly<Record<string, string>>
export type Dictionaries = Readonly<Record<string, Dictionary>>

export interface DictionaryTranslatorOptions {
  readonly dictionaries: Dictionaries
  readonly locale?: string
  readonly fallbackLocale?: string
}

const TOKEN = /:([a-z_]\w*)/gi

export class DictionaryTranslator implements Translator {
  readonly #dictionaries: Dictionaries
  readonly #fallbackLocale: string
  #locale: string

  constructor(options: DictionaryTranslatorOptions) {
    this.#dictionaries = options.dictionaries
    this.#locale = options.locale ?? 'en'
    this.#fallbackLocale = options.fallbackLocale ?? 'en'
  }

  locale(): string { return this.#locale }
  setLocale(locale: string): void { this.#locale = locale }

  __(key: string, params?: TranslationParams): string {
    const template = this.#resolve(key) ?? key
    return this.#interpolate(template, params)
  }

  choice(key: string, count: number, params?: TranslationParams): string {
    const template = this.#resolve(key) ?? key
    const picked = selectPluralForm(template, count)
    return this.#interpolate(picked, { count, ...params })
  }

  #resolve(key: string): string | undefined {
    const localeDict = this.#dictionaries[this.#locale]
    if (localeDict !== undefined && key in localeDict) return localeDict[key]
    const fallbackDict = this.#dictionaries[this.#fallbackLocale]
    if (fallbackDict !== undefined && key in fallbackDict) return fallbackDict[key]
    return undefined
  }

  #interpolate(template: string, params: TranslationParams | undefined): string {
    if (params === undefined) return template
    return template.replace(TOKEN, (match: string, name: string) => {
      const value = this.#resolveParam(params, name)
      if (value === undefined) return match
      const str = String(value)
      if (name === name.toUpperCase() && name !== name.toLowerCase()) {
        return str.toUpperCase()
      }
      if (name[0] === name[0]?.toUpperCase() && name[0] !== name[0]?.toLowerCase()) {
        return str.charAt(0).toUpperCase() + str.slice(1)
      }
      return str
    })
  }

  #resolveParam(params: TranslationParams, name: string): string | number | undefined {
    if (Object.prototype.hasOwnProperty.call(params, name)) return params[name]

    const lower = name.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(params, lower)) return params[lower]

    const upper = name.toUpperCase()
    if (Object.prototype.hasOwnProperty.call(params, upper)) return params[upper]

    return undefined
  }
}

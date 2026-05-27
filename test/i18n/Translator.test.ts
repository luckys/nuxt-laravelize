import { describe, expect, it } from 'vitest'

import { DictionaryTranslator } from '../../src/i18n/DictionaryTranslator'
import { selectPluralForm } from '../../src/i18n/pluralize'

describe('selectPluralForm', () => {
  it('returns the template untouched when no | is present', () => {
    expect(selectPluralForm('hello', 5)).toBe('hello')
  })

  it('picks singular vs plural with two segments', () => {
    expect(selectPluralForm('one|many', 1)).toBe('one')
    expect(selectPluralForm('one|many', 2)).toBe('many')
  })

  it('picks zero / one / many with three segments', () => {
    expect(selectPluralForm('none|one|many', 0)).toBe('none')
    expect(selectPluralForm('none|one|many', 1)).toBe('one')
    expect(selectPluralForm('none|one|many', 7)).toBe('many')
  })
})

describe('DictionaryTranslator', () => {
  const dictionaries = {
    en: {
      'greeting': 'Hello :name',
      'invoices.count': 'No invoices|One invoice|:count invoices',
      'shared': 'Shared EN',
    },
    es: {
      'greeting': 'Hola :name',
    },
  }

  it('resolves a key in the current locale', () => {
    const t = new DictionaryTranslator({ dictionaries, locale: 'es' })
    expect(t.__('greeting', { name: 'Ada' })).toBe('Hola Ada')
  })

  it('falls back to the fallbackLocale when the key is missing', () => {
    const t = new DictionaryTranslator({ dictionaries, locale: 'es', fallbackLocale: 'en' })
    expect(t.__('shared')).toBe('Shared EN')
  })

  it('returns the key itself when not found anywhere', () => {
    const t = new DictionaryTranslator({ dictionaries, locale: 'en' })
    expect(t.__('unknown.key')).toBe('unknown.key')
  })

  it('interpolates :params', () => {
    const t = new DictionaryTranslator({ dictionaries, locale: 'en' })
    expect(t.__('greeting', { name: 'World' })).toBe('Hello World')
  })

  it('supports choice() with three-segment pluralisation and :count', () => {
    const t = new DictionaryTranslator({ dictionaries, locale: 'en' })
    expect(t.choice('invoices.count', 0)).toBe('No invoices')
    expect(t.choice('invoices.count', 1)).toBe('One invoice')
    expect(t.choice('invoices.count', 5)).toBe('5 invoices')
  })

  it('setLocale switches the active locale', () => {
    const t = new DictionaryTranslator({ dictionaries, locale: 'en' })
    t.setLocale('es')
    expect(t.locale()).toBe('es')
    expect(t.__('greeting', { name: 'Ada' })).toBe('Hola Ada')
  })
})

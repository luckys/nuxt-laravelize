import type { H3Event } from 'h3'

import type { Translator } from '../../../i18n/Translator'
import { translatorToken } from '../../../i18n/TranslatorToken'
import { useContainer } from '../utils/useContainer'

export function useTranslator(event: H3Event): Translator {
  const container = useContainer(event)
  return container.make(translatorToken)
}

export { translatorToken } from '../../../i18n/TranslatorToken'
export type { Translator, TranslationParams } from '../../../i18n/Translator'

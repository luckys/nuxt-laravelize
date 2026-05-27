import { createToken } from '../core/container/Token'
import type { Translator } from './Translator'

export const translatorToken = createToken<Translator>('laravelize.translator')

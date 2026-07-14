import { createToken } from '../core/container/Token'
import type { Logger } from './Logger'

export const loggerToken = createToken<Logger>('laravelize.logger')

import { createToken } from '../core/container/Token'

import type { Dispatcher } from './Dispatcher'

export const dispatcherToken = createToken<Dispatcher>('laravelize.dispatcher')

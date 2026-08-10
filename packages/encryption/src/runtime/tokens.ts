import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { Encrypter } from './Encrypter'

export const encrypterToken = createToken<Encrypter>('laravelize.encrypter')

import { createToken } from '@nuxt-laravelize/core/runtime'

import type { FilesystemManager } from './FilesystemManager'

export const filesystemManagerToken = createToken<FilesystemManager>('laravelize.filesystemManager')

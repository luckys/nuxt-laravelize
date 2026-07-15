import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { Filesystem } from '../Filesystem'
import type { FilesystemManager } from '../FilesystemManager'
import { filesystemManagerToken } from '../tokens'

export { filesystemManagerToken } from '../tokens'

export function useFilesystemManager(event: H3Event): FilesystemManager {
  return useContainer(event).make(filesystemManagerToken)
}

export function useFilesystem(event: H3Event, disk?: string): Filesystem {
  return useFilesystemManager(event).disk(disk)
}

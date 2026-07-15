import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

import { FilesystemManager } from '../FilesystemManager'
import { InMemoryFilesystem } from '../InMemoryFilesystem'
import { filesystemManagerToken } from '../tokens'

export default class FilesystemServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(filesystemManagerToken)) {
      container.singleton(filesystemManagerToken, () => new FilesystemManager().register('default', new InMemoryFilesystem()))
    }
  }
}

import { loggerToken, type Container, type ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { LogMailer } from '../drivers/LogMailer'
import { mailerToken } from '../tokens'

export default class MailServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(mailerToken, resolver => new LogMailer(resolver.make(loggerToken)))
  }
}

import { useRuntimeConfig } from '#imports'
import { ConsoleLogger, loggerToken, type Container, type ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { auditRecorderToken, auditStoreToken, DisabledAuditStore, InMemoryAuditStore, makeAuditRecorder } from '../index'

export default class AuditServiceProvider implements ServiceProvider {
  register(container: Container): void {
    const logger = () => container.has(loggerToken) ? container.make(loggerToken) : new ConsoleLogger({ threshold: 'warn' })
    if (!container.has(auditStoreToken)) {
      const config = useRuntimeConfig().laravelizeAudit as { driver: 'memory' | 'null', memoryCapacity: number }
      if (config.driver === 'memory') {
        logger().warn('Audit uses bounded volatile memory; records are lost on restart. Configure a durable auditStoreToken provider for production.', { capacity: config.memoryCapacity })
        container.singleton(auditStoreToken, () => new InMemoryAuditStore(config.memoryCapacity))
      }
      else if (config.driver === 'null') {
        logger().warn('Audit persistence is disabled. record() fails closed until a durable auditStoreToken provider or explicit memory driver is configured.')
        container.singleton(auditStoreToken, () => new DisabledAuditStore())
      }
      else throw new TypeError(`Unsupported audit driver: ${String(config.driver)}`)
    }
    container.scoped(auditRecorderToken, (resolver) => {
      const config = useRuntimeConfig().laravelizeAudit as { requireTenantId: boolean }
      return makeAuditRecorder(resolver, resolver.has(loggerToken) ? resolver.make(loggerToken) : new ConsoleLogger({ threshold: 'warn' }), { requireTenantId: config.requireTenantId })
    })
  }
}

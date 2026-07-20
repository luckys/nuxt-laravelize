import routes from '#laravelize/routes'
import { BroadcastEventListener, PrivateChannel, type InMemoryBroadcaster } from '@nuxt-laravelize/broadcasting/runtime'
import { jobRegistryToken } from '@nuxt-laravelize/queue/runtime'
import { ReliableHandlerRegistry, ReliableMessageJob, reliableHandlerRegistryToken } from '@nuxt-laravelize/reliability-queue/runtime'

export default defineEventHandler(async (event) => {
  const channels = useBroadcastChannels(event)
  channels.channel('orders.{orderId}', (_user, { orderId }) => orderId === '42')
  class HealthBroadcast {
    readonly secret = 'must-not-leak'
    broadcastOn() { return new PrivateChannel('orders.42') }
    broadcastAs() { return 'health.checked' }
    broadcastWith() { return { healthy: true } }
  }
  await new BroadcastEventListener(useBroadcasting(event)).handle(new HealthBroadcast())
  const broadcaster = useContainer(event).make(broadcasterToken) as InMemoryBroadcaster
  const broadcast = broadcaster.messages().at(-1)
  const container = useContainer(event)
  const reliableHandlers = container.make(reliableHandlerRegistryToken)
  const reliableJob = container.make(jobRegistryToken).rehydrate({
    version: 1,
    name: ReliableMessageJob.jobName,
    payload: { envelope: { version: 1, id: 'health', type: 'health.checked', occurredAt: new Date().toISOString(), payload: null } },
  })
  return {
    audit: Boolean(useAudit(event)),
    container: Boolean(useContainer(event)),
    cache: Boolean(useCache(event)),
    cacheLock: Boolean(useCacheLock(event, 'health', 60)),
    dispatcher: Boolean(useDispatcher(event)),
    encrypter: Boolean(useEncrypter(event)),
    executionContext: Boolean(useExecutionContext(event)),
    features: Boolean(useFeatures(event)),
    filesystem: Boolean(useFilesystem(event)),
    hasher: Boolean(useHasher(event)),
    queue: Boolean(useQueue(event)),
    mailer: Boolean(useMailer(event)),
    notifications: Boolean(useNotifications(event)),
    urlSigner: Boolean(useUrlSigner(event)),
    validator: Boolean(useValidator(event)),
    rateLimiter: Boolean(useRateLimiter(event)),
    broadcasting: Boolean(useBroadcasting(event)),
    broadcastChannels: (await channels.authorize('orders.42', {}))?.authorized === true,
    eventBridge: broadcast?.event === 'health.checked' && broadcast.payload.healthy === true && !('secret' in broadcast.payload),
    reliableHandlers: reliableHandlers instanceof ReliableHandlerRegistry,
    reliableJobRegistered: reliableJob instanceof ReliableMessageJob,
    route: routes.users.show({ user: 42 }, { query: { preview: true, tags: ['b', 'a'] } }),
  }
})

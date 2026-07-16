import routes from '#laravelize/routes'

export default defineEventHandler((event) => {
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
    route: routes.users.show({ user: 42 }, { query: { preview: true, tags: ['b', 'a'] } }),
  }
})

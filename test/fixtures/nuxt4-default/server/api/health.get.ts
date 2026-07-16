export default defineEventHandler((event) => {
  return {
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
  }
})

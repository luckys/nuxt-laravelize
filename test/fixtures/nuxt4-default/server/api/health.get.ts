export default defineEventHandler((event) => {
  return {
    container: Boolean(useContainer(event)),
    cache: Boolean(useCache(event)),
    cacheLock: Boolean(useCacheLock(event, 'health', 60)),
    dispatcher: Boolean(useDispatcher(event)),
    filesystem: Boolean(useFilesystem(event)),
    queue: Boolean(useQueue(event)),
    mailer: Boolean(useMailer(event)),
    notifications: Boolean(useNotifications(event)),
    urlSigner: Boolean(useUrlSigner(event)),
    rateLimiter: Boolean(useRateLimiter(event)),
  }
})

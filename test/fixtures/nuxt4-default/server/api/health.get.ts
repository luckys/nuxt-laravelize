export default defineEventHandler((event) => {
  return {
    container: Boolean(useContainer(event)),
    cache: Boolean(useCache(event)),
    dispatcher: Boolean(useDispatcher(event)),
    queue: Boolean(useQueue(event)),
    mailer: Boolean(useMailer(event)),
    notifications: Boolean(useNotifications(event)),
    urlSigner: Boolean(useUrlSigner(event)),
    rateLimiter: Boolean(useRateLimiter(event)),
  }
})

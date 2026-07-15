export default defineEventHandler(async (event) => {
  const middleware = new ThrottleRequests(useRateLimiter(event), {
    key: () => 'integration:rate-limit',
    maxAttempts: 2,
    decaySeconds: 60,
  })
  return await middleware.handle(event, async () => ({ allowed: true }))
})

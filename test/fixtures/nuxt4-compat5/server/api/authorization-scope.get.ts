export default defineEventHandler(async (event) => {
  const authorization = useAuthorization(event)
  const decision = await authorization.inspect('health.scope')
  return { requestId: decision.reason, sameService: authorization === useAuthorization(event) }
})

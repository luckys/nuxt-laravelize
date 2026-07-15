export default defineEventHandler(async (event) => {
  const middleware = useContainer(event).make(validateSignatureToken)
  return await middleware.handle(event, async () => ({ valid: true }))
})

export default defineEventHandler(async (event) => {
  const encrypter = useEncrypter(event)
  const payload = getQuery(event).payload
  if (typeof payload === 'string') {
    try {
      return { value: await encrypter.decryptString(payload, { purpose: 'integration' }) }
    }
    catch {
      throw createError({ statusCode: 422, statusMessage: 'Invalid encrypted payload' })
    }
  }
  return { payload: await encrypter.encryptString('secret', { purpose: 'integration' }) }
})

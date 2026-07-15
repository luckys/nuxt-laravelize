export default defineEventHandler(async (event) => {
  return { value: await useCache(event).increment('integration:counter') }
})

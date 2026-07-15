export default defineEventHandler(async (event) => {
  const hasher = useHasher(event)
  const body = await readBody<{ hash?: string, value: string }>(event)
  if (body.hash) return { matches: await hasher.check(body.value, body.hash) }
  return { hash: await hasher.make(body.value) }
})

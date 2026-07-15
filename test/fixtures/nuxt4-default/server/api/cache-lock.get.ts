export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const owner = String(query.owner ?? '')
  const lock = useCacheLock(event, 'integration:lock', 60, owner)
  if (query.action === 'release') return { released: await lock.release() }
  return { acquired: await lock.acquire() }
})

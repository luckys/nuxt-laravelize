export default defineEventHandler(async (event) => {
  const filesystem = useFilesystem(event)
  const path = 'integration/counter.txt'
  const current = await filesystem.exists(path) ? Number(await filesystem.readText(path)) : 0
  const value = current + 1
  await filesystem.write(path, String(value))
  return { value }
})

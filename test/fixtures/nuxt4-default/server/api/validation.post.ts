const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'integration',
    validate(value: unknown) {
      if (typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' && value.name.length >= 3) {
        return { value: { name: value.name.trim() } }
      }
      return { issues: [{ message: 'The name must contain at least three characters.', path: ['name'] }] }
    },
  },
}

export default defineEventHandler(async (event) => {
  const result = await useValidator(event).safeValidate(schema, await readBody(event), { prefix: 'body' })
  if (!result.success) return { valid: false, errors: result.errors.all() }
  return { valid: true, value: result.value }
})

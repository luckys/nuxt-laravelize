export default defineEventHandler(async (event) => {
  const target = new URL('/api/signed-target?download=report', useRuntimeConfig(event).laravelizeHttp.signingOrigin)
  return { url: await useUrlSigner(event).sign(target) }
})

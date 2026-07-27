export default defineEventHandler(async event => ({
  healthy: true,
  translation: (await useServerLocalization(event)).t('nested.only'),
}))

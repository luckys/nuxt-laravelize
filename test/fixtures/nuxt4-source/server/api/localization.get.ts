export default defineEventHandler(async (event) => {
  const localization = await useServerLocalization(event)
  const aliasLocalization = await createServerLocalization('en-US')
  return {
    locale: localization.locale,
    contextLocale: useExecutionContext(event).snapshot().locale,
    greeting: localization.t('greeting', { name: 'Ada' }),
    fallback: localization.t('fallback.only'),
    plural: localization.tc('items', 2),
    regionalFallback: localization.t('regional.only'),
    aliasLocale: aliasLocalization.locale,
    aliasFallback: aliasLocalization.t('fallback.only'),
  }
})

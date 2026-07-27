export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (query.delay) await new Promise(resolve => setTimeout(resolve, Number(query.delay)))
  const localization = await useServerLocalization(event, typeof query.explicit === 'string' ? query.explicit : undefined)
  const contextLocale = useExecutionContext(event).snapshot().locale
  const eventless = await createServerLocalization(contextLocale ?? localization.defaultLocale)
  return {
    locale: localization.locale,
    contextLocale,
    greeting: localization.t('server.greeting', { name: 'Ada' }),
    fallback: localization.t('server.fallbackOnly'),
    plural: localization.tc('apples', 2),
    number: localization.tn(1234.5, { useGrouping: false, minimumFractionDigits: 2 }),
    date: localization.td('2026-01-02T03:04:05.000Z', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }),
    eventless: eventless.t('server.greeting', { name: 'Job' }),
  }
})

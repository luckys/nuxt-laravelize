export default defineEventHandler(async (event) => {
  const observability = useObservability(event)
  await new Promise(resolve => setTimeout(resolve, Number(getQuery(event).delay ?? 0)))
  const serverCarrier = observability.inject()
  const child = observability.startSpan('fixture.handler')
  const childCarrier = observability.withSpan(child, () => observability.inject())
  child.end()
  return { serverCarrier, childCarrier, childTraceId: child.traceId, childSpanId: child.spanId }
})

import { defineEventHandler } from 'h3'

import { counterToken } from '../../shared/providers/CounterProvider'
import { requestIdToken } from '../providers/RequestIdProvider'

export default defineEventHandler((event) => {
  const container = useContainer(event)
  const counter = container.make(counterToken)
  const requestId = container.make(requestIdToken)

  return {
    counterValue: counter.next(),
    requestId,
  }
})

import { createToken } from '../../../src/core/container/Token'
import type { EventSubscriber } from '../../../src/events'

export const userSubscriberToken = createToken<EventSubscriber>('playground.subscriber.user')

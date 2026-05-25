import type { Container } from '../../../src/core/container/Container'
import { dispatcherToken, InMemoryDispatcher } from '../../../src/events'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { AnyEventLoggerListener } from '../listeners/AnyEventLoggerListener'
import { anyEventLoggerToken, logUserRegistrationToken, sendWelcomeEmailToken } from '../listeners/listenerTokens'
import { LogUserRegistrationListener } from '../listeners/LogUserRegistrationListener'
import { SendWelcomeEmailListener } from '../listeners/SendWelcomeEmailListener'
import { EventProbe } from '../services/EventProbe'
import { eventProbeToken } from '../services/probeTokens'
import { userSubscriberToken } from '../subscribers/subscriberTokens'
import { UserSubscriber } from '../subscribers/UserSubscriber'

export default class EventsProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(eventProbeToken, () => new EventProbe())
    container.singleton(dispatcherToken, resolver => new InMemoryDispatcher(resolver))

    container.bind(sendWelcomeEmailToken, resolver => new SendWelcomeEmailListener(resolver.make(eventProbeToken)))
    container.bind(logUserRegistrationToken, resolver => new LogUserRegistrationListener(resolver.make(eventProbeToken)))
    container.bind(anyEventLoggerToken, resolver => new AnyEventLoggerListener(resolver.make(eventProbeToken)))

    container.bind(userSubscriberToken, () => new UserSubscriber())
  }

  boot(container: Container): void {
    const dispatcher = container.make(dispatcherToken)
    dispatcher.subscribe(userSubscriberToken)
  }
}

import type { Dispatcher, EventSubscriber } from '../../../src/events'

import { UserRegistered } from '../events/UserRegistered'
import { anyEventLoggerToken, logUserRegistrationToken, sendWelcomeEmailToken } from '../listeners/listenerTokens'

export class UserSubscriber implements EventSubscriber {
  subscribe(dispatcher: Dispatcher): void {
    dispatcher.listen(UserRegistered, sendWelcomeEmailToken)
    dispatcher.listen(UserRegistered, logUserRegistrationToken)
    dispatcher.listenAny(anyEventLoggerToken)
  }
}

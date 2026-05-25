import { createToken } from '../../../src/core/container/Token'
import type { Listener } from '../../../src/events'

import type { UserRegistered } from '../events/UserRegistered'

export const sendWelcomeEmailToken = createToken<Listener<UserRegistered>>('playground.listener.send-welcome')
export const logUserRegistrationToken = createToken<Listener<UserRegistered>>('playground.listener.log-registration')
export const anyEventLoggerToken = createToken<Listener<unknown>>('playground.listener.any-event')

# @nuxt-laravelize/notifications-mail

Opt-in mail channel joining `@nuxt-laravelize/notifications` and `@nuxt-laravelize/mail` without coupling either base package.

```sh
pnpm add @nuxt-laravelize/notifications-mail @nuxt-laravelize/notifications @nuxt-laravelize/mail
```

Add `@nuxt-laravelize/notifications-mail` to `modules` after configuring a production `Mailer`. Notifications sent through `mail` must implement `toMail()` and resolve recipients only through `routeNotificationFor('mail')`.

```ts
import { Notification } from '@nuxt-laravelize/notifications/runtime'
import type { MailNotificationContent } from '@nuxt-laravelize/notifications-mail/runtime'

class PasswordChanged extends Notification {
  via() { return ['mail'] as const }
  toMail(): MailNotificationContent {
    return { subject: 'Password changed', html: '<p>Your password changed.</p>' }
  }
}
```

Each route entry must be one plain email address. The channel rejects address lists, control characters, empty content, oversized bodies, and excessive recipients or attachments. Notification content cannot override `to`, `cc`, `bcc`, or `replyTo`. Delivery context passes locale, abort signal, and idempotency key to the mailer. Resend can enforce the key; SMTP generally cannot, so queued delivery remains at-least-once at that external boundary.

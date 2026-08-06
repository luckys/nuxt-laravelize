# `@nuxt-laravelize/mail`

[English](./README.md) | Espanol

Mailables, mail manager y transports

## Instalacion

```bash
pnpm add @nuxt-laravelize/mail
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/mail'],
})
```


## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./node` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Mail

`@nuxt-laravelize/mail` ofrece mailables portables y transports de log y compatibles con Resend. Nodemailer esta aislado en `/node`. `useMailer(event)` se autoimporta en Nitro.

```bash
pnpm add @nuxt-laravelize/mail
```

```ts
import { Mailable } from '@nuxt-laravelize/mail/runtime'

class WelcomeMail extends Mailable {
  constructor(private readonly email: string) { super() }
  to() { return this.email }
  from() { return 'team@example.com' }
  subject() { return 'Welcome' }
  render() { return '<h1>Welcome!</h1>' }
  text() { return 'Welcome!' }
  attachments() { return [{ filename: 'guide.txt', content: 'Getting started' }] }
}

await mailer.send(new WelcomeMail('ada@example.com'))
```

| API | Proposito |
|---|---|
| `Mailable.toMessage()` | Construye un `MailMessage` normalizado desde los metodos de la clase. |
| `LogMailer.send()` | Registra mensajes sin entrega externa. |
| `ResendMailer(client, defaultFrom)` | Envia mediante un cliente que implemente `ResendClient`. |
| `NodemailerMailer(transport, defaultFrom)` | Envia con un transport compatible con Nodemailer desde `/node`. |
| `mailerToken` | Resuelve el `Mailer` configurado. |
| `MailFake` | Guarda correos; usa `assertSent()` y `reset()`. |

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#mail). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/notifications`](../notifications/README.es.md), [`@nuxt-laravelize/notifications-mail`](../notifications-mail/README.es.md).

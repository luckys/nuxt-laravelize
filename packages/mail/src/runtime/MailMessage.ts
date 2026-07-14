export interface Attachment {
  readonly filename: string
  readonly content: string | Uint8Array
  readonly contentType?: string
}

export interface MailMessage {
  readonly to: readonly string[]
  readonly from: string | undefined
  readonly subject: string
  readonly html: string
  readonly text: string | undefined
  readonly attachments: readonly Attachment[]
}

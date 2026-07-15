export interface EncryptionOptions {
  readonly purpose?: string
}

export interface Encrypter {
  encryptString(value: string, options?: EncryptionOptions): Promise<string>
  decryptString(payload: string, options?: EncryptionOptions): Promise<string>
  encryptBytes(value: Uint8Array, options?: EncryptionOptions): Promise<string>
  decryptBytes(payload: string, options?: EncryptionOptions): Promise<Uint8Array>
}

export class InvalidEncryptionKeyError extends Error {
  constructor() {
    super('Encryption keys must be base64url-encoded 32-byte values.')
    this.name = 'InvalidEncryptionKeyError'
  }
}

export class DecryptionError extends Error {
  constructor() {
    super('The encrypted payload is invalid or could not be authenticated.')
    this.name = 'DecryptionError'
  }
}

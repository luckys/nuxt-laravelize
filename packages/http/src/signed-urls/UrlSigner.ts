export interface SignedUrlOptions {
  readonly absolute?: boolean
  readonly expiresAt?: Date | number
  readonly method?: string
}

export interface SignatureValidationOptions {
  readonly absolute?: boolean
  readonly method?: string
  readonly now?: Date | number
  readonly requireExpiration?: boolean
}

export interface UrlSigner {
  sign(url: string | URL, options?: SignedUrlOptions): Promise<string>
  hasValidSignature(url: string | URL, options?: SignatureValidationOptions): Promise<boolean>
}

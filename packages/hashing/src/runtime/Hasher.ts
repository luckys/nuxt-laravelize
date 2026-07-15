export interface Hasher {
  make(value: string): Promise<string>
  check(value: string, hash: string): Promise<boolean>
  needsRehash(hash: string): boolean
}

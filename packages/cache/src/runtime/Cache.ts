export type CacheTtl = number | Date

export interface Cache {
  get<T>(key: string, defaultValue?: T): Promise<T | undefined>
  has(key: string): Promise<boolean>
  put<T>(key: string, value: T, ttl?: CacheTtl): Promise<void>
  forever<T>(key: string, value: T): Promise<void>
  add<T>(key: string, value: T, ttl?: CacheTtl): Promise<boolean>
  forget(key: string): Promise<boolean>
  forgetIf<T>(key: string, expected: T): Promise<boolean>
  expireIf?<T>(key: string, expected: T, ttl: CacheTtl): Promise<boolean>
  flush(): Promise<void>
  pull<T>(key: string, defaultValue?: T): Promise<T | undefined>
  remember<T>(key: string, ttl: CacheTtl, factory: () => T | Promise<T>): Promise<T>
  rememberForever<T>(key: string, factory: () => T | Promise<T>): Promise<T>
  increment(key: string, amount?: number, ttl?: CacheTtl): Promise<number>
  decrement(key: string, amount?: number, ttl?: CacheTtl): Promise<number>
}

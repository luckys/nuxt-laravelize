declare const tokenTypeMarker: unique symbol

export interface Token<T> {
  readonly key: string
  readonly [tokenTypeMarker]?: T
}

export function createToken<T>(key: string): Token<T> {
  return { key } as Token<T>
}

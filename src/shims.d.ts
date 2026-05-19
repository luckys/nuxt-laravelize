declare module '#app' {
  export function defineNuxtPlugin<T>(plugin: T): T
  export function useRequestEvent(): { context: Record<string, unknown> } | undefined
}

declare module 'h3' {
  export type H3Event = {
    context: Record<string, unknown>
  }
}

declare module 'nitropack/runtime' {
  export function defineNitroPlugin<T>(plugin: T): T
}

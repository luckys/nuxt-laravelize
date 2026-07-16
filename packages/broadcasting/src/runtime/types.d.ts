declare module '#imports' {
  export function useRuntimeConfig(): {
    laravelizeBroadcasting: { driver: 'fail-closed' | 'memory', memoryCapacity: number }
  }
}

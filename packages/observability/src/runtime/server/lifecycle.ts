import type { Observability } from '../contracts'

/** Attempts each owner lifecycle phase independently without blocking Nitro indefinitely. */
export async function lifecycle(value: Observability, timeout: number): Promise<void> {
  const bounded = async (operation: (() => void | Promise<void>) | undefined): Promise<void> => {
    if (!operation) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutMarker = Symbol('timeout')
    try {
      await Promise.race([Promise.resolve().then(operation), new Promise<typeof timeoutMarker>((resolve) => {
        timer = setTimeout(() => resolve(timeoutMarker), timeout)
      })])
    }
    catch { return }
    finally { if (timer) clearTimeout(timer) }
  }
  await bounded(value.forceFlush?.bind(value))
  await bounded(value.shutdown?.bind(value))
}

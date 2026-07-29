import type { Container } from '@nuxt-laravelize/core/runtime'
import type { JobExecutionDescriptor, SerializedJob } from '@nuxt-laravelize/queue/runtime'

export type JobMiddlewareKey = string | ((job: SerializedJob, scope: Container, descriptor?: JobExecutionDescriptor) => string | Promise<string>)

export async function resolveMiddlewareKey(namespace: string, key: JobMiddlewareKey, job: SerializedJob, scope: Container, descriptor?: JobExecutionDescriptor): Promise<string> {
  const logicalKey = safeIdentifier(typeof key === 'function' ? await key(job, scope, descriptor) : key, 'key')
  const safeNamespace = safeIdentifier(namespace, 'namespace')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([safeNamespace, logicalKey]))))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return `v1:${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

export function safeIdentifier(value: string, label: string): string {
  if (!/^[A-Z0-9][\w.:-]{0,255}$/i.test(value)) throw new TypeError(`Queue middleware ${label} must be a safe identifier of at most 256 characters`)
  return value
}

export function releaseBudget(value = 1000): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) throw new TypeError('Maximum releases must be an integer between 1 and 100000')
  return value
}

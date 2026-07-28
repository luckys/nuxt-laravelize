import { S3UploadConfirmationInProgressError, type S3UploadIssuance, type S3UploadIssuanceStore, type S3UploadReservation } from '@nuxt-laravelize/filesystem-aws'

export interface RedisS3UploadIssuanceClient {
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>
}

export interface RedisS3UploadIssuanceStoreOptions {
  prefix?: string
  /** Primarily useful for deterministic tests. Production should use the secure default. */
  tokenFactory?: () => string
}

const RECORD_VALIDATOR = `local function valid(expected_id)
  local values=redis.call('HMGET',KEYS[1],'version','state','audience','issuance','expiresAt','token')
  local version,state,audience,payload,expires_at,token=values[1],values[2],values[3],values[4],values[5],values[6]
  if version~='1' or audience==false or payload==false or expires_at==false then return false end
  if state=='pending' then if token~=false or redis.call('HLEN',KEYS[1])~=5 then return false end
  elseif state=='reserved' then if token==false or token=='' or redis.call('HLEN',KEYS[1])~=6 then return false end
  else return false end
  local decoded_ok,decoded=pcall(cjson.decode,payload)
  if not decoded_ok or type(decoded)~='table' or type(decoded.id)~='string' or decoded.id~=expected_id or type(decoded.audience)~='string' or decoded.audience~=audience or type(decoded.mimeType)~='string' or type(decoded.policy)~='table' then return false end
  local policy=decoded.policy
  if type(policy.path)~='string' or type(policy.keyPrefix)~='string' or type(policy.maxBytes)~='number' or type(policy.mimeTypes)~='table' or type(policy.actorId)~='string' or type(policy.tenantId)~='string' or type(policy.expiresAt)~='string' or policy.expiresAt~=expires_at then return false end
  return true,state,audience,payload,token
end`

const SAVE = `-- laravelize:s3-upload:save
local time=redis.call('TIME')
local now=(tonumber(time[1])*1000)+math.floor(tonumber(time[2])/1000)
local expires_at=tonumber(ARGV[2])
if not expires_at or expires_at<=now then return {'expired'} end
if redis.call('EXISTS',KEYS[1])==1 then return {'exists'} end
redis.call('HSET',KEYS[1],'version','1','state','pending','audience',ARGV[1],'issuance',ARGV[3],'expiresAt',ARGV[4])
if redis.call('PEXPIREAT',KEYS[1],ARGV[2])~=1 then
  redis.call('DEL',KEYS[1])
  return redis.error_reply('ISSUANCE_EXPIRY_FAILED')
end
return {'saved'}`

const RESERVE = `-- laravelize:s3-upload:reserve
${RECORD_VALIDATOR}
if redis.call('EXISTS',KEYS[1])==0 then return {'missing'} end
local ok,state,stored_audience,payload=valid(ARGV[3])
if not ok then return {'corrupt'} end
if stored_audience~=ARGV[1] then return {'missing'} end
if state=='reserved' then return {'busy'} end
redis.call('HSET',KEYS[1],'state','reserved','token',ARGV[2])
return {'reserved',payload}`

const RELEASE = `-- laravelize:s3-upload:release
${RECORD_VALIDATOR}
if redis.call('EXISTS',KEYS[1])==0 then return {'missing'} end
local ok,state,stored_audience,payload,token=valid(ARGV[2])
if not ok then return {'corrupt'} end
if state~='reserved' or token~=ARGV[1] then return {'stale'} end
redis.call('HSET',KEYS[1],'state','pending')
redis.call('HDEL',KEYS[1],'token')
return {'released'}`

const COMPLETE = `-- laravelize:s3-upload:complete
${RECORD_VALIDATOR}
if redis.call('EXISTS',KEYS[1])==0 then return {'missing'} end
local ok,state,stored_audience,payload,token=valid(ARGV[2])
if not ok then return {'corrupt'} end
if state~='reserved' or token~=ARGV[1] then return {'stale'} end
redis.call('DEL',KEYS[1])
return {'completed'}`

const MAX_PAYLOAD_CHARACTERS = 128 * 1024

export class RedisS3UploadIssuanceStore implements S3UploadIssuanceStore {
  readonly #prefix: string
  readonly #tokenFactory: () => string

  constructor(readonly client: RedisS3UploadIssuanceClient, options: RedisS3UploadIssuanceStoreOptions = {}) {
    this.#prefix = options.prefix ?? 'laravelize:filesystem-aws:issuance:'
    assertPrefix(this.#prefix)
    this.#tokenFactory = options.tokenFactory ?? (() => globalThis.crypto.randomUUID())
  }

  async save(issuance: S3UploadIssuance): Promise<void> {
    assertIssuance(issuance)
    const payload = JSON.stringify(issuance)
    if (payload.length > MAX_PAYLOAD_CHARACTERS) throw new Error('S3 upload issuance payload is too large.')
    const expiresAt = new Date(issuance.policy.expiresAt).getTime()
    const [status] = result(await this.client.eval(SAVE, 1, this.#key(issuance.id), issuance.audience, expiresAt, payload, issuance.policy.expiresAt))
    if (status === 'saved') return
    if (status === 'exists') throw new Error('S3 upload issuance ID already exists.')
    if (status === 'expired') throw new Error('S3 upload issuance is already expired according to Redis time.')
    throw new RedisS3UploadIssuanceCorruptionError('Redis returned an unsupported save result.')
  }

  async reserve(id: string, audience: string): Promise<S3UploadReservation | null> {
    assertId(id)
    assertAudience(audience)
    const token = this.#tokenFactory()
    assertToken(token)
    const [status, payload] = result(await this.client.eval(RESERVE, 1, this.#key(id), audience, token, id))
    if (status === 'missing') return null
    if (status === 'busy') throw new S3UploadConfirmationInProgressError(id)
    if (status === 'corrupt') throw new RedisS3UploadIssuanceCorruptionError()
    if (status !== 'reserved' || payload === undefined) throw new RedisS3UploadIssuanceCorruptionError('Redis returned an unsupported reserve result.')
    const issuance = decodeIssuance(payload)
    if (issuance.id !== id || issuance.audience !== audience) throw new RedisS3UploadIssuanceCorruptionError('Stored issuance identity does not match its Redis record.')
    return Object.freeze({ id, token, issuance })
  }

  async release(reservation: S3UploadReservation): Promise<void> {
    assertId(reservation.id)
    assertToken(reservation.token)
    const [status] = result(await this.client.eval(RELEASE, 1, this.#key(reservation.id), reservation.token, reservation.id))
    if (status === 'released' || status === 'missing' || status === 'stale') return
    if (status === 'corrupt') throw new RedisS3UploadIssuanceCorruptionError()
    throw new RedisS3UploadIssuanceCorruptionError('Redis returned an unsupported release result.')
  }

  async complete(reservation: S3UploadReservation): Promise<void> {
    assertId(reservation.id)
    assertToken(reservation.token)
    const [status] = result(await this.client.eval(COMPLETE, 1, this.#key(reservation.id), reservation.token, reservation.id))
    if (status === 'completed') return
    if (status === 'corrupt') throw new RedisS3UploadIssuanceCorruptionError()
    if (status === 'missing' || status === 'stale') throw new Error('S3 upload reservation is no longer active.')
    throw new RedisS3UploadIssuanceCorruptionError('Redis returned an unsupported complete result.')
  }

  #key(id: string): string { return this.#prefix + id }
}

export class RedisS3UploadIssuanceCorruptionError extends Error {
  constructor(message = 'Stored S3 upload issuance is corrupt.') {
    super(message)
    this.name = 'RedisS3UploadIssuanceCorruptionError'
  }
}

function result(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || value.some(item => typeof item !== 'string' && typeof item !== 'number')) throw new RedisS3UploadIssuanceCorruptionError('Redis returned a malformed script result.')
  return value.map(String)
}

function decodeIssuance(payload: string): S3UploadIssuance {
  if (payload.length > MAX_PAYLOAD_CHARACTERS) throw new RedisS3UploadIssuanceCorruptionError('Stored S3 upload issuance payload is too large.')
  try {
    const value: unknown = JSON.parse(payload)
    assertIssuance(value)
    return Object.freeze({ ...value, policy: Object.freeze({ ...value.policy, mimeTypes: Object.freeze([...value.policy.mimeTypes]), ...(value.policy.checksum ? { checksum: Object.freeze({ ...value.policy.checksum }) } : {}) }) })
  }
  catch (error) {
    if (error instanceof RedisS3UploadIssuanceCorruptionError) throw error
    throw new RedisS3UploadIssuanceCorruptionError('Stored S3 upload issuance payload is malformed.')
  }
}

function assertIssuance(value: unknown): asserts value is S3UploadIssuance {
  if (!plainObject(value) || !exactKeys(value, ['id', 'audience', 'mimeType', 'policy'])) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has an invalid shape.')
  assertId(value.id)
  assertAudience(value.audience)
  if (typeof value.mimeType !== 'string' || value.mimeType.length > 255 || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(value.mimeType)) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has an invalid MIME type.')
  const policy = value.policy
  const policyKeys = ['path', 'keyPrefix', 'maxBytes', 'mimeTypes', 'actorId', 'tenantId', 'expiresAt', ...(plainObject(policy) && 'checksum' in policy ? ['checksum'] : [])]
  if (!plainObject(policy) || !exactKeys(policy, policyKeys) || !safePath(policy.path) || !safePath(policy.keyPrefix) || (policy.path !== policy.keyPrefix && !policy.path.startsWith(`${policy.keyPrefix}/`))) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has an invalid policy.')
  if (!Number.isSafeInteger(policy.maxBytes) || (policy.maxBytes as number) <= 0) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has an invalid byte limit.')
  if (!Array.isArray(policy.mimeTypes) || policy.mimeTypes.length < 1 || policy.mimeTypes.length > 32 || policy.mimeTypes.some(mime => typeof mime !== 'string' || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mime)) || !policy.mimeTypes.includes(value.mimeType)) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has invalid policy MIME types.')
  if (!safeIdentifier(policy.actorId) || !safeIdentifier(policy.tenantId)) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has invalid policy identifiers.')
  const expiresAt = typeof policy.expiresAt === 'string' ? new Date(policy.expiresAt) : new Date(Number.NaN)
  if (!Number.isSafeInteger(expiresAt.getTime()) || expiresAt.toISOString() !== policy.expiresAt) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has an invalid expiry.')
  if ('checksum' in policy && (!plainObject(policy.checksum) || !exactKeys(policy.checksum, ['algorithm', 'value']) || policy.checksum.algorithm !== 'sha256' || typeof policy.checksum.value !== 'string' || !/^[a-f\d]{64}$/i.test(policy.checksum.value))) throw new RedisS3UploadIssuanceCorruptionError('S3 upload issuance has an invalid checksum.')
}

function assertPrefix(prefix: string): void {
  if (typeof prefix !== 'string' || !prefix || prefix.length > 256 || prefix.includes('\0')) throw new Error('Redis S3 upload issuance prefix must be a non-empty string of at most 256 characters without NUL bytes.')
  if (!prefix.endsWith(':')) throw new Error('Redis S3 upload issuance prefix must end with a colon (:).')
}
function assertId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024 || value.includes('\0')) throw new Error('S3 upload issuance ID must be a non-empty string of at most 1024 characters without NUL bytes.')
}
function assertAudience(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 1024 || value.includes('\0')) throw new Error('S3 upload issuance audience must be a string of at most 1024 characters without NUL bytes.')
}
function assertToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\0')) throw new Error('S3 upload reservation token must be a non-empty string of at most 1024 characters without NUL bytes.')
}
function safeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 255 && /^[\x20-\x7E]+$/.test(value)
}
function safePath(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 1024 && !value.startsWith('/') && !value.endsWith('/') && !value.includes('\\') && value.split('/').every(part => Boolean(part) && part !== '.' && part !== '..')
}
function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export interface FakerShim {
  readonly string: {
    uuid(): string
    sample(length?: number): string
    word(): string
  }
  readonly number: {
    int(opts?: { min?: number, max?: number }): number
    float(opts?: { min?: number, max?: number }): number
  }
  readonly date: {
    past(): Date
    recent(): Date
  }
}

export type FakerNow = number | Date | (() => number | Date)

export interface BuiltInFakerOptions {
  seed?: number
  now?: FakerNow
}

const MAX_SEED = 0xFFFFFFFF

export function builtInFaker(seedOrOptions: number | BuiltInFakerOptions = {}): FakerShim {
  const options = typeof seedOrOptions === 'number' ? { seed: seedOrOptions } : seedOrOptions
  const seed = options.seed ?? (Date.now() >>> 0)
  validateSeed(seed)
  const now = createClock(options.now)

  let state = seed >>> 0
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  const intIn = (min: number, max: number): number => Math.floor(min + next() * (max - min + 1))

  const sampleAlphabet = 'abcdefghijklmnopqrstuvwxyz'
  return {
    string: {
      uuid: () => {
        const hex = '0123456789abcdef'
        let out = ''
        for (let i = 0; i < 32; i += 1) out += hex[intIn(0, 15)]
        return `${out.slice(0, 8)}-${out.slice(8, 12)}-7${out.slice(13, 16)}-8${out.slice(17, 20)}-${out.slice(20)}`
      },
      sample: (length = 8) => {
        if (!Number.isInteger(length) || length < 0) {
          throw new Error(`length must be a non-negative integer, got ${length}`)
        }
        let out = ''
        for (let i = 0; i < length; i += 1) out += sampleAlphabet[intIn(0, sampleAlphabet.length - 1)]
        return out
      },
      word: () => sampleAlphabet.slice(intIn(0, 20), intIn(20, 25) + 1),
    },
    number: {
      int: ({ min = 0, max = 100 } = {}) => {
        validateNumberRange(min, max, true)
        return intIn(min, max)
      },
      float: ({ min = 0, max = 1 } = {}) => {
        validateNumberRange(min, max, false)
        return min + next() * (max - min)
      },
    },
    date: {
      past: () => new Date(now() - intIn(1, 365) * 86_400_000),
      recent: () => new Date(now() - intIn(0, 86_400_000)),
    },
  }
}

function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new Error(`seed must be an integer between 0 and ${MAX_SEED}, got ${seed}`)
  }
}

function createClock(now: FakerNow | undefined): () => number {
  if (typeof now === 'function') return () => validTime(now())
  if (now !== undefined) {
    const fixed = validTime(now)
    return () => fixed
  }
  return () => Date.now()
}

function validTime(value: number | Date): number {
  const time = value instanceof Date ? value.getTime() : value
  if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) {
    throw new TypeError('now must be a valid time')
  }
  return time
}

function validateNumberRange(min: number, max: number, integer: boolean): void {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new TypeError('number range bounds must be finite')
  }
  const span = max - min
  if (!Number.isFinite(span)) throw new TypeError('number range span must be finite')
  if (integer && (!Number.isSafeInteger(min) || !Number.isSafeInteger(max))) {
    throw new TypeError('integer range bounds must be safe integers')
  }
  if (integer && !Number.isSafeInteger(span)) {
    throw new TypeError('integer range span must be a safe integer')
  }
  if (min > max) throw new Error('min must be less than or equal to max')
}

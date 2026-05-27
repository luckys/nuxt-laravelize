export interface FakerShim {
  readonly string: {
    uuid(): string
    sample(length?: number): string
    word(): string
  }
  readonly number: {
    int(opts?: { min?: number; max?: number }): number
    float(opts?: { min?: number; max?: number }): number
  }
  readonly date: {
    past(): Date
    recent(): Date
  }
}

export function builtInFaker(seed = Date.now()): FakerShim {
  let state = seed >>> 0
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
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
        let out = ''
        for (let i = 0; i < length; i += 1) out += sampleAlphabet[intIn(0, sampleAlphabet.length - 1)]
        return out
      },
      word: () => sampleAlphabet.slice(intIn(0, 20), intIn(20, 26)),
    },
    number: {
      int: ({ min = 0, max = 100 } = {}) => intIn(min, max),
      float: ({ min = 0, max = 1 } = {}) => min + next() * (max - min),
    },
    date: {
      past: () => new Date(Date.now() - intIn(1, 365) * 86_400_000),
      recent: () => new Date(Date.now() - intIn(0, 86_400_000)),
    },
  }
}

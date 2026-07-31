import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, Job, JobMetadataContributorRegistry, JobRunner, JobSerializer } from '../../src/runtime'
import { QueueFake } from '../../src/runtime/testing'

class PriorityJob extends Job {
  static override readonly priority = 12
  readonly payload = {}
  handle() {}
}

class ReportsJob extends Job {
  static override readonly queue = 'reports'
  readonly payload = {}
  handle() {}
}

class TaggedJob extends Job {
  readonly payload = {}
  constructor(private readonly values: string[]) { super() }
  handle() {}
  override tags() { return this.values }
}

describe('QueueFake priority', () => {
  it('records the effective static priority and push override', async () => {
    const queue = new QueueFake()

    await queue.push(new PriorityJob())
    await queue.push(new PriorityJob(), { priority: 3 })

    expect(queue.pushed.map(item => item.priority)).toEqual([12, 3])
  })

  it('rejects priority values rejected by real drivers', async () => {
    const queue = new QueueFake()

    await expect(queue.push(new PriorityJob(), { priority: -1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
    await expect(queue.push(new PriorityJob(), { priority: 2 ** 21 + 1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
    expect(queue.pushed).toHaveLength(0)
  })
})

describe('QueueFake deduplication', () => {
  it('suppresses matching queue-local pushes and returns the original handle', async () => {
    const queue = new QueueFake()

    const first = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-1' } })
    const duplicate = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-1' } })
    const otherQueue = await queue.push(new PriorityJob(), { queue: 'exports', deduplication: { id: 'report-1' } })

    expect(duplicate).toEqual(first)
    expect(otherQueue).not.toEqual(first)
    expect(queue.pushed).toHaveLength(2)
  })

  it('admits pushes after ttl expiry or explicit clear', async () => {
    vi.useFakeTimers()
    const queue = new QueueFake()

    try {
      const first = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-2', ttl: 100 } })
      await vi.advanceTimersByTimeAsync(100)
      const afterExpiry = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-2', ttl: 100 } })
      await queue.clear('reports')
      const afterClear = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-2' } })

      expect(afterExpiry.id).not.toBe(first.id)
      expect(afterClear.id).not.toBe(afterExpiry.id)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects unsupported or unbounded deduplication metadata', async () => {
    const queue = new QueueFake()
    await expect(queue.push(new PriorityJob(), { deduplication: { id: 'unsafe id' } })).rejects.toThrow('deduplication id must be a safe identifier')
    await expect(queue.push(new PriorityJob(), { deduplication: { id: 'safe', ttl: 86_400_001 } })).rejects.toThrow('deduplication ttl must be an integer between 1 and 86400000')
    await expect(queue.push(new PriorityJob(), { id: 'job-1', deduplication: { id: 'safe' } })).rejects.toThrow('id and deduplication cannot be combined')
    expect(queue.pushed).toHaveLength(0)
  })

  it('actively sweeps ttl reservations with one timer', async () => {
    vi.useFakeTimers()
    const queue = new QueueFake()

    try {
      await Promise.all(Array.from({ length: 50 }, (_, index) => queue.push(new PriorityJob(), {
        deduplication: { id: `report-${index}`, ttl: 100 },
      })))
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })
})

describe('QueueFake recording', () => {
  it('records complete chains without pretending successors were independently pushed', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(PriorityJob.name, PriorityJob)
    registry.register(ReportsJob.name, ReportsJob)
    const serializer = new JobSerializer()
    const admissions: string[] = []
    serializer.contributeAdmission((_job, admission) => {
      admissions.push(admission.queue)
      return { credential: admission.dispatch.id }
    })
    const queue = new QueueFake(serializer, new JobRunner(createContainer(), registry))

    const handle = await queue.chain([
      { job: new PriorityJob(), options: { queue: 'critical' } },
      { job: new ReportsJob() },
    ])

    expect(handle.queue).toBe('critical')
    expect(admissions).toEqual(['critical', 'reports'])
    expect(queue.chains).toHaveLength(1)
    expect(queue.chains[0]?.steps.map(step => step.queue)).toEqual(['critical', 'reports'])
    expect(queue.chains[0]?.steps.every(step => step.serialized.version === 2)).toBe(true)
    expect(queue.pushed).toHaveLength(1)
    expect(queue.pushed[0]?.job).toBeInstanceOf(PriorityJob)
  })

  it('provides final admission facts through an injected serializer', async () => {
    const contributors = new JobMetadataContributorRegistry()
    const queues: string[] = []
    const serializer = new JobSerializer(contributors)
    serializer.contributeAdmission((_job, admission) => {
      queues.push(admission.queue)
      return { credential: admission.dispatch.id }
    })
    const registry = new InMemoryJobRegistry()
    registry.register(PriorityJob.name, PriorityJob)
    registry.register(ReportsJob.name, ReportsJob)
    await expect(new QueueFake(serializer).push(new PriorityJob())).rejects.toThrow('requires a JobRunner')
    const queue = new QueueFake(serializer, new JobRunner(createContainer(), registry))

    await queue.push(new PriorityJob(), { queue: 'critical' })
    await queue.sync(new ReportsJob())

    expect(queues).toEqual(['critical', 'reports'])
    expect(queue.pushed[0]?.serialized).toMatchObject({ metadata: { credential: expect.any(String) } })
  })
  it('records a validated tag snapshot for admitted jobs', async () => {
    const queue = new QueueFake()
    const tags = ['report:one', 'report:one', 'tenant:trusted']
    await queue.push(new TaggedJob(tags))
    tags[0] = 'mutated'

    expect(queue.pushed[0]?.tags).toEqual(['report:one', 'tenant:trusted'])
    expect(queue.pushed[0]?.dispatch).toMatchObject({ version: 1, id: expect.any(String), payloadFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) })
    expect(queue.pushed[0]?.serialized).toMatchObject({ version: 2, metadata: { 'laravelize.queue.dispatch.v1': queue.pushed[0]?.dispatch } })
    await expect(queue.push(new TaggedJob(['unsafe value']))).rejects.toThrow('Job tags must be safe identifiers')
    await expect(queue.later(100, new TaggedJob(['unsafe value']))).rejects.toThrow('Job tags must be safe identifiers')
    await expect(queue.sync(new TaggedJob(['unsafe value']))).rejects.toThrow('Job tags must be safe identifiers')
    expect(queue.pushed).toHaveLength(1)
  })
  it('keeps generated handles unique across full and selective clears', async () => {
    const queue = new QueueFake()
    const first = await queue.push(new PriorityJob(), { queue: 'exports' })
    const second = await queue.push(new ReportsJob())

    await queue.clear('reports')
    const afterSelectiveClear = await queue.push(new ReportsJob())
    await queue.clear()
    const afterFullClear = await queue.push(new PriorityJob(), { queue: 'exports' })

    expect([first.id, second.id, afterSelectiveClear.id, afterFullClear.id]).toEqual(['fake-1', 'fake-2', 'fake-3', 'fake-4'])
  })

  it('counts and clears the effective static queue', async () => {
    const queue = new QueueFake()
    await queue.push(new ReportsJob())
    await queue.push(new PriorityJob(), { queue: 'exports' })

    await expect(queue.size('reports')).resolves.toBe(1)
    await queue.clear('reports')
    expect(queue.pushed.map(item => item.queue)).toEqual(['exports'])
  })

  it('does not treat an empty queue name as every queue', async () => {
    const queue = new QueueFake()
    await queue.push(new PriorityJob(), { queue: '' })
    await queue.push(new ReportsJob())

    await expect(queue.size('')).resolves.toBe(1)
    await queue.clear('')
    expect(queue.pushed.map(item => item.queue)).toEqual(['reports'])
  })
})

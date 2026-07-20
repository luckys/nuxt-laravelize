import { sql } from 'drizzle-orm'
import type { ClaimOptions, StoredMessage } from '@nuxt-laravelize/reliability'
import { DrizzleReliabilityStore } from './base.js'

export class DrizzlePostgresReliabilityStore extends DrizzleReliabilityStore {
  protected async claimOutbox(o: ClaimOptions): Promise<StoredMessage[]> {
    const filter = o.types?.length ? sql`and message_type in (${sql.join(o.types.map(type => sql`${type}`), sql`, `)})` : sql``
    const excluded = o.excludeIds?.length ? sql`and id not in (${sql.join(o.excludeIds.map(id => sql`${id}`), sql`, `)})` : sql``
    return this.map(await this.database.execute(sql`with candidates as (select kind, id from reliability_messages where kind = 'outbox' ${filter} ${excluded} and ((state = 'pending' and available_at <= ${o.now}) or (state = 'processing' and lease_until <= ${o.now})) order by available_at, id limit ${o.limit} for update skip locked) update reliability_messages m set state = 'processing', attempts = attempts + 1, lease_owner = ${o.owner}, lease_token = ${o.token} || ':' || m.id, lease_until = ${o.leaseUntil} from candidates where m.kind = candidates.kind and m.id = candidates.id returning m.envelope, m.state, m.attempts, m.available_at, m.lease_owner, m.lease_token, m.lease_until, m.last_error`))
  }
}

import { sql } from 'drizzle-orm'
import type { ClaimOptions, StoredMessage } from '@luckys_luis/nuxt-laravelize-reliability'
import { DrizzleReliabilityStore } from './base.js'

export class DrizzleSQLiteReliabilityStore extends DrizzleReliabilityStore {
  protected async claimOutbox(o: ClaimOptions): Promise<StoredMessage[]> {
    const filter = o.types?.length ? sql`and message_type in (${sql.join(o.types.map(type => sql`${type}`), sql`, `)})` : sql``
    const excluded = o.excludeIds?.length ? sql`and id not in (${sql.join(o.excludeIds.map(id => sql`${id}`), sql`, `)})` : sql``
    return this.map(await this.database.execute(sql`update reliability_messages set state = 'processing', attempts = attempts + 1, lease_owner = ${o.owner}, lease_token = ${o.token} || ':' || id, lease_until = ${o.leaseUntil} where kind = 'outbox' and id in (select id from reliability_messages where kind = 'outbox' ${filter} ${excluded} and ((state = 'pending' and available_at <= ${o.now}) or (state = 'processing' and lease_until <= ${o.now})) order by available_at, id limit ${o.limit}) returning envelope, state, attempts, available_at, lease_owner, lease_token, lease_until, last_error`))
  }
}

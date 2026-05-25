import { defineEventHandler, getQuery } from 'h3'

import { SimplePaginator } from '../../../src/pagination/SimplePaginator'
import { UserResource } from '../resources/UserResource'

const USERS = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
  { id: 'user-3', email: 'alan@example.com', name: 'Alan Turing' },
  { id: 'user-4', email: 'donald@example.com', name: 'Donald Knuth' },
  { id: 'user-5', email: 'edsger@example.com', name: 'Edsger Dijkstra' },
  { id: 'user-6', email: 'barbara@example.com', name: 'Barbara Liskov' },
] as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(Number(query.page ?? 1), 1)
  const perPage = 3
  const start = (page - 1) * perPage
  const slice = USERS.slice(start, start + perPage + 1).map(u => ({ ...u }))
  const hasMore = slice.length > perPage
  const items = slice.slice(0, perPage)
  const paginator = new SimplePaginator(items, perPage, page, hasMore)
  const pc = UserResource.collection(paginator)
  return await pc.toArray(event)
})

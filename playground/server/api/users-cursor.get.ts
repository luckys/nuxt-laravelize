import { defineEventHandler } from 'h3'

import { CursorPaginator, decodeCursor } from '../../../src/pagination/CursorPaginator'
import { parseCursorParams } from '../../../src/pagination/extractParams'
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
  const { cursor, perPage } = parseCursorParams(event)
  let startIndex = 0
  if (cursor) {
    const payload = decodeCursor(cursor)
    const idx = USERS.findIndex(u => u.id === payload.key)
    startIndex = idx >= 0 ? idx + 1 : 0
  }
  const slice = USERS.slice(startIndex, startIndex + perPage).map(u => ({ ...u }))
  const nextKey = startIndex + perPage < USERS.length ? slice[slice.length - 1]?.id ?? null : null
  const paginator = CursorPaginator.fromRequest(event, slice, nextKey, null)
  const pc = UserResource.collection(paginator)
  return await pc.toArray(event)
})

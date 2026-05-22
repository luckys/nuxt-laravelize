import { defineEventHandler, getRequestHeader } from 'h3'

export default defineEventHandler((event) => {
  const role = getRequestHeader(event, 'x-user-role')
  if (role) {
    event.context.user = { role }
  }
})

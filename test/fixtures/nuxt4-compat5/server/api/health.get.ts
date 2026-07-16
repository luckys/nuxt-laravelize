import routes from '#laravelize/routes'

export default defineEventHandler((event) => {
  return {
    audit: Boolean(useAudit(event)),
    container: Boolean(useContainer(event)),
    dispatcher: Boolean(useDispatcher(event)),
    executionContext: Boolean(useExecutionContext(event)),
    queue: Boolean(useQueue(event)),
    mailer: Boolean(useMailer(event)),
    notifications: Boolean(useNotifications(event)),
    route: routes.users.show({ user: 42 }, { query: { preview: true, tags: ['b', 'a'] } }),
  }
})

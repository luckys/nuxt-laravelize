export default defineEventHandler((event) => {
  return {
    container: Boolean(useContainer(event)),
    dispatcher: Boolean(useDispatcher(event)),
    executionContext: Boolean(useExecutionContext(event)),
    queue: Boolean(useQueue(event)),
    mailer: Boolean(useMailer(event)),
    notifications: Boolean(useNotifications(event)),
  }
})

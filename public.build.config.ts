import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  clean: false,
  declaration: 'node16',
  failOnWarn: false,
  entries: [
    'src/public-testing',
    'src/compat/core',
    'src/compat/events',
    'src/compat/queue',
    'src/compat/mail',
    'src/compat/notifications',
    'src/compat/http',
    'src/compat/database',
  ],
  rollup: { emitCJS: false },
})

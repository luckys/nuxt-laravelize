import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const packageNames = [
  'agent-sdk',
  'agents-cloudflare',
  'agents-flue',
  'ai-sdk',
  'audit',
  'audit-drizzle',
  'authorization',
  'broadcasting',
  'broadcasting-pusher',
  'cache',
  'cache-redis',
  'core',
  'database',
  'database-drizzle',
  'encryption',
  'events',
  'events-queue',
  'execution-context',
  'execution-context-queue',
  'filesystem',
  'filesystem-aws',
  'filesystem-cloudflare',
  'http',
  'idempotency',
  'idempotency-drizzle',
  'hashing',
  'mail',
  'notifications',
  'observability',
  'observability-otel',
  'observability-queue',
  'pennant',
  'scout',
  'scout-drizzle',
  'nuxt',
  'queue',
  'queue-bullmq',
  'rate-limiter',
  'reliability',
  'reliability-drizzle',
  'reliability-queue',
  'routes',
  'scheduler',
  'testing',
  'validation',
  'webhooks',
  'workflows',
  'workflows-drizzle',
  'workflows-reliability',
  'workflows-queue',
]

const tarballDirectory = resolve('.pack')
const tarballs = readdirSync(tarballDirectory)
const nuxtVersion = installedVersion('nuxt')
const typescriptVersion = installedVersion('typescript')
const vueTscVersion = installedVersion('vue-tsc', 'playground/node_modules')
const aiVersion = installedVersion('ai', 'packages/ai-sdk/node_modules')
const zodVersion = installedVersion('zod', 'packages/ai-sdk/node_modules')
const agentsVersion = installedVersion('agents', 'packages/agents-cloudflare/node_modules')
const flueRuntimeVersion = installedVersion('@flue/runtime', 'packages/agents-flue/node_modules')
const flueSdkVersion = installedVersion('@flue/sdk', 'packages/agents-flue/node_modules')
const dependencies = Object.fromEntries(packageNames.map((name) => {
  const { version } = JSON.parse(readFileSync(resolve('packages', name, 'package.json'), 'utf8'))
  const suffix = `nuxt-laravelize-${name}-${version}.tgz`
  const tarball = tarballs.find(file => file === suffix)
  if (!tarball) throw new Error(`Missing tarball: ${suffix}`)
  return [`@nuxt-laravelize/${name}`, `file:${join(tarballDirectory, tarball)}`]
}))

const featureDependencies = Object.fromEntries(Object.entries(dependencies).filter(([name]) => name !== '@nuxt-laravelize/scheduler'))

verifyTarballBin('reliability', 'dist/bin/outbox-work.mjs')
verifyTarballBin('webhooks', 'dist/bin/webhook-work.mjs')
verifyTarballBin('queue-bullmq', 'dist/bin/queue-work.mjs')
verifyTarballBin('workflows-reliability', 'dist/bin/workflow-wake-reconcile.mjs')

runFixture('features', {
  ...featureDependencies,
  'ai': aiVersion,
  'agents': agentsVersion,
  '@flue/runtime': flueRuntimeVersion,
  '@flue/sdk': flueSdkVersion,
  'nuxt': nuxtVersion,
  'zod': zodVersion,
}, featureDependencies, [
  '@nuxt-laravelize/agent-sdk',
  '@nuxt-laravelize/agent-sdk/runtime',
  '@nuxt-laravelize/agent-sdk/runtime/server',
  '@nuxt-laravelize/agent-sdk/testing',
  '@nuxt-laravelize/agents-cloudflare',
  '@nuxt-laravelize/agents-flue',
  '@nuxt-laravelize/audit',
  '@nuxt-laravelize/authorization/runtime',
  '@nuxt-laravelize/authorization/runtime/server',
  '@nuxt-laravelize/authorization/testing',
  '@nuxt-laravelize/audit/runtime',
  '@nuxt-laravelize/audit/runtime/server',
  '@nuxt-laravelize/audit/testing',
  '@nuxt-laravelize/audit-drizzle',
  '@nuxt-laravelize/audit-drizzle/postgres',
  '@nuxt-laravelize/audit-drizzle/sqlite',
  '@nuxt-laravelize/audit-drizzle/turso',
  '@nuxt-laravelize/ai-sdk',
  '@nuxt-laravelize/ai-sdk/runtime',
  '@nuxt-laravelize/ai-sdk/runtime/server',
  '@nuxt-laravelize/ai-sdk/testing',
  '@nuxt-laravelize/broadcasting',
  '@nuxt-laravelize/broadcasting/runtime',
  '@nuxt-laravelize/broadcasting/testing',
  '@nuxt-laravelize/broadcasting-pusher',
  '@nuxt-laravelize/core',
  '@nuxt-laravelize/cache/runtime',
  '@nuxt-laravelize/cache/testing',
  '@nuxt-laravelize/cache-redis',
  '@nuxt-laravelize/core/runtime',
  '@nuxt-laravelize/core/kit',
  '@nuxt-laravelize/core/testing',
  '@nuxt-laravelize/database-drizzle',
  '@nuxt-laravelize/encryption/runtime',
  '@nuxt-laravelize/events/runtime',
  '@nuxt-laravelize/events/testing',
  '@nuxt-laravelize/execution-context/runtime',
  '@nuxt-laravelize/execution-context/runtime/server',
  '@nuxt-laravelize/execution-context/testing',
  '@nuxt-laravelize/execution-context-queue/runtime',
  '@nuxt-laravelize/queue/runtime',
  '@nuxt-laravelize/queue/testing',
  '@nuxt-laravelize/queue-bullmq/runtime',
  '@nuxt-laravelize/rate-limiter/runtime',
  '@nuxt-laravelize/reliability',
  '@nuxt-laravelize/reliability/testing',
  '@nuxt-laravelize/reliability-drizzle',
  '@nuxt-laravelize/reliability-drizzle/postgres',
  '@nuxt-laravelize/reliability-drizzle/sqlite',
  '@nuxt-laravelize/reliability-drizzle/turso',
  '@nuxt-laravelize/reliability-queue',
  '@nuxt-laravelize/reliability-queue/runtime',
  '@nuxt-laravelize/routes',
  '@nuxt-laravelize/routes/runtime',
  '@nuxt-laravelize/routes/kit',
  '@nuxt-laravelize/events-queue/runtime',
  '@nuxt-laravelize/filesystem/runtime',
  '@nuxt-laravelize/filesystem/node',
  '@nuxt-laravelize/filesystem/testing',
  '@nuxt-laravelize/filesystem-aws',
  '@nuxt-laravelize/filesystem-cloudflare',
  '@nuxt-laravelize/mail/runtime',
  '@nuxt-laravelize/mail/node',
  '@nuxt-laravelize/mail/testing',
  '@nuxt-laravelize/notifications/runtime',
  '@nuxt-laravelize/notifications/testing',
  '@nuxt-laravelize/observability/runtime',
  '@nuxt-laravelize/observability/runtime/server',
  '@nuxt-laravelize/observability/testing',
  '@nuxt-laravelize/observability-otel',
  '@nuxt-laravelize/observability-otel/runtime/server',
  '@nuxt-laravelize/observability-queue',
  '@nuxt-laravelize/pennant/runtime',
  '@nuxt-laravelize/scout/runtime',
  '@nuxt-laravelize/scout-drizzle',
  '@nuxt-laravelize/scout-drizzle/postgres',
  '@nuxt-laravelize/scout-drizzle/sqlite',
  '@nuxt-laravelize/scout-drizzle/turso',
  '@nuxt-laravelize/http/runtime',
  '@nuxt-laravelize/idempotency',
  '@nuxt-laravelize/idempotency/runtime',
  '@nuxt-laravelize/idempotency-drizzle',
  '@nuxt-laravelize/idempotency-drizzle/postgres',
  '@nuxt-laravelize/idempotency-drizzle/sqlite',
  '@nuxt-laravelize/idempotency-drizzle/turso',
  '@nuxt-laravelize/hashing/runtime',
  '@nuxt-laravelize/database/runtime',
  '@nuxt-laravelize/testing',
  '@nuxt-laravelize/validation/runtime',
  '@nuxt-laravelize/nuxt',
  '@nuxt-laravelize/webhooks',
  '@nuxt-laravelize/webhooks/testing',
  '@nuxt-laravelize/workflows',
  '@nuxt-laravelize/workflows-drizzle',
  '@nuxt-laravelize/workflows-drizzle/postgres',
  '@nuxt-laravelize/workflows-drizzle/sqlite',
  '@nuxt-laravelize/workflows-drizzle/turso',
  '@nuxt-laravelize/workflows-reliability',
  '@nuxt-laravelize/workflows-queue',
  '@nuxt-laravelize/workflows-queue/runtime',
], ['@nuxt-laravelize/scheduler', 'nitro'], {
  requiredExports: {
    '@nuxt-laravelize/agent-sdk/runtime': ['AgentRuntimeRegistry', 'AgentSdkClient', 'agentClientToken', 'agentRuntimesToken', 'defineAgent'],
    '@nuxt-laravelize/agent-sdk/runtime/server': ['useAgentRuntime'],
    '@nuxt-laravelize/agent-sdk/testing': ['AgentFake'],
    '@nuxt-laravelize/agents-cloudflare': ['CloudflareAgentRuntime', 'AgentClient', 'agentFetch'],
    '@nuxt-laravelize/agents-flue': ['FlueAgentRuntime', 'createFlueClient', 'defineFlueAgent', 'defineFlueWorkflow'],
    '@nuxt-laravelize/audit/runtime': ['DefaultAuditRecorder', 'InMemoryAuditStore', 'auditRecorderToken', 'auditStoreToken'],
    '@nuxt-laravelize/authorization/runtime': ['Authorization', 'AuthorizationRegistry', 'authorizationToken', 'principalResolverToken', 'allow', 'deny', 'trustQueuePrincipal'],
    '@nuxt-laravelize/authorization/runtime/server': ['useAuthorization'],
    '@nuxt-laravelize/authorization/testing': ['AuthorizationFake'],
    '@nuxt-laravelize/audit/runtime/server': ['useAudit'],
    '@nuxt-laravelize/audit/testing': ['AuditFake'],
    '@nuxt-laravelize/audit-drizzle': ['DrizzlePostgresAuditStore', 'DrizzleSQLiteAuditStore', 'TursoAuditStore'],
    '@nuxt-laravelize/ai-sdk/runtime': ['AiConnectionRegistry', 'AiSdkClient', 'aiClientToken', 'aiConnectionsToken', 'defineAgent'],
    '@nuxt-laravelize/ai-sdk/runtime/server': ['useAi'],
    '@nuxt-laravelize/ai-sdk/testing': ['AiFake'],
    '@nuxt-laravelize/broadcasting/runtime': ['BroadcastingManager', 'ChannelRegistry', 'PublicChannel', 'PrivateChannel', 'PresenceChannel', 'broadcasterToken'],
    '@nuxt-laravelize/broadcasting/testing': ['BroadcastFake'],
    '@nuxt-laravelize/broadcasting-pusher': ['PusherBroadcaster'],
    '@nuxt-laravelize/testing': ['BroadcastFake'],
    '@nuxt-laravelize/cache/runtime': ['CacheLock', 'InMemoryCache', 'LockTimeoutError', 'cacheToken'],
    '@nuxt-laravelize/cache-redis': ['RedisCache', 'JsonCacheSerializer', 'CacheCorruptionError'],
    '@nuxt-laravelize/core/runtime': ['createContainer', 'loggerFor'],
    '@nuxt-laravelize/database/runtime': ['transactionManagerToken', 'createTransactionManagerToken'],
    '@nuxt-laravelize/database-drizzle': ['DrizzleTransactionManager', 'DrizzleSyncTransactionManager'],
    '@nuxt-laravelize/encryption/runtime': ['AesGcmEncrypter', 'DecryptionError', 'encrypterToken', 'generateEncryptionKey'],
    '@nuxt-laravelize/events/runtime': ['dispatcherToken'],
    '@nuxt-laravelize/execution-context/runtime': ['ExecutionContext', 'executionContextToken', 'withExecutionContext'],
    '@nuxt-laravelize/execution-context/runtime/server': ['useExecutionContext'],
    '@nuxt-laravelize/execution-context/testing': ['ExecutionContextBuilder', 'fakeExecutionContext'],
    '@nuxt-laravelize/filesystem/runtime': ['FilesystemManager', 'InMemoryFilesystem', 'filesystemManagerToken'],
    '@nuxt-laravelize/filesystem/node': ['LocalFilesystem'],
    '@nuxt-laravelize/filesystem/testing': ['FilesystemFake'],
    '@nuxt-laravelize/filesystem-aws': ['AwsS3Filesystem', 'createAwsS3Filesystem'],
    '@nuxt-laravelize/filesystem-cloudflare': ['CloudflareR2Filesystem'],
    '@nuxt-laravelize/queue/runtime': ['queueToken'],
    '@nuxt-laravelize/rate-limiter/runtime': ['RateLimiter', 'rateLimiterToken'],
    '@nuxt-laravelize/reliability': ['createEnvelope', 'OutboxProcessor', 'InboxConsumer', 'OutboxMessageConflictError', 'isPrunableReliabilityStore', 'normalizeReliabilityPruneOptions'],
    '@nuxt-laravelize/reliability/testing': ['InMemoryReliabilityStore', 'OutboxStoreFake', 'InboxStoreFake'],
    '@nuxt-laravelize/reliability-drizzle': ['DrizzlePostgresReliabilityStore', 'DrizzleSQLiteReliabilityStore'],
    '@nuxt-laravelize/reliability-drizzle/postgres': ['DrizzlePostgresReliabilityStore'],
    '@nuxt-laravelize/reliability-drizzle/sqlite': ['DrizzleSQLiteReliabilityStore'],
    '@nuxt-laravelize/reliability-drizzle/turso': ['TursoReliabilityStore'],
    '@nuxt-laravelize/reliability-queue/runtime': ['ReliableHandlerRegistry', 'ReliableMessageJob', 'createQueueOutboxDelivery'],
    '@nuxt-laravelize/routes': ['default'],
    '@nuxt-laravelize/routes/runtime': ['defineRoutes', 'route'],
    '@nuxt-laravelize/routes/kit': ['addRoutesDeclaration'],
    '@nuxt-laravelize/mail/runtime': ['mailerToken'],
    '@nuxt-laravelize/notifications/runtime': ['notificationManagerToken'],
    '@nuxt-laravelize/observability/runtime': ['noopObservability', 'observe', 'observabilityToken'],
    '@nuxt-laravelize/observability/testing': ['ObservabilityFake'],
    '@nuxt-laravelize/observability-otel': ['OtelObservability'],
    '@nuxt-laravelize/observability-queue': ['installQueueObservability'],
    '@nuxt-laravelize/pennant/runtime': ['FeatureManager', 'InMemoryFeatureStore', 'featureManagerToken'],
    '@nuxt-laravelize/scout/runtime': ['ScoutManager', 'InMemorySearchEngine', 'scoutManagerToken'],
    '@nuxt-laravelize/scout-drizzle': ['DrizzlePostgresSearchEngine', 'registerDrizzlePostgresDriver', 'scoutDocuments'],
    '@nuxt-laravelize/scout-drizzle/postgres': ['DrizzlePostgresSearchEngine', 'registerDrizzlePostgresDriver'],
    '@nuxt-laravelize/scout-drizzle/sqlite': ['DrizzleSQLiteSearchEngine', 'registerDrizzleSQLiteDriver', 'sqliteScoutDocuments'],
    '@nuxt-laravelize/scout-drizzle/turso': ['TursoLibSQLSearchEngine', 'registerTursoDriver'],
    '@nuxt-laravelize/http/runtime': ['Policy', 'DefaultPolicyRegistry', 'policyRegistryToken', 'discoverPoliciesByConvention', 'HmacUrlSigner', 'ValidateSignature', 'urlSignerToken'],
    '@nuxt-laravelize/idempotency/runtime': ['IdempotencyMiddleware', 'InMemoryIdempotencyStore', 'createIdempotencyMiddleware', 'idempotencyStoreToken'],
    '@nuxt-laravelize/idempotency-drizzle': ['DrizzlePostgresIdempotencyStore', 'DrizzleSQLiteIdempotencyStore', 'TursoIdempotencyStore'],
    '@nuxt-laravelize/hashing/runtime': ['Pbkdf2Hasher', 'hasherToken'],
    '@nuxt-laravelize/validation/runtime': ['ErrorBag', 'ValidationError', 'Validator', 'validatorToken'],
    '@nuxt-laravelize/webhooks': ['OutgoingWebhookProcessor', 'WebhookInboxReceiver', 'assertSafeWebhookUrl', 'signWebhook', 'verifyWebhook'],
    '@nuxt-laravelize/webhooks/testing': ['WebhookTransportFake'],
    '@nuxt-laravelize/workflows': ['WorkflowManager', 'WorkflowRegistry', 'InMemoryWorkflowStore', 'WorkflowExecutionAbortedError', 'WorkflowLeaseLostError', 'defineWorkflow', 'defineStep', 'isRecoverableWorkflowStore'],
    '@nuxt-laravelize/workflows-drizzle': ['DrizzlePostgresWorkflowStore', 'DrizzleSQLiteWorkflowStore', 'TursoWorkflowStore'],
    '@nuxt-laravelize/workflows-reliability': ['TransactionalWorkflowStore', 'WorkflowWakeReconciler', 'WorkflowWakeReconciliationWorker', 'createWorkflowWakeHandler', 'registerWorkflowWakeHandler', 'workflowWakeMessageType'],
    '@nuxt-laravelize/workflows-reliability/cli': ['parseWorkflowWakeReconciliationArgs', 'runWorkflowWakeReconciliationCli', 'WORKFLOW_WAKE_RECONCILIATION_HELP'],
    '@nuxt-laravelize/workflows-queue/runtime': ['WorkflowCoordinator', 'WorkflowJob', 'workflowCoordinatorToken', 'workflowRegistryToken', 'workflowStoreToken'],
  },
  workerBins: [
    ['@nuxt-laravelize/reliability', 'dist/bin/outbox-work.mjs'],
    ['@nuxt-laravelize/webhooks', 'dist/bin/webhook-work.mjs'],
    ['@nuxt-laravelize/queue-bullmq', 'dist/bin/queue-work.mjs'],
    ['@nuxt-laravelize/workflows-reliability', 'dist/bin/workflow-wake-reconcile.mjs'],
  ],
  workflowWakeCli: true,
})

runFixture('preset-default', {
  '@nuxt-laravelize/nuxt': dependencies['@nuxt-laravelize/nuxt'],
  '@nuxt-laravelize/queue': dependencies['@nuxt-laravelize/queue'],
  '@nuxt-laravelize/reliability-queue': dependencies['@nuxt-laravelize/reliability-queue'],
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'vue-tsc': vueTscVersion,
}, featureDependencies, ['@nuxt-laravelize/nuxt'], ['@nuxt-laravelize/cache-redis', '@nuxt-laravelize/agent-sdk', '@nuxt-laravelize/agents-cloudflare', '@nuxt-laravelize/agents-flue', '@nuxt-laravelize/ai-sdk', '@nuxt-laravelize/audit-drizzle', '@nuxt-laravelize/broadcasting-pusher', '@nuxt-laravelize/database-drizzle', '@nuxt-laravelize/filesystem-aws', '@nuxt-laravelize/filesystem-cloudflare', '@nuxt-laravelize/idempotency', '@nuxt-laravelize/idempotency-drizzle', '@nuxt-laravelize/reliability-drizzle', '@nuxt-laravelize/queue-bullmq', '@nuxt-laravelize/scheduler', '@nuxt-laravelize/webhooks', '@nuxt-laravelize/workflows', '@nuxt-laravelize/workflows-drizzle', '@nuxt-laravelize/workflows-queue', 'agents', '@flue/runtime', '@flue/sdk', 'ai', 'bullmq', 'drizzle-orm', 'nitro'], {
  requiredExports: { '@nuxt-laravelize/nuxt': ['default'] },
  buildNuxt: true,
})

runFixture('preset-compat5', {
  '@nuxt-laravelize/nuxt': dependencies['@nuxt-laravelize/nuxt'],
  '@nuxt-laravelize/queue': dependencies['@nuxt-laravelize/queue'],
  '@nuxt-laravelize/reliability-queue': dependencies['@nuxt-laravelize/reliability-queue'],
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'vue-tsc': vueTscVersion,
}, featureDependencies, ['@nuxt-laravelize/nuxt'], ['@nuxt-laravelize/agent-sdk', '@nuxt-laravelize/agents-cloudflare', '@nuxt-laravelize/agents-flue', '@nuxt-laravelize/ai-sdk', '@nuxt-laravelize/audit-drizzle', '@nuxt-laravelize/broadcasting-pusher', '@nuxt-laravelize/database-drizzle', '@nuxt-laravelize/filesystem-aws', '@nuxt-laravelize/filesystem-cloudflare', '@nuxt-laravelize/idempotency', '@nuxt-laravelize/idempotency-drizzle', '@nuxt-laravelize/reliability-drizzle', '@nuxt-laravelize/queue-bullmq', '@nuxt-laravelize/scheduler', '@nuxt-laravelize/webhooks', '@nuxt-laravelize/workflows', '@nuxt-laravelize/workflows-drizzle', '@nuxt-laravelize/workflows-queue', 'agents', '@flue/runtime', '@flue/sdk', 'ai', 'bullmq', 'drizzle-orm', 'nitro'], {
  requiredExports: { '@nuxt-laravelize/nuxt': ['default'] },
  buildNuxt: true,
  compatibilityVersion: 5,
})

runFixture('scheduler-core', {
  '@nuxt-laravelize/scheduler': dependencies['@nuxt-laravelize/scheduler'],
}, {
  '@nuxt-laravelize/scheduler': dependencies['@nuxt-laravelize/scheduler'],
}, ['@nuxt-laravelize/scheduler'], ['nitro', 'nuxt'])

runFixture('scheduler-nitro3', {
  '@nuxt-laravelize/scheduler': dependencies['@nuxt-laravelize/scheduler'],
  'nitro': '3.0.260610-beta',
}, {
  '@nuxt-laravelize/scheduler': dependencies['@nuxt-laravelize/scheduler'],
}, ['@nuxt-laravelize/scheduler/nitro3'])

function runFixture(name, fixtureDependencies, overrides, imports, absentPackages = [], options = {}) {
  if (name.startsWith('preset-')) absentPackages = [...absentPackages, '@nuxt-laravelize/observability-otel', '@nuxt-laravelize/observability-queue']
  const fixture = mkdtempSync(join(tmpdir(), `nuxt-laravelize-${name}-`))
  try {
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      private: true,
      type: 'module',
      packageManager: 'pnpm@10.28.2',
      dependencies: fixtureDependencies,
    }, null, 2))

    writeFileSync(join(fixture, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - \'.\'',
      'overrides:',
      ...Object.entries(overrides).map(([packageName, tarball]) => `  '${packageName}': '${tarball}'`),
      'allowBuilds:',
      '  \'@parcel/watcher\': true',
      '  esbuild: true',
      '  msgpackr-extract: true',
      '',
    ].join('\n'))

    writeFileSync(join(fixture, 'smoke.mjs'), [
      `const specifiers = ${JSON.stringify(imports)}`,
      `const requiredExports = ${JSON.stringify(options.requiredExports ?? {})}`,
      'const modules = await Promise.all(specifiers.map(specifier => import(specifier)))',
      'for (const [index, module] of modules.entries()) {',
      '  for (const name of requiredExports[specifiers[index]] ?? []) {',
      '    if (!(name in module)) throw new Error(`${specifiers[index]} does not export ${name}`)',
      '  }',
      '}',
      '',
    ].join('\n'))

    if (options.buildNuxt) {
      writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({ extends: './.nuxt/tsconfig.json' }, null, 2))
      writeFileSync(join(fixture, 'nuxt.config.ts'), [
        'import Laravelize from \'@nuxt-laravelize/nuxt\'',
        '',
        'export default {',
        '  compatibilityDate: \'2026-07-01\',',
        '  modules: [Laravelize],',
        '  laravelizeHttp: { baseURL: \'/api\', signingKey: \'package-smoke-signing-key-32-bytes\', signingOrigin: \'http://127.0.0.1\' },',
        '  laravelizeEncryption: { key: \'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\' },',
        '  laravelizeHashing: { iterations: 10000 },',
        '  laravelizeBroadcasting: { driver: \'memory\', memoryCapacity: 10 },',
        '  laravelizeRoutes: { baseURL: \'/api\' },',
        '  i18n: {',
        '    locales: [{ code: \'en\', iso: \'en-US\', dir: \'ltr\' }],',
        '    defaultLocale: \'en\',',
        '    strategy: \'no_prefix\',',
        '    translationDir: \'locales\',',
        '    disablePageLocales: true,',
        '    autoDetectLanguage: false,',
        '    redirects: false,',
        '  },',
        ...(options.compatibilityVersion ? [`  future: { compatibilityVersion: ${options.compatibilityVersion} },`] : []),
        '}',
        '',
      ].join('\n'))
      mkdirSync(join(fixture, 'app'), { recursive: true })
      writeFileSync(join(fixture, 'routes.ts'), [
        'import { route } from \'@nuxt-laravelize/routes/runtime\'',
        '',
        'export default { users: { show: route(\'GET\', \'/users/{user}/{section?}\') } } as const',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'app', 'app.vue'), [
        '<script setup lang="ts">',
        'const { data } = await useHttp<{ message: string }>(\'/http-client\')',
        'const { $t } = useI18n()',
        '</script>',
        '',
        '<template>',
        '  <main>{{ data?.message }} {{ $t(\'welcome\', { name: \'Laravelize\' }) }}</main>',
        '</template>',
        '',
      ].join('\n'))
      mkdirSync(join(fixture, 'locales'), { recursive: true })
      writeFileSync(join(fixture, 'locales', 'en.json'), JSON.stringify({
        welcome: 'Translated with $t for {name}',
      }, null, 2))
      mkdirSync(join(fixture, 'server', 'api'), { recursive: true })
      writeFileSync(join(fixture, 'server', 'api', 'health.get.ts'), [
        'import { jobRegistryToken } from \'@nuxt-laravelize/queue/runtime\'',
        'import { ReliableMessageJob, reliableHandlerRegistryToken } from \'@nuxt-laravelize/reliability-queue/runtime\'',
        '',
        'export default defineEventHandler(async (event) => ({',
        '  audit: Boolean(useAudit(event)),',
        '  authorization: Boolean(useAuthorization(event)),',
        '  container: Boolean(event.context.laravelizeContainer),',
        '  cache: Boolean(useCache(event)),',
        '  cacheLock: Boolean(useCacheLock(event, \'smoke\', 60)),',
        '  dispatcher: Boolean(useDispatcher(event)),',
        '  broadcasting: Boolean(useBroadcasting(event)),',
        '  broadcastChannels: Boolean(useBroadcastChannels(event)),',
        '  encrypter: Boolean(useEncrypter(event)),',
        '  executionContext: Boolean(useExecutionContext(event)),',
        '  filesystem: Boolean(useFilesystem(event)),',
        '  hasher: Boolean(useHasher(event)),',
        '  queue: Boolean(useQueue(event)),',
        '  mailer: Boolean(useMailer(event)),',
        '  notifications: Boolean(useNotifications(event)),',
        '  observability: Boolean(useObservability(event)),',
        '  scout: Boolean(useScout(event)),',
        '  urlSigner: Boolean(useUrlSigner(event)),',
        '  validator: Boolean(useValidator(event)),',
        '  rateLimiter: Boolean(useRateLimiter(event)),',
        '  reliableHandlers: typeof event.context.laravelizeContainer!.make(reliableHandlerRegistryToken).register === \'function\',',
        '  reliableJobRegistered: event.context.laravelizeContainer!.make(jobRegistryToken).rehydrate({ version: 1, name: ReliableMessageJob.jobName, payload: { envelope: { version: 1, id: \'smoke\', type: \'health.checked\', occurredAt: new Date().toISOString(), payload: null } } }).constructor.jobName === ReliableMessageJob.jobName,',
        '  route: (await import(\'#laravelize/routes\')).default.users.show({ user: 42 }, { query: { preview: true } }),',
        '  signedUrl: await useUrlSigner(event).sign(new URL(\'/api/signed-target?scope=smoke\', useRuntimeConfig(event).laravelizeHttp.signingOrigin)),',
        '}))',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'server', 'api', 'http-client.get.ts'), [
        'export default defineEventHandler(() => ({ message: \'Fetched with useHttp\' }))',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'server', 'api', 'signed-target.get.ts'), [
        'export default defineEventHandler(async (event) => {',
        '  const middleware = new ValidateSignature(useUrlSigner(event), {',
        '    origin: useRuntimeConfig(event).laravelizeHttp.signingOrigin,',
        '  })',
        '  return await middleware.handle(event, async () => ({ valid: true }))',
        '})',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'runtime-smoke.mjs'), [
        'import { spawn } from \'node:child_process\'',
        'import { once } from \'node:events\'',
        '',
        'const port = 40000 + Math.floor(Math.random() * 10000)',
        'const server = spawn(process.execPath, [\'.output/server/index.mjs\'], {',
        '  env: { ...process.env, HOST: \'127.0.0.1\', PORT: String(port) },',
        '  stdio: [\'ignore\', \'pipe\', \'pipe\'],',
        '})',
        'let diagnostics = \'\'',
        'server.stdout.on(\'data\', chunk => { diagnostics += chunk })',
        'server.stderr.on(\'data\', chunk => { diagnostics += chunk })',
        '',
        'try {',
        '  let response',
        '  for (let attempt = 0; attempt < 50; attempt++) {',
        '    if (server.exitCode !== null) throw new Error(diagnostics)',
        '    try {',
        '      response = await fetch(`http://127.0.0.1:${port}/api/health`)',
        '      if (response.ok) break',
        '    } catch {}',
        '    await new Promise(resolve => setTimeout(resolve, 100))',
        '  }',
        '  if (!response?.ok) throw new Error(`Nuxt server did not become ready. ${diagnostics}`)',
        '  const health = await response.json()',
        '  for (const service of [\'audit\', \'authorization\', \'container\', \'cache\', \'cacheLock\', \'dispatcher\', \'broadcasting\', \'broadcastChannels\', \'encrypter\', \'executionContext\', \'filesystem\', \'hasher\', \'queue\', \'mailer\', \'notifications\', \'observability\', \'scout\', \'urlSigner\', \'rateLimiter\', \'validator\', \'reliableHandlers\', \'reliableJobRegistered\']) {',
        '    if (health[service] !== true) throw new Error(`Missing runtime service: ${service}`)',
        '  }',
        '  if (!response.headers.get(\'x-correlation-id\')) throw new Error(\'Missing correlation response header\')',
        '  if (health.route?.method !== \'GET\' || health.route?.url !== \'/api/users/42?preview=1\') throw new Error(\'Preset did not generate typed routes\')',
        '  const signed = new URL(health.signedUrl)',
        '  const localSignedUrl = `http://127.0.0.1:${port}${signed.pathname}${signed.search}`',
        '  const signedResponse = await fetch(localSignedUrl)',
        '  const signedBody = await signedResponse.text()',
        '  if (!signedResponse.ok || !JSON.parse(signedBody).valid) {',
        '    throw new Error(`Signed URL was not accepted (${signedResponse.status}): ${signedBody}; source=${health.signedUrl}`)',
        '  }',
        '  const tamperedResponse = await fetch(localSignedUrl.replace(\'scope=smoke\', \'scope=tampered\'))',
        '  if (tamperedResponse.status !== 403) throw new Error(\'Tampered signed URL was not rejected\')',
        '  const html = await fetch(`http://127.0.0.1:${port}/`).then(result => result.text())',
        '  if (!html.includes(\'Fetched with useHttp\')) throw new Error(\'useHttp SSR response was not rendered\')',
        '  if (!html.includes(\'Translated with $t for Laravelize\')) throw new Error(\'nuxt-i18n-micro SSR translation was not rendered\')',
        '} finally {',
        '  server.kill()',
        '  if (server.exitCode === null) await once(server, \'exit\')',
        '}',
        '',
      ].join('\n'))
    }

    execFileSync('pnpm', ['install'], { cwd: fixture, stdio: 'inherit' })
    for (const packageName of absentPackages) {
      if (existsSync(join(fixture, 'node_modules', ...packageName.split('/')))) {
        throw new Error(`${name} unexpectedly installed ${packageName}`)
      }
    }
    execFileSync(process.execPath, ['smoke.mjs'], { cwd: fixture, stdio: 'inherit' })
    for (const [packageName, bin] of options.workerBins ?? []) {
      execFileSync(process.execPath, [join(fixture, 'node_modules', ...packageName.split('/'), bin), '--help'], { cwd: fixture, stdio: 'inherit' })
    }
    if (options.workflowWakeCli) {
      const marker = join(fixture, 'workflow-wake-cli.marker')
      const config = join(fixture, 'workflow-wake-reconciliation.config.mjs')
      writeFileSync(config, [
        'import { appendFileSync } from \'node:fs\'',
        `const marker = ${JSON.stringify(marker)}`,
        'export default {',
        '  worker: {',
        '    async runOnce() { appendFileSync(marker, \'run\\n\') },',
        '    async run() {}, async stop() {}, async drain() {},',
        '  },',
        '  close() { appendFileSync(marker, \'close\\n\') },',
        '}',
        '',
      ].join('\n'))
      execFileSync(process.execPath, [join(fixture, 'node_modules', '@nuxt-laravelize', 'workflows-reliability', 'dist/bin/workflow-wake-reconcile.mjs'), '--once', '--config', config], { cwd: fixture, stdio: 'inherit' })
      if (readFileSync(marker, 'utf8') !== 'run\nclose\n') throw new Error('workflow wake CLI did not run and close from the packed install')
    }
    if (options.buildNuxt) {
      execFileSync('pnpm', ['exec', 'nuxt', 'typecheck'], { cwd: fixture, stdio: 'inherit' })
      execFileSync('pnpm', ['exec', 'nuxt', 'build'], { cwd: fixture, stdio: 'inherit' })
      execFileSync(process.execPath, ['runtime-smoke.mjs'], { cwd: fixture, stdio: 'inherit' })
    }
  }
  finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

function installedVersion(packageName, directory = 'node_modules') {
  return JSON.parse(readFileSync(resolve(directory, packageName, 'package.json'), 'utf8')).version
}

function verifyTarballBin(packageName, binPath) {
  const { version } = JSON.parse(readFileSync(resolve('packages', packageName, 'package.json'), 'utf8'))
  const tarball = resolve(tarballDirectory, `nuxt-laravelize-${packageName}-${version}.tgz`)
  const entry = `package/${binPath}`
  const listing = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' }).split('\n')
  if (!listing.includes(entry)) throw new Error(`${packageName} tarball is missing ${entry}`)
  const contents = execFileSync('tar', ['-xOf', tarball, entry], { encoding: 'utf8' })
  if (!contents.startsWith('#!/usr/bin/env node\n')) throw new Error(`${entry} is missing its Node shebang`)
}

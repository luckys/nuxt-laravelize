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
  'authorization-queue',
  'broadcasting',
  'broadcasting-pusher',
  'cache',
  'cache-redis',
  'console',
  'core',
  'database',
  'database-drizzle',
  'database-queue',
  'dead-letter',
  'dead-letter-operations',
  'encryption',
  'events',
  'events-queue',
  'execution-context',
  'execution-context-queue',
  'filesystem',
  'filesystem-aws',
  'filesystem-aws-redis',
  'filesystem-cloudflare',
  'http',
  'idempotency',
  'idempotency-drizzle',
  'hashing',
  'mail',
  'migrations',
  'migrations-drizzle',
  'notifications',
  'notifications-broadcast',
  'notifications-database',
  'notifications-database-drizzle',
  'notifications-mail',
  'notifications-queue',
  'notifications-webhook',
  'observability',
  'observability-otel',
  'observability-queue',
  'pennant',
  'scout',
  'scout-drizzle',
  'nuxt',
  'queue',
  'queue-bullmq',
  'queue-middleware',
  'rate-limiter',
  'reliability',
  'reliability-drizzle',
  'reliability-queue',
  'routes',
  'scheduler',
  'scheduler-nuxt',
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
  const { name: packageName, version } = JSON.parse(readFileSync(resolve('packages', name, 'package.json'), 'utf8'))
  const tarballName = `${packageName.slice(1).replace('/', '-')}-${version}.tgz`
  const tarball = tarballs.find(file => file === tarballName)
  if (!tarball) throw new Error(`Missing tarball: ${tarballName}`)
  return [packageName, `file:${join(tarballDirectory, tarball)}`]
}))

const featureDependencies = Object.fromEntries(Object.entries(dependencies).filter(([name]) => name !== '@luckys_luis/nuxt-laravelize-scheduler' && name !== '@luckys_luis/nuxt-laravelize-scheduler-nuxt'))

verifyTarballBin('reliability', 'dist/bin/outbox-work.mjs')
verifyTarballBin('webhooks', 'dist/bin/webhook-work.mjs')
verifyTarballBin('queue-bullmq', 'dist/bin/queue-work.mjs')
verifyTarballBin('workflows-reliability', 'dist/bin/workflow-wake-reconcile.mjs')
verifyTarballEntry('nuxt', 'dist/public-server.mjs', ['ServerLocalization', 'createServerLocalization', 'useServerLocalization'])

runFixture('features', {
  ...featureDependencies,
  'ai': aiVersion,
  'agents': agentsVersion,
  '@flue/runtime': flueRuntimeVersion,
  '@flue/sdk': flueSdkVersion,
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'zod': zodVersion,
}, featureDependencies, [
  '@luckys_luis/nuxt-laravelize-agent-sdk',
  '@luckys_luis/nuxt-laravelize-agent-sdk/runtime',
  '@luckys_luis/nuxt-laravelize-agent-sdk/runtime/server',
  '@luckys_luis/nuxt-laravelize-agent-sdk/testing',
  '@luckys_luis/nuxt-laravelize-agents-cloudflare',
  '@luckys_luis/nuxt-laravelize-agents-flue',
  '@luckys_luis/nuxt-laravelize-audit',
  '@luckys_luis/nuxt-laravelize-authorization/runtime',
  '@luckys_luis/nuxt-laravelize-authorization/runtime/server',
  '@luckys_luis/nuxt-laravelize-authorization/testing',
  '@luckys_luis/nuxt-laravelize-authorization-queue',
  '@luckys_luis/nuxt-laravelize-authorization-queue/runtime',
  '@luckys_luis/nuxt-laravelize-audit/runtime',
  '@luckys_luis/nuxt-laravelize-audit/runtime/server',
  '@luckys_luis/nuxt-laravelize-audit/testing',
  '@luckys_luis/nuxt-laravelize-audit-drizzle',
  '@luckys_luis/nuxt-laravelize-audit-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-audit-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-audit-drizzle/turso',
  '@luckys_luis/nuxt-laravelize-audit-drizzle/migrations',
  '@luckys_luis/nuxt-laravelize-ai-sdk',
  '@luckys_luis/nuxt-laravelize-ai-sdk/runtime',
  '@luckys_luis/nuxt-laravelize-ai-sdk/runtime/server',
  '@luckys_luis/nuxt-laravelize-ai-sdk/testing',
  '@luckys_luis/nuxt-laravelize-broadcasting',
  '@luckys_luis/nuxt-laravelize-broadcasting/runtime',
  '@luckys_luis/nuxt-laravelize-broadcasting/testing',
  '@luckys_luis/nuxt-laravelize-broadcasting-pusher',
  '@luckys_luis/nuxt-laravelize-core',
  '@luckys_luis/nuxt-laravelize-cache/runtime',
  '@luckys_luis/nuxt-laravelize-cache/testing',
  '@luckys_luis/nuxt-laravelize-cache-redis',
  '@luckys_luis/nuxt-laravelize-console',
  '@luckys_luis/nuxt-laravelize-console/node',
  '@luckys_luis/nuxt-laravelize-console/testing',
  '@luckys_luis/nuxt-laravelize-core/runtime',
  '@luckys_luis/nuxt-laravelize-core/kit',
  '@luckys_luis/nuxt-laravelize-core/testing',
  '@luckys_luis/nuxt-laravelize-database-drizzle',
  '@luckys_luis/nuxt-laravelize-database-queue',
  '@luckys_luis/nuxt-laravelize-dead-letter',
  '@luckys_luis/nuxt-laravelize-dead-letter/testing',
  '@luckys_luis/nuxt-laravelize-dead-letter-operations',
  '@luckys_luis/nuxt-laravelize-dead-letter-operations/runtime',
  '@luckys_luis/nuxt-laravelize-dead-letter-operations/runtime/server',
  '@luckys_luis/nuxt-laravelize-encryption/runtime',
  '@luckys_luis/nuxt-laravelize-events/runtime',
  '@luckys_luis/nuxt-laravelize-events/testing',
  '@luckys_luis/nuxt-laravelize-execution-context/runtime',
  '@luckys_luis/nuxt-laravelize-execution-context/runtime/server',
  '@luckys_luis/nuxt-laravelize-execution-context/testing',
  '@luckys_luis/nuxt-laravelize-execution-context-queue/runtime',
  '@luckys_luis/nuxt-laravelize-queue/runtime',
  '@luckys_luis/nuxt-laravelize-queue/testing',
  '@luckys_luis/nuxt-laravelize-queue-bullmq/runtime',
  '@luckys_luis/nuxt-laravelize-queue-middleware',
  '@luckys_luis/nuxt-laravelize-queue-middleware/runtime',
  '@luckys_luis/nuxt-laravelize-rate-limiter/runtime',
  '@luckys_luis/nuxt-laravelize-reliability',
  '@luckys_luis/nuxt-laravelize-reliability/testing',
  '@luckys_luis/nuxt-laravelize-reliability-drizzle',
  '@luckys_luis/nuxt-laravelize-reliability-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-reliability-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-reliability-drizzle/turso',
  '@luckys_luis/nuxt-laravelize-reliability-drizzle/migrations',
  '@luckys_luis/nuxt-laravelize-reliability-queue',
  '@luckys_luis/nuxt-laravelize-reliability-queue/runtime',
  '@luckys_luis/nuxt-laravelize-routes',
  '@luckys_luis/nuxt-laravelize-routes/runtime',
  '@luckys_luis/nuxt-laravelize-routes/kit',
  '@luckys_luis/nuxt-laravelize-events-queue/runtime',
  '@luckys_luis/nuxt-laravelize-filesystem/runtime',
  '@luckys_luis/nuxt-laravelize-filesystem/node',
  '@luckys_luis/nuxt-laravelize-filesystem/testing',
  '@luckys_luis/nuxt-laravelize-filesystem-aws',
  '@luckys_luis/nuxt-laravelize-filesystem-aws-redis',
  '@luckys_luis/nuxt-laravelize-filesystem-cloudflare',
  '@luckys_luis/nuxt-laravelize-mail/runtime',
  '@luckys_luis/nuxt-laravelize-mail/node',
  '@luckys_luis/nuxt-laravelize-mail/testing',
  '@luckys_luis/nuxt-laravelize-notifications/runtime',
  '@luckys_luis/nuxt-laravelize-notifications/testing',
  '@luckys_luis/nuxt-laravelize-notifications-broadcast',
  '@luckys_luis/nuxt-laravelize-notifications-broadcast/runtime',
  '@luckys_luis/nuxt-laravelize-notifications-database',
  '@luckys_luis/nuxt-laravelize-notifications-database/runtime',
  '@luckys_luis/nuxt-laravelize-notifications-database/runtime/server',
  '@luckys_luis/nuxt-laravelize-notifications-database-drizzle',
  '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/migrations',
  '@luckys_luis/nuxt-laravelize-notifications-mail',
  '@luckys_luis/nuxt-laravelize-notifications-mail/runtime',
  '@luckys_luis/nuxt-laravelize-notifications-queue',
  '@luckys_luis/nuxt-laravelize-notifications-queue/runtime',
  '@luckys_luis/nuxt-laravelize-notifications-webhook',
  '@luckys_luis/nuxt-laravelize-notifications-webhook/runtime',
  '@luckys_luis/nuxt-laravelize-observability/runtime',
  '@luckys_luis/nuxt-laravelize-observability/runtime/server',
  '@luckys_luis/nuxt-laravelize-observability/testing',
  '@luckys_luis/nuxt-laravelize-observability-otel',
  '@luckys_luis/nuxt-laravelize-observability-otel/runtime/server',
  '@luckys_luis/nuxt-laravelize-observability-queue',
  '@luckys_luis/nuxt-laravelize-pennant/runtime',
  '@luckys_luis/nuxt-laravelize-scout/runtime',
  '@luckys_luis/nuxt-laravelize-scout-drizzle',
  '@luckys_luis/nuxt-laravelize-scout-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-scout-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-scout-drizzle/turso',
  '@luckys_luis/nuxt-laravelize-scout-drizzle/migrations',
  '@luckys_luis/nuxt-laravelize-http/runtime',
  '@luckys_luis/nuxt-laravelize-idempotency',
  '@luckys_luis/nuxt-laravelize-idempotency/runtime',
  '@luckys_luis/nuxt-laravelize-idempotency-drizzle',
  '@luckys_luis/nuxt-laravelize-idempotency-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-idempotency-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-idempotency-drizzle/turso',
  '@luckys_luis/nuxt-laravelize-idempotency-drizzle/migrations',
  '@luckys_luis/nuxt-laravelize-migrations',
  '@luckys_luis/nuxt-laravelize-migrations/console',
  '@luckys_luis/nuxt-laravelize-migrations/testing',
  '@luckys_luis/nuxt-laravelize-migrations-drizzle',
  '@luckys_luis/nuxt-laravelize-migrations-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-migrations-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-migrations-drizzle/sources',
  '@luckys_luis/nuxt-laravelize-migrations-drizzle/testing',
  '@luckys_luis/nuxt-laravelize-hashing/runtime',
  '@luckys_luis/nuxt-laravelize-database/runtime',
  '@luckys_luis/nuxt-laravelize-testing',
  '@luckys_luis/nuxt-laravelize-validation/runtime',
  '@luckys_luis/nuxt-laravelize',
  '@luckys_luis/nuxt-laravelize-webhooks',
  '@luckys_luis/nuxt-laravelize-webhooks/testing',
  '@luckys_luis/nuxt-laravelize-workflows',
  '@luckys_luis/nuxt-laravelize-workflows-drizzle',
  '@luckys_luis/nuxt-laravelize-workflows-drizzle/postgres',
  '@luckys_luis/nuxt-laravelize-workflows-drizzle/sqlite',
  '@luckys_luis/nuxt-laravelize-workflows-drizzle/turso',
  '@luckys_luis/nuxt-laravelize-workflows-drizzle/migrations',
  '@luckys_luis/nuxt-laravelize-workflows-reliability',
  '@luckys_luis/nuxt-laravelize-workflows-queue',
  '@luckys_luis/nuxt-laravelize-workflows-queue/runtime',
], ['@luckys_luis/nuxt-laravelize-scheduler', 'nitro'], {
  requiredExports: {
    '@luckys_luis/nuxt-laravelize-agent-sdk/runtime': ['AgentRuntimeRegistry', 'AgentSdkClient', 'agentClientToken', 'agentRuntimesToken', 'defineAgent'],
    '@luckys_luis/nuxt-laravelize-agent-sdk/runtime/server': ['useAgentRuntime'],
    '@luckys_luis/nuxt-laravelize-agent-sdk/testing': ['AgentFake'],
    '@luckys_luis/nuxt-laravelize-agents-cloudflare': ['CloudflareAgentRuntime', 'AgentClient', 'agentFetch'],
    '@luckys_luis/nuxt-laravelize-agents-flue': ['FlueAgentRuntime', 'createFlueClient', 'defineFlueAgent', 'defineFlueWorkflow'],
    '@luckys_luis/nuxt-laravelize-audit/runtime': ['DefaultAuditRecorder', 'InMemoryAuditStore', 'auditRecorderToken', 'auditStoreToken'],
    '@luckys_luis/nuxt-laravelize-authorization/runtime': ['Authorization', 'AuthorizationRegistry', 'authorizationToken', 'principalResolverToken', 'allow', 'deny', 'trustQueuePrincipal'],
    '@luckys_luis/nuxt-laravelize-authorization/runtime/server': ['useAuthorization'],
    '@luckys_luis/nuxt-laravelize-authorization/testing': ['AuthorizationFake'],
    '@luckys_luis/nuxt-laravelize-authorization-queue': ['default'],
    '@luckys_luis/nuxt-laravelize-authorization-queue/runtime': ['QUEUE_DELEGATION_METADATA_KEY', 'QueueAuthorizationUnavailableError', 'QueueDelegationDeniedError', 'QueueDelegationUnavailableError', 'RequireAuthorization', 'installQueueDelegation'],
    '@luckys_luis/nuxt-laravelize-audit/runtime/server': ['useAudit'],
    '@luckys_luis/nuxt-laravelize-audit/testing': ['AuditFake'],
    '@luckys_luis/nuxt-laravelize-audit-drizzle': ['DrizzlePostgresAuditStore', 'DrizzleSQLiteAuditStore', 'TursoAuditStore'],
    '@luckys_luis/nuxt-laravelize-audit-drizzle/migrations': ['migrationSourceFor'],
    '@luckys_luis/nuxt-laravelize-ai-sdk/runtime': ['AiConnectionRegistry', 'AiSdkClient', 'aiClientToken', 'aiConnectionsToken', 'defineAgent'],
    '@luckys_luis/nuxt-laravelize-ai-sdk/runtime/server': ['useAi'],
    '@luckys_luis/nuxt-laravelize-ai-sdk/testing': ['AiFake'],
    '@luckys_luis/nuxt-laravelize-broadcasting/runtime': ['BroadcastingManager', 'ChannelRegistry', 'PublicChannel', 'PrivateChannel', 'PresenceChannel', 'broadcasterToken'],
    '@luckys_luis/nuxt-laravelize-broadcasting/testing': ['BroadcastFake'],
    '@luckys_luis/nuxt-laravelize-broadcasting-pusher': ['PusherBroadcaster'],
    '@luckys_luis/nuxt-laravelize-testing': ['BroadcastFake'],
    '@luckys_luis/nuxt-laravelize-cache/runtime': ['CacheLock', 'InMemoryCache', 'LockTimeoutError', 'atomicFixedWindowCacheCapability', 'cacheToken', 'isAtomicFixedWindowCache'],
    '@luckys_luis/nuxt-laravelize-cache-redis': ['RedisCache', 'JsonCacheSerializer', 'CacheCorruptionError'],
    '@luckys_luis/nuxt-laravelize-console': ['CommandRegistry', 'ConsoleRunner', 'defineCommand'],
    '@luckys_luis/nuxt-laravelize-console/node': ['runNodeConsole'],
    '@luckys_luis/nuxt-laravelize-console/testing': ['FakeProcess', 'FakePrompt', 'FakeTerminal'],
    '@luckys_luis/nuxt-laravelize-core/runtime': ['createContainer', 'loggerFor'],
    '@luckys_luis/nuxt-laravelize-database/runtime': ['Factory', 'DefaultFactoryRegistry', 'builtInFaker', 'recycle', 'transactionManagerToken', 'createTransactionManagerToken'],
    '@luckys_luis/nuxt-laravelize-database-drizzle': ['DrizzleTransactionManager', 'DrizzleSyncTransactionManager'],
    '@luckys_luis/nuxt-laravelize-database-queue': ['AfterCommitQueueDispatchError', 'dispatchAfterCommit'],
    '@luckys_luis/nuxt-laravelize-dead-letter': ['DeadLetterManager', 'DeadLetterAdapterRegistry', 'DEAD_LETTER_ABILITIES'],
    '@luckys_luis/nuxt-laravelize-dead-letter/testing': ['MemoryDeadLetterAdapter', 'MemoryDeadLetterOperationStore'],
    '@luckys_luis/nuxt-laravelize-dead-letter-operations': ['default'],
    '@luckys_luis/nuxt-laravelize-dead-letter-operations/runtime': ['deadLetterAdapterRegistryToken', 'deadLetterManagerToken'],
    '@luckys_luis/nuxt-laravelize-dead-letter-operations/runtime/server': ['deadLetterHttpProblem', 'readGuardedJson'],
    '@luckys_luis/nuxt-laravelize-encryption/runtime': ['AesGcmEncrypter', 'DecryptionError', 'encrypterToken', 'generateEncryptionKey'],
    '@luckys_luis/nuxt-laravelize-events/runtime': ['dispatcherToken', 'eventListenerRegistryToken', 'EventListenerRegistry'],
    '@luckys_luis/nuxt-laravelize-execution-context/runtime': ['ExecutionContext', 'executionContextToken', 'withExecutionContext'],
    '@luckys_luis/nuxt-laravelize-execution-context/runtime/server': ['useExecutionContext'],
    '@luckys_luis/nuxt-laravelize-execution-context/testing': ['ExecutionContextBuilder', 'fakeExecutionContext'],
    '@luckys_luis/nuxt-laravelize-filesystem/runtime': ['FilesystemManager', 'InMemoryFilesystem', 'InMemoryFilesystemTombstoneStore', 'ReadFallbackFilesystem', 'createDirectUploadPolicy', 'isTemporaryUrlFilesystem', 'isDirectUploadFilesystem', 'isStreamFilesystem', 'scopedFilesystem', 'readOnlyFilesystem', 'quarantineFilesystem', 'filesystemManagerToken'],
    '@luckys_luis/nuxt-laravelize-filesystem/node': ['LocalFilesystem'],
    '@luckys_luis/nuxt-laravelize-filesystem/testing': ['FilesystemFake'],
    '@luckys_luis/nuxt-laravelize-filesystem-aws': ['AwsS3Filesystem', 'InMemoryS3UploadIssuanceStore', 'S3UploadConfirmationInProgressError', 'createAwsS3Filesystem'],
    '@luckys_luis/nuxt-laravelize-filesystem-aws-redis': ['RedisS3UploadIssuanceStore', 'RedisS3UploadIssuanceCorruptionError'],
    '@luckys_luis/nuxt-laravelize-filesystem-cloudflare': ['CloudflareR2Filesystem'],
    '@luckys_luis/nuxt-laravelize-queue/runtime': ['fingerprintJobPayload', 'JOB_DISPATCH_METADATA_KEY', 'JOB_TAGS_METADATA_KEY', 'JobAdmissionMetadataContributorRegistry', 'JobReleasedError', 'MAX_JOB_METADATA_KEYS', 'MAX_JOB_PRIORITY', 'MAX_JOB_TAG_LENGTH', 'MAX_JOB_TAGS', 'MAX_JOB_TAGS_LENGTH', 'MAX_QUEUE_BATCH_BYTES', 'MAX_QUEUE_BATCH_DEPTH', 'MAX_QUEUE_BATCH_ITEMS', 'MAX_QUEUE_BATCH_NODES', 'MAX_QUEUE_CHAIN_BYTES', 'MAX_QUEUE_CHAIN_DEPTH', 'MAX_QUEUE_CHAIN_NODES', 'MAX_QUEUE_CHAIN_STEPS', 'NonRetryableJobError', 'QUEUE_BATCH_CHILD_KIND', 'QUEUE_BATCH_COORDINATOR_KIND', 'QUEUE_BATCH_JOB_ID_PREFIX', 'QUEUE_CHAIN_JOB_ID_PREFIX', 'QUEUE_CHAIN_KIND', 'QueueBatchCancelledError', 'isJobReleasedError', 'isNonRetryableJobError', 'isQueueBatchCancelledError', 'jobAdmissionMetadataContributorsToken', 'prepareQueueBatch', 'queueBatchContextToken', 'queueToken', 'readJobDispatchIdentity', 'readJobTags', 'readQueueBatchChildEnvelope', 'readQueueBatchCoordinatorEnvelope'],
    '@luckys_luis/nuxt-laravelize-queue-middleware': ['default'],
    '@luckys_luis/nuxt-laravelize-queue-middleware/runtime': ['ExceptionThrottleOpenError', 'ExceptionThrottlePredicateError', 'ExceptionThrottleRecordingError', 'JobOverlapLockLostError', 'RateLimited', 'ThrottlesExceptions', 'WithoutOverlapping'],
    '@luckys_luis/nuxt-laravelize-rate-limiter/runtime': ['RateLimiter', 'rateLimiterToken'],
    '@luckys_luis/nuxt-laravelize-reliability': ['createEnvelope', 'OutboxProcessor', 'InboxConsumer', 'OutboxMessageConflictError', 'isPrunableReliabilityStore', 'normalizeReliabilityPruneOptions'],
    '@luckys_luis/nuxt-laravelize-reliability/testing': ['InMemoryReliabilityStore', 'OutboxStoreFake', 'InboxStoreFake'],
    '@luckys_luis/nuxt-laravelize-reliability-drizzle': ['DrizzleDeadLetterOperationStore', 'DrizzlePostgresReliabilityStore', 'DrizzleSQLiteReliabilityStore', 'DrizzleReliabilityDeadLetterAdapter'],
    '@luckys_luis/nuxt-laravelize-reliability-drizzle/postgres': ['DrizzlePostgresReliabilityStore'],
    '@luckys_luis/nuxt-laravelize-reliability-drizzle/sqlite': ['DrizzleSQLiteReliabilityStore'],
    '@luckys_luis/nuxt-laravelize-reliability-drizzle/turso': ['TursoReliabilityStore'],
    '@luckys_luis/nuxt-laravelize-reliability-drizzle/migrations': ['migrationSourceFor'],
    '@luckys_luis/nuxt-laravelize-reliability-queue/runtime': ['ReliableHandlerRegistry', 'ReliableMessageJob', 'createQueueOutboxDelivery'],
    '@luckys_luis/nuxt-laravelize-routes': ['default'],
    '@luckys_luis/nuxt-laravelize-routes/runtime': ['defineRoutes', 'route'],
    '@luckys_luis/nuxt-laravelize-routes/kit': ['addRoutesDeclaration'],
    '@luckys_luis/nuxt-laravelize-mail/runtime': ['mailerToken'],
    '@luckys_luis/nuxt-laravelize-notifications/runtime': ['NotificationChannelRegistry', 'NotificationDelivered', 'NotificationDeliveryFailed', 'notificationChannelRegistryToken', 'notificationManagerToken'],
    '@luckys_luis/nuxt-laravelize-notifications-broadcast/runtime': ['BroadcastNotificationChannel', 'broadcastNotificationChannelName', 'broadcastNotificationEvent'],
    '@luckys_luis/nuxt-laravelize-notifications-database/runtime': ['DatabaseNotificationChannel', 'InMemoryDatabaseNotificationStore', 'databaseNotificationStoreToken'],
    '@luckys_luis/nuxt-laravelize-notifications-database/runtime/server': ['useDatabaseNotifications'],
    '@luckys_luis/nuxt-laravelize-notifications-database-drizzle': ['DrizzlePostgresDatabaseNotificationStore', 'DrizzleSQLiteDatabaseNotificationStore'],
    '@luckys_luis/nuxt-laravelize-notifications-database-drizzle/migrations': ['migrationSourceFor'],
    '@luckys_luis/nuxt-laravelize-notifications-mail/runtime': ['MailNotificationChannel', 'InvalidMailNotificationError'],
    '@luckys_luis/nuxt-laravelize-notifications-queue/runtime': ['NotificationCodecRegistry', 'QueuedNotificationDispatcher', 'QueuedNotificationJob', 'RecipientResolverRegistry'],
    '@luckys_luis/nuxt-laravelize-notifications-webhook/runtime': ['WebhookNotificationChannel', 'webhookNotificationEndpointResolverToken', 'webhookNotificationOutboxStoreToken'],
    '@luckys_luis/nuxt-laravelize-observability/runtime': ['noopObservability', 'observe', 'observabilityToken'],
    '@luckys_luis/nuxt-laravelize-observability/testing': ['ObservabilityFake'],
    '@luckys_luis/nuxt-laravelize-observability-otel': ['OtelObservability'],
    '@luckys_luis/nuxt-laravelize-observability-queue': ['installQueueObservability'],
    '@luckys_luis/nuxt-laravelize-pennant/runtime': ['FeatureManager', 'InMemoryFeatureStore', 'featureManagerToken'],
    '@luckys_luis/nuxt-laravelize-scout/runtime': ['ScoutManager', 'InMemorySearchEngine', 'scoutManagerToken'],
    '@luckys_luis/nuxt-laravelize-scout-drizzle': ['DrizzlePostgresSearchEngine', 'registerDrizzlePostgresDriver', 'scoutDocuments'],
    '@luckys_luis/nuxt-laravelize-scout-drizzle/postgres': ['DrizzlePostgresSearchEngine', 'registerDrizzlePostgresDriver'],
    '@luckys_luis/nuxt-laravelize-scout-drizzle/sqlite': ['DrizzleSQLiteSearchEngine', 'registerDrizzleSQLiteDriver', 'sqliteScoutDocuments'],
    '@luckys_luis/nuxt-laravelize-scout-drizzle/turso': ['TursoLibSQLSearchEngine', 'registerTursoDriver'],
    '@luckys_luis/nuxt-laravelize-scout-drizzle/migrations': ['migrationSourceFor'],
    '@luckys_luis/nuxt-laravelize-http/runtime': ['Policy', 'DefaultPolicyRegistry', 'policyRegistryToken', 'discoverPoliciesByConvention', 'HmacUrlSigner', 'ValidateSignature', 'urlSignerToken'],
    '@luckys_luis/nuxt-laravelize-idempotency/runtime': ['IdempotencyMiddleware', 'InMemoryIdempotencyStore', 'createIdempotencyMiddleware', 'idempotencyStoreToken'],
    '@luckys_luis/nuxt-laravelize-idempotency-drizzle': ['DrizzlePostgresIdempotencyStore', 'DrizzleSQLiteIdempotencyStore', 'TursoIdempotencyStore'],
    '@luckys_luis/nuxt-laravelize-idempotency-drizzle/migrations': ['migrationSourceFor'],
    '@luckys_luis/nuxt-laravelize-migrations': ['MigrationRunner', 'defineMigration', 'discoverApplicationMigrations'],
    '@luckys_luis/nuxt-laravelize-migrations/console': ['createMigrationConsole'],
    '@luckys_luis/nuxt-laravelize-migrations/testing': ['InMemoryMigrationBackend'],
    '@luckys_luis/nuxt-laravelize-migrations-drizzle': ['PostgresMigrationBackend', 'SQLiteMigrationBackend', 'migrationSourcesFor'],
    '@luckys_luis/nuxt-laravelize-migrations-drizzle/sources': ['aggregateMigrationSourcesFor'],
    '@luckys_luis/nuxt-laravelize-hashing/runtime': ['Pbkdf2Hasher', 'hasherToken'],
    '@luckys_luis/nuxt-laravelize-validation/runtime': ['ErrorBag', 'ValidationError', 'Validator', 'validatorToken'],
    '@luckys_luis/nuxt-laravelize-webhooks': ['OutgoingWebhookProcessor', 'WebhookInboxReceiver', 'assertSafeWebhookUrl', 'signWebhook', 'verifyWebhook'],
    '@luckys_luis/nuxt-laravelize-webhooks/testing': ['WebhookTransportFake'],
    '@luckys_luis/nuxt-laravelize-workflows': ['WorkflowManager', 'WorkflowRegistry', 'InMemoryWorkflowStore', 'WorkflowExecutionAbortedError', 'WorkflowLeaseLostError', 'WorkflowDefinitionNotFoundError', 'DuplicateWorkflowDefinitionError', 'InvalidWorkflowVersionError', 'UnsupportedWorkflowSnapshotFormatError', 'WorkflowIdentityConflictError', 'WorkflowResolverContractError', 'assertWorkflowVersion', 'normalizeWorkflowSnapshot', 'resolveWorkflowDefinitionExact', 'defineWorkflow', 'defineStep', 'isRecoverableWorkflowStore'],
    '@luckys_luis/nuxt-laravelize-workflows-drizzle': ['DrizzlePostgresWorkflowStore', 'DrizzleSQLiteWorkflowStore', 'TursoWorkflowStore'],
    '@luckys_luis/nuxt-laravelize-workflows-drizzle/migrations': ['migrationSourceFor'],
    '@luckys_luis/nuxt-laravelize-workflows-reliability': ['TransactionalWorkflowStore', 'WorkflowWakeReconciler', 'WorkflowWakeReconciliationWorker', 'createWorkflowWakeHandler', 'registerWorkflowWakeHandler', 'workflowWakeMessageType'],
    '@luckys_luis/nuxt-laravelize-workflows-reliability/cli': ['parseWorkflowWakeReconciliationArgs', 'runWorkflowWakeReconciliationCli', 'WORKFLOW_WAKE_RECONCILIATION_HELP'],
    '@luckys_luis/nuxt-laravelize-workflows-queue/runtime': ['WorkflowCoordinator', 'WorkflowJob', 'workflowCoordinatorToken', 'workflowRegistryToken', 'workflowStoreToken'],
  },
  workerBins: [
    ['@luckys_luis/nuxt-laravelize-reliability', 'dist/bin/outbox-work.mjs'],
    ['@luckys_luis/nuxt-laravelize-webhooks', 'dist/bin/webhook-work.mjs'],
    ['@luckys_luis/nuxt-laravelize-queue-bullmq', 'dist/bin/queue-work.mjs'],
    ['@luckys_luis/nuxt-laravelize-workflows-reliability', 'dist/bin/workflow-wake-reconcile.mjs'],
  ],
  workflowWakeCli: true,
  workflowTypes: true,
})

runFixture('preset-default', {
  '@luckys_luis/nuxt-laravelize': dependencies['@luckys_luis/nuxt-laravelize'],
  '@luckys_luis/nuxt-laravelize-queue': dependencies['@luckys_luis/nuxt-laravelize-queue'],
  '@luckys_luis/nuxt-laravelize-reliability-queue': dependencies['@luckys_luis/nuxt-laravelize-reliability-queue'],
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'vue-tsc': vueTscVersion,
}, featureDependencies, ['@luckys_luis/nuxt-laravelize', '@luckys_luis/nuxt-laravelize/runtime/server'], ['@luckys_luis/nuxt-laravelize-dead-letter-operations', '@luckys_luis/nuxt-laravelize-cache-redis', '@luckys_luis/nuxt-laravelize-agent-sdk', '@luckys_luis/nuxt-laravelize-agents-cloudflare', '@luckys_luis/nuxt-laravelize-agents-flue', '@luckys_luis/nuxt-laravelize-ai-sdk', '@luckys_luis/nuxt-laravelize-audit-drizzle', '@luckys_luis/nuxt-laravelize-broadcasting-pusher', '@luckys_luis/nuxt-laravelize-database-drizzle', '@luckys_luis/nuxt-laravelize-filesystem-aws', '@luckys_luis/nuxt-laravelize-filesystem-cloudflare', '@luckys_luis/nuxt-laravelize-idempotency', '@luckys_luis/nuxt-laravelize-idempotency-drizzle', '@luckys_luis/nuxt-laravelize-reliability-drizzle', '@luckys_luis/nuxt-laravelize-queue-bullmq', '@luckys_luis/nuxt-laravelize-scheduler', '@luckys_luis/nuxt-laravelize-webhooks', '@luckys_luis/nuxt-laravelize-workflows', '@luckys_luis/nuxt-laravelize-workflows-drizzle', '@luckys_luis/nuxt-laravelize-workflows-queue', 'agents', '@flue/runtime', '@flue/sdk', 'ai', 'bullmq', 'drizzle-orm', 'nitro'], {
  requiredExports: { '@luckys_luis/nuxt-laravelize': ['default'], '@luckys_luis/nuxt-laravelize/runtime/server': ['createServerLocalization', 'ServerLocalization'] },
  buildNuxt: true,
  serverLocalizationSmoke: true,
})

runFixture('preset-compat5', {
  '@luckys_luis/nuxt-laravelize': dependencies['@luckys_luis/nuxt-laravelize'],
  '@luckys_luis/nuxt-laravelize-queue': dependencies['@luckys_luis/nuxt-laravelize-queue'],
  '@luckys_luis/nuxt-laravelize-reliability-queue': dependencies['@luckys_luis/nuxt-laravelize-reliability-queue'],
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'vue-tsc': vueTscVersion,
}, featureDependencies, ['@luckys_luis/nuxt-laravelize'], ['@luckys_luis/nuxt-laravelize-dead-letter-operations', '@luckys_luis/nuxt-laravelize-agent-sdk', '@luckys_luis/nuxt-laravelize-agents-cloudflare', '@luckys_luis/nuxt-laravelize-agents-flue', '@luckys_luis/nuxt-laravelize-ai-sdk', '@luckys_luis/nuxt-laravelize-audit-drizzle', '@luckys_luis/nuxt-laravelize-broadcasting-pusher', '@luckys_luis/nuxt-laravelize-database-drizzle', '@luckys_luis/nuxt-laravelize-filesystem-aws', '@luckys_luis/nuxt-laravelize-filesystem-cloudflare', '@luckys_luis/nuxt-laravelize-idempotency', '@luckys_luis/nuxt-laravelize-idempotency-drizzle', '@luckys_luis/nuxt-laravelize-reliability-drizzle', '@luckys_luis/nuxt-laravelize-queue-bullmq', '@luckys_luis/nuxt-laravelize-scheduler', '@luckys_luis/nuxt-laravelize-webhooks', '@luckys_luis/nuxt-laravelize-workflows', '@luckys_luis/nuxt-laravelize-workflows-drizzle', '@luckys_luis/nuxt-laravelize-workflows-queue', 'agents', '@flue/runtime', '@flue/sdk', 'ai', 'bullmq', 'drizzle-orm', 'nitro'], {
  requiredExports: { '@luckys_luis/nuxt-laravelize': ['default'] },
  buildNuxt: true,
  compatibilityVersion: 5,
})

runFixture('scheduler-core', {
  '@luckys_luis/nuxt-laravelize-scheduler': dependencies['@luckys_luis/nuxt-laravelize-scheduler'],
}, {
  '@luckys_luis/nuxt-laravelize-scheduler': dependencies['@luckys_luis/nuxt-laravelize-scheduler'],
}, ['@luckys_luis/nuxt-laravelize-scheduler'], ['nitro', 'nuxt'])

runFixture('scheduler-nitro3', {
  '@luckys_luis/nuxt-laravelize-scheduler': dependencies['@luckys_luis/nuxt-laravelize-scheduler'],
  'nitro': '3.0.260610-beta',
}, {
  '@luckys_luis/nuxt-laravelize-scheduler': dependencies['@luckys_luis/nuxt-laravelize-scheduler'],
}, ['@luckys_luis/nuxt-laravelize-scheduler/nitro3'])

runFixture('scheduler-nuxt', {
  '@luckys_luis/nuxt-laravelize-cache': dependencies['@luckys_luis/nuxt-laravelize-cache'],
  '@luckys_luis/nuxt-laravelize-scheduler': dependencies['@luckys_luis/nuxt-laravelize-scheduler'],
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt': dependencies['@luckys_luis/nuxt-laravelize-scheduler-nuxt'],
  'nuxt': nuxtVersion,
}, {
  '@luckys_luis/nuxt-laravelize-cache': dependencies['@luckys_luis/nuxt-laravelize-cache'],
  '@luckys_luis/nuxt-laravelize-core': dependencies['@luckys_luis/nuxt-laravelize-core'],
  '@luckys_luis/nuxt-laravelize-scheduler': dependencies['@luckys_luis/nuxt-laravelize-scheduler'],
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt': dependencies['@luckys_luis/nuxt-laravelize-scheduler-nuxt'],
}, [
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt',
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt/runtime',
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt/adapters',
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt/compiler',
  '@luckys_luis/nuxt-laravelize-scheduler-nuxt/cache-lock',
], [], {
  requiredExports: {
    '@luckys_luis/nuxt-laravelize-scheduler-nuxt': ['default'],
    '@luckys_luis/nuxt-laravelize-scheduler-nuxt/runtime': ['createSchedulerRunner', 'ProcessLocalLockProvider'],
    '@luckys_luis/nuxt-laravelize-scheduler-nuxt/adapters': ['createCloudflareScheduledHandler', 'createVercelCronHandler'],
    '@luckys_luis/nuxt-laravelize-scheduler-nuxt/cache-lock': ['CacheLockSchedulerLockProvider'],
  },
  buildSchedulerNuxt: true,
})

function runFixture(name, fixtureDependencies, overrides, imports, absentPackages = [], options = {}) {
  if (name.startsWith('preset-')) absentPackages = [...absentPackages, '@luckys_luis/nuxt-laravelize-observability-otel', '@luckys_luis/nuxt-laravelize-observability-queue']
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

    if (options.serverLocalizationSmoke) {
      writeFileSync(join(fixture, 'smoke.mjs'), [
        readFileSync(join(fixture, 'smoke.mjs'), 'utf8'),
        'const { createServerLocalization } = await import(\'@luckys_luis/nuxt-laravelize/runtime/server\')',
        'const loadedCodes = []',
        'const localization = await createServerLocalization(\'en-US\', {',
        '  locales: [{ code: \'en_US\', locale: \'en-US\' }],',
        '  defaultLocale: \'en_US\',',
        '  plural(key, count, params, locale, getter) {',
        '    if (locale !== \'en_US\') throw new Error(`Packed plural received ${locale} instead of en_US`)',
        '    const choices = String(getter(key, params)).split(\'|\')',
        '    return (choices[count === 1 ? 0 : 1] ?? choices.at(-1) ?? \'\').trim().replace(\'{count}\', String(count))',
        '  },',
        '  async loadDictionary(code) {',
        '    loadedCodes.push(code)',
        '    return { greeting: \'Hello, {name}\', items: \'One item | {count} items\' }',
        '  },',
        '})',
        'if (localization.locale !== \'en-US\' || localization.localeCode !== \'en_US\' || localization.t(\'greeting\', { name: \'Ada\' }) !== \'Hello, Ada\') throw new Error(\'Packed injected localization translation failed\')',
        'if (localization.tc(\'items\', 2) !== \'2 items\') throw new Error(\'Packed injected localization plural failed\')',
        'if (localization.tn(1234.5, { useGrouping: false, minimumFractionDigits: 2 }) !== \'1234.50\') throw new Error(\'Packed injected localization number format failed\')',
        'if (localization.td(\'2026-01-02T00:00:00.000Z\', { timeZone: \'UTC\', year: \'numeric\', month: \'2-digit\', day: \'2-digit\' }) !== \'01/02/2026\') throw new Error(\'Packed injected localization date format failed\')',
        'if (localization.tdr(-2, \'day\', { numeric: \'always\' }) !== \'2 days ago\') throw new Error(\'Packed injected localization relative format failed\')',
        'if (loadedCodes.join(\',\') !== \'en_US\') throw new Error(\'Packed injected localization did not load the configured dictionary code\')',
        '',
      ].join('\n'))
    }

    if (options.workflowTypes) {
      writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022' }, include: ['workflow-types.ts'] }, null, 2))
      writeFileSync(join(fixture, 'workflow-types.ts'), [
        'import type { WorkflowSnapshot } from \'@luckys_luis/nuxt-laravelize-workflows\'',
        '',
        'const base = { id: \'id\', workflowName: \'strict\', workflowVersion: \'1\', startKey: \'key\', canonicalInput: \'{}\', input: {}, state: \'pending\' as const, revision: 0, steps: [], cancellationRequested: false, createdAt: 0, updatedAt: 0 }',
        '// @ts-expect-error snapshotFormatVersion is a required source field',
        'const legacySource: WorkflowSnapshot = base',
        'const currentSource: WorkflowSnapshot = { ...base, snapshotFormatVersion: 1 }',
        'void legacySource; void currentSource',
        '',
      ].join('\n'))
    }

    if (options.buildNuxt) {
      writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({ extends: './.nuxt/tsconfig.json' }, null, 2))
      writeFileSync(join(fixture, 'nuxt.config.ts'), [
        'import Laravelize from \'@luckys_luis/nuxt-laravelize\'',
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
        '    locales: [{ code: \'en\', iso: \'en-US\', dir: \'ltr\' }, { code: \'es\', iso: \'es-ES\', dir: \'ltr\' }],',
        '    defaultLocale: \'en\',',
        '    strategy: \'no_prefix\',',
        '    translationDir: \'locales\',',
        '    disablePageLocales: true,',
        '    fallbackLocale: \'en\',',
        '    autoDetectLanguage: true,',
        '    redirects: false,',
        '  },',
        ...(options.compatibilityVersion ? [`  future: { compatibilityVersion: ${options.compatibilityVersion} },`] : []),
        '}',
        '',
      ].join('\n'))
      mkdirSync(join(fixture, 'app'), { recursive: true })
      writeFileSync(join(fixture, 'routes.ts'), [
        'import { route } from \'@luckys_luis/nuxt-laravelize-routes/runtime\'',
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
        server: { welcome: 'Server hello, {name}', fallback: 'English fallback' },
      }, null, 2))
      writeFileSync(join(fixture, 'locales', 'es.json'), JSON.stringify({ server: { welcome: 'Servidor hola, {name}' } }, null, 2))
      mkdirSync(join(fixture, 'server', 'api'), { recursive: true })
      writeFileSync(join(fixture, 'server', 'api', 'health.get.ts'), [
        'import { jobRegistryToken } from \'@luckys_luis/nuxt-laravelize-queue/runtime\'',
        'import { ReliableMessageJob, reliableHandlerRegistryToken } from \'@luckys_luis/nuxt-laravelize-reliability-queue/runtime\'',
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
      writeFileSync(join(fixture, 'server', 'api', 'localization.get.ts'), [
        'export default defineEventHandler(async (event) => {',
        '  const i18n = await useServerLocalization(event)',
        '  const jobI18n = await createServerLocalization(useExecutionContext(event).snapshot().locale ?? i18n.defaultLocale)',
        '  return { locale: i18n.locale, contextLocale: useExecutionContext(event).snapshot().locale, message: i18n.t(\'server.welcome\', { name: \'Ada\' }), fallback: jobI18n.t(\'server.fallback\') }',
        '})',
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
        '  const localized = await fetch(`http://127.0.0.1:${port}/api/localization?locale=es`).then(result => result.json())',
        '  if (localized.locale !== \'es-ES\' || localized.contextLocale !== \'es-ES\' || localized.message !== \'Servidor hola, Ada\' || localized.fallback !== \'English fallback\') throw new Error(\'Packed server localization did not use generated locale assets\')',
        '} finally {',
        '  server.kill()',
        '  if (server.exitCode === null) await once(server, \'exit\')',
        '}',
        '',
      ].join('\n'))
    }

    if (options.buildSchedulerNuxt) {
      writeFileSync(join(fixture, 'nuxt.config.ts'), [
        'import SchedulerNuxt from \'@luckys_luis/nuxt-laravelize-scheduler-nuxt\'',
        '',
        'export default {',
        '  compatibilityDate: \'2026-07-01\',',
        '  modules: [[SchedulerNuxt, {',
        '    enabled: true,',
        '    schedules: [\'./schedule.ts\'],',
        '    tasks: { \'smoke:tick\': { handler: \'./runtime-provider.ts\' } },',
        '  }]],',
        '}',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'schedule.ts'), [
        'import { defineSchedule } from \'@luckys_luis/nuxt-laravelize-scheduler\'',
        '',
        'export default defineSchedule(schedule => schedule.task(\'smoke:tick\').everyMinute())',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'runtime-provider.ts'), [
        'export default {',
        '  createScope() {',
        '    return { runner: { run: async () => ({ status: \'completed\' }) } }',
        '  },',
        '}',
        '',
      ].join('\n'))
      mkdirSync(join(fixture, 'app'), { recursive: true })
      writeFileSync(join(fixture, 'app', 'app.vue'), '<template><main>Scheduler smoke</main></template>\n')
    }

    execFileSync('pnpm', ['install'], { cwd: fixture, stdio: 'inherit' })
    for (const packageName of absentPackages) {
      if (existsSync(join(fixture, 'node_modules', ...packageName.split('/')))) {
        throw new Error(`${name} unexpectedly installed ${packageName}`)
      }
    }
    execFileSync(process.execPath, ['smoke.mjs'], { cwd: fixture, stdio: 'inherit' })
    if (options.workflowTypes) execFileSync('pnpm', ['exec', 'tsc'], { cwd: fixture, stdio: 'inherit' })
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
      execFileSync(process.execPath, [join(fixture, 'node_modules', '@luckys_luis', 'nuxt-laravelize-workflows-reliability', 'dist/bin/workflow-wake-reconcile.mjs'), '--once', '--config', config], { cwd: fixture, stdio: 'inherit' })
      if (readFileSync(marker, 'utf8') !== 'run\nclose\n') throw new Error('workflow wake CLI did not run and close from the packed install')
    }
    if (options.buildNuxt) {
      execFileSync('pnpm', ['exec', 'nuxt', 'typecheck'], { cwd: fixture, stdio: 'inherit' })
      execFileSync('pnpm', ['exec', 'nuxt', 'build'], { cwd: fixture, stdio: 'inherit' })
      execFileSync(process.execPath, ['runtime-smoke.mjs'], { cwd: fixture, stdio: 'inherit' })
    }
    if (options.buildSchedulerNuxt) {
      execFileSync('pnpm', ['exec', 'nuxt', 'build'], { cwd: fixture, stdio: 'inherit' })
      const generatedTask = join(fixture, '.nuxt', 'laravelize', 'scheduler', `${Buffer.from('smoke:tick').toString('base64url')}.mjs`)
      const generatedSource = existsSync(generatedTask) ? readFileSync(generatedTask, 'utf8') : ''
      if (!generatedSource.includes('createGeneratedSchedulerTask(task, runtimeProvider,') || !generatedSource.includes('timestampSource: "wall-clock"')) {
        throw new Error('Packed scheduler-nuxt module did not generate its SchedulerRunner wrapper')
      }
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
  const tarball = tarballForPackage(packageName)
  const entry = `package/${binPath}`
  const listing = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' }).split('\n')
  if (!listing.includes(entry)) throw new Error(`${packageName} tarball is missing ${entry}`)
  const contents = execFileSync('tar', ['-xOf', tarball, entry], { encoding: 'utf8' })
  if (!contents.startsWith('#!/usr/bin/env node\n')) throw new Error(`${entry} is missing its Node shebang`)
}

function verifyTarballEntry(packageName, entryPath, expectedContents = []) {
  const tarball = tarballForPackage(packageName)
  const entry = `package/${entryPath}`
  const listing = execFileSync('tar', ['-tf', tarball], { encoding: 'utf8' }).split('\n')
  if (!listing.includes(entry)) throw new Error(`${packageName} tarball is missing ${entry}`)
  const contents = execFileSync('tar', ['-xOf', tarball, entry], { encoding: 'utf8' })
  for (const expected of expectedContents) if (!contents.includes(expected)) throw new Error(`${entry} is missing ${expected}`)
}

function tarballForPackage(packageDirectory) {
  const { name, version } = JSON.parse(readFileSync(resolve('packages', packageDirectory, 'package.json'), 'utf8'))
  return resolve(tarballDirectory, `${name.slice(1).replace('/', '-')}-${version}.tgz`)
}

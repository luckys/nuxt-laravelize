import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const packageNames = [
  'core',
  'database',
  'events',
  'events-queue',
  'http',
  'mail',
  'notifications',
  'nuxt',
  'queue',
  'queue-bullmq',
  'scheduler',
  'testing',
]

const tarballDirectory = resolve('.pack')
const tarballs = readdirSync(tarballDirectory)
const nuxtVersion = installedVersion('nuxt')
const typescriptVersion = installedVersion('typescript')
const vueTscVersion = installedVersion('vue-tsc', 'playground/node_modules')
const dependencies = Object.fromEntries(packageNames.map((name) => {
  const { version } = JSON.parse(readFileSync(resolve('packages', name, 'package.json'), 'utf8'))
  const suffix = `nuxt-laravelize-${name}-${version}.tgz`
  const tarball = tarballs.find(file => file === suffix)
  if (!tarball) throw new Error(`Missing tarball: ${suffix}`)
  return [`@nuxt-laravelize/${name}`, `file:${join(tarballDirectory, tarball)}`]
}))

const featureDependencies = Object.fromEntries(Object.entries(dependencies).filter(([name]) => name !== '@nuxt-laravelize/scheduler'))

runFixture('features', {
  ...featureDependencies,
  nuxt: nuxtVersion,
}, featureDependencies, [
  '@nuxt-laravelize/core',
  '@nuxt-laravelize/core/runtime',
  '@nuxt-laravelize/core/kit',
  '@nuxt-laravelize/core/testing',
  '@nuxt-laravelize/events/runtime',
  '@nuxt-laravelize/events/testing',
  '@nuxt-laravelize/queue/runtime',
  '@nuxt-laravelize/queue/testing',
  '@nuxt-laravelize/queue-bullmq/runtime',
  '@nuxt-laravelize/events-queue/runtime',
  '@nuxt-laravelize/mail/runtime',
  '@nuxt-laravelize/mail/node',
  '@nuxt-laravelize/mail/testing',
  '@nuxt-laravelize/notifications/runtime',
  '@nuxt-laravelize/notifications/testing',
  '@nuxt-laravelize/http/runtime',
  '@nuxt-laravelize/database/runtime',
  '@nuxt-laravelize/testing',
  '@nuxt-laravelize/nuxt',
], ['@nuxt-laravelize/scheduler', 'nitro'], {
  requiredExports: {
    '@nuxt-laravelize/core/runtime': ['createContainer', 'loggerFor'],
    '@nuxt-laravelize/events/runtime': ['dispatcherToken'],
    '@nuxt-laravelize/queue/runtime': ['queueToken'],
    '@nuxt-laravelize/mail/runtime': ['mailerToken'],
    '@nuxt-laravelize/notifications/runtime': ['notificationManagerToken'],
    '@nuxt-laravelize/http/runtime': ['Policy', 'DefaultPolicyRegistry', 'policyRegistryToken', 'discoverPoliciesByConvention'],
  },
})

runFixture('preset-default', {
  '@nuxt-laravelize/nuxt': dependencies['@nuxt-laravelize/nuxt'],
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'vue-tsc': vueTscVersion,
}, featureDependencies, ['@nuxt-laravelize/nuxt'], ['@nuxt-laravelize/scheduler', 'nitro'], {
  requiredExports: { '@nuxt-laravelize/nuxt': ['default'] },
  buildNuxt: true,
})

runFixture('preset-compat5', {
  '@nuxt-laravelize/nuxt': dependencies['@nuxt-laravelize/nuxt'],
  'nuxt': nuxtVersion,
  'typescript': typescriptVersion,
  'vue-tsc': vueTscVersion,
}, featureDependencies, ['@nuxt-laravelize/nuxt'], ['@nuxt-laravelize/scheduler', 'nitro'], {
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
      writeFileSync(join(fixture, 'nuxt.config.mjs'), [
        'export default {',
        '  compatibilityDate: \'2026-07-01\',',
        '  modules: [\'@nuxt-laravelize/nuxt\'],',
        '  laravelizeHttp: { baseURL: \'/api\' },',
        ...(options.compatibilityVersion ? [`  future: { compatibilityVersion: ${options.compatibilityVersion} },`] : []),
        '}',
        '',
      ].join('\n'))
      mkdirSync(join(fixture, 'app'), { recursive: true })
      writeFileSync(join(fixture, 'app', 'app.vue'), [
        '<script setup lang="ts">',
        'const { data } = await useHttp<{ message: string }>(\'/http-client\')',
        '</script>',
        '',
        '<template>',
        '  <main>{{ data?.message }}</main>',
        '</template>',
        '',
      ].join('\n'))
      mkdirSync(join(fixture, 'server', 'api'), { recursive: true })
      writeFileSync(join(fixture, 'server', 'api', 'health.get.ts'), [
        'export default defineEventHandler((event) => ({',
        '  container: Boolean(event.context.laravelizeContainer),',
        '  dispatcher: Boolean(useDispatcher(event)),',
        '  queue: Boolean(useQueue(event)),',
        '  mailer: Boolean(useMailer(event)),',
        '  notifications: Boolean(useNotifications(event)),',
        '}))',
        '',
      ].join('\n'))
      writeFileSync(join(fixture, 'server', 'api', 'http-client.get.ts'), [
        'export default defineEventHandler(() => ({ message: \'Fetched with useHttp\' }))',
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
        '  for (const service of [\'container\', \'dispatcher\', \'queue\', \'mailer\', \'notifications\']) {',
        '    if (health[service] !== true) throw new Error(`Missing runtime service: ${service}`)',
        '  }',
        '  const html = await fetch(`http://127.0.0.1:${port}/`).then(result => result.text())',
        '  if (!html.includes(\'Fetched with useHttp\')) throw new Error(\'useHttp SSR response was not rendered\')',
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

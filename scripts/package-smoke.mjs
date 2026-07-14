import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
const dependencies = Object.fromEntries(packageNames.map((name) => {
  const suffix = `nuxt-laravelize-${name}-0.1.0.tgz`
  const tarball = tarballs.find(file => file === suffix)
  if (!tarball) throw new Error(`Missing tarball: ${suffix}`)
  return [`@nuxt-laravelize/${name}`, `file:${join(tarballDirectory, tarball)}`]
}))

const fixture = mkdtempSync(join(tmpdir(), 'nuxt-laravelize-smoke-'))

try {
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      ...dependencies,
      nitro: '3.0.260610-beta',
      nuxt: '^4.4.5',
    },
  }, null, 2))

  writeFileSync(join(fixture, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - \'.\'',
    'overrides:',
    ...Object.entries(dependencies).map(([name, tarball]) => `  '${name}': '${tarball}'`),
    'allowBuilds:',
    '  \'@parcel/watcher\': true',
    '  esbuild: true',
    '  msgpackr-extract: true',
    '',
  ].join('\n'))

  writeFileSync(join(fixture, 'smoke.mjs'), `
await Promise.all([
  import('@nuxt-laravelize/core'),
  import('@nuxt-laravelize/core/runtime'),
  import('@nuxt-laravelize/core/kit'),
  import('@nuxt-laravelize/core/testing'),
  import('@nuxt-laravelize/events/runtime'),
  import('@nuxt-laravelize/events/testing'),
  import('@nuxt-laravelize/queue/runtime'),
  import('@nuxt-laravelize/queue/testing'),
  import('@nuxt-laravelize/queue-bullmq/runtime'),
  import('@nuxt-laravelize/scheduler'),
  import('@nuxt-laravelize/scheduler/nitro3'),
  import('@nuxt-laravelize/events-queue/runtime'),
  import('@nuxt-laravelize/mail/runtime'),
  import('@nuxt-laravelize/mail/node'),
  import('@nuxt-laravelize/mail/testing'),
  import('@nuxt-laravelize/notifications/runtime'),
  import('@nuxt-laravelize/notifications/testing'),
  import('@nuxt-laravelize/http/runtime'),
  import('@nuxt-laravelize/database/runtime'),
  import('@nuxt-laravelize/testing'),
  import('@nuxt-laravelize/nuxt'),
])
`)

  execFileSync('pnpm', ['install'], { cwd: fixture, stdio: 'inherit' })
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: fixture, stdio: 'inherit' })
}
finally {
  rmSync(fixture, { recursive: true, force: true })
}

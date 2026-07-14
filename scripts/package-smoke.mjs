import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
  const { version } = JSON.parse(readFileSync(resolve('packages', name, 'package.json'), 'utf8'))
  const suffix = `nuxt-laravelize-${name}-${version}.tgz`
  const tarball = tarballs.find(file => file === suffix)
  if (!tarball) throw new Error(`Missing tarball: ${suffix}`)
  return [`@nuxt-laravelize/${name}`, `file:${join(tarballDirectory, tarball)}`]
}))

const featureDependencies = Object.fromEntries(Object.entries(dependencies).filter(([name]) => name !== '@nuxt-laravelize/scheduler'))

runFixture('features', {
  ...featureDependencies,
  nuxt: '^4.4.5',
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
], ['@nuxt-laravelize/scheduler', 'nitro'])

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

function runFixture(name, fixtureDependencies, overrides, imports, absentPackages = []) {
  const fixture = mkdtempSync(join(tmpdir(), `nuxt-laravelize-${name}-`))
  try {
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      private: true,
      type: 'module',
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

    writeFileSync(join(fixture, 'smoke.mjs'), `await Promise.all([${imports.map(specifier => `import(${JSON.stringify(specifier)})`).join(',')}])\n`)

    execFileSync('pnpm', ['install'], { cwd: fixture, stdio: 'inherit' })
    for (const packageName of absentPackages) {
      if (existsSync(join(fixture, 'node_modules', ...packageName.split('/')))) {
        throw new Error(`${name} unexpectedly installed ${packageName}`)
      }
    }
    execFileSync(process.execPath, ['smoke.mjs'], { cwd: fixture, stdio: 'inherit' })
  }
  finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

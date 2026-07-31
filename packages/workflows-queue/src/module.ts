import { addServerImports, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { addLaravelizeProvider } from '@nuxt-laravelize/core/kit'
import { resolveWorkflowsQueueOptions, type WorkflowsQueueOptions } from './runtime/options'
import type { NuxtModule } from 'nuxt/schema'

const module: NuxtModule<WorkflowsQueueOptions, WorkflowsQueueOptions, false> = defineNuxtModule<WorkflowsQueueOptions>({
  meta: { name: '@nuxt-laravelize/workflows-queue', configKey: 'laravelizeWorkflowsQueue', compatibility: { nuxt: '>=4.3.0 <5' } },
  defaults: {},
  moduleDependencies: { '@nuxt-laravelize/core': {}, '@nuxt-laravelize/queue': {} },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const resolved = resolveWorkflowsQueueOptions(options)
    const provider = addTemplate({
      filename: 'laravelize/workflows-queue-provider.mjs',
      getContents: () => `import Provider from ${JSON.stringify(resolver.resolve('./runtime/server/WorkflowsQueueServiceProvider'))}\nexport default class ConfiguredWorkflowsQueueProvider extends Provider { constructor() { super(${JSON.stringify(resolved)}) } }`,
    })
    addLaravelizeProvider(nuxt, provider.dst, 'server')
    addServerImports({ name: 'useWorkflows', from: resolver.resolve('./runtime/server') })
  },
})

export default module

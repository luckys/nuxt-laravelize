import SchedulerNuxt from '../../../src/module'
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: [[SchedulerNuxt, {
    enabled: true,
    schedules: ['./schedule.ts'],
    tasks: { 'fixture:tick': { handler: './runtime-provider.ts' } },
  }]],
  compatibilityDate: '2026-07-01',
})

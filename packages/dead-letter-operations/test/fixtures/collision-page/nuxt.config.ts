import DeadLetterOperations from '../../../src/module'
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({ modules: [[DeadLetterOperations, { enabled: true, allowedOrigins: ['http://localhost:3000'] }]], compatibilityDate: '2026-07-01' })

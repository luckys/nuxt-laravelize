/* eslint-disable @stylistic/max-statements-per-line */
import type { H3Event } from 'h3'
import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'
import type { ScoutManager } from '../Scout'
import { scoutManagerToken } from '../tokens'

export { scoutManagerToken } from '../tokens'
export function useScout(event: H3Event): ScoutManager { return useContainer(event).make(scoutManagerToken) }

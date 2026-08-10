import { createToken, type Token } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { TransactionManager } from './TransactionManager'

export function createTransactionManagerToken<Session>(key: string): Token<TransactionManager<Session>> {
  return createToken<TransactionManager<Session>>(key)
}

export const transactionManagerToken = createTransactionManagerToken<unknown>('laravelize.database.transactions')

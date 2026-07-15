import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sqliteScoutDocuments = sqliteTable('scout_documents', {
  index: text('index_name').notNull(),
  type: text('document_type').notNull(),
  key: text('document_key').notNull(),
  document: text('document', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, table => [primaryKey({ columns: [table.index, table.type, table.key] })])

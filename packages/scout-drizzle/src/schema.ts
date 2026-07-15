import { customType, index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })
export const scoutDocuments = pgTable('scout_documents', {
  index: text('index_name').notNull(),
  type: text('document_type').notNull(),
  key: text('document_key').notNull(),
  document: jsonb('document').notNull().$type<Record<string, unknown>>(),
  searchVector: tsvector('search_vector').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.index, table.type, table.key] }), index('scout_documents_search_vector_gin').using('gin', table.searchVector)])

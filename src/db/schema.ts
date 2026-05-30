import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const scans = pgTable('scans', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  domain: text('domain').notNull(),
  total: integer('total').notNull(),
  categories: jsonb('categories').notNull(),
  checks: jsonb('checks').notNull(),
  contentExcerpt: text('content_excerpt'),
  aiAnalysis: jsonb('ai_analysis'),
  brandVisibility: jsonb('brand_visibility'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  scanId: integer('scan_id').references(() => scans.id).notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  notifiedAt: timestamp('notified_at'),
})

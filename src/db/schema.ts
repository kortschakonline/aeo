import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'

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
  accountId: integer('account_id').references(() => accounts.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  scanId: integer('scan_id').references(() => scans.id).notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  notifiedAt: timestamp('notified_at'),
})

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
})

export const loginTokens = pgTable('login_tokens', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').references(() => accounts.id).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at'),
})

export const monitors = pgTable('monitors', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').references(() => accounts.id).notNull(),
  domain: text('domain').notNull(),
  url: text('url').notNull(),
  active: boolean('active').default(true).notNull(),
  lastRunAt: timestamp('last_run_at'),
  lastScore: integer('last_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').references(() => accounts.id).notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull(),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

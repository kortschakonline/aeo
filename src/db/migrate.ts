import { sql } from 'drizzle-orm'
import { db } from '@/src/db/client'

// Idempotente Schema-Erstellung beim ersten DB-Zugriff (ersetzt manuelles
// `drizzle-kit push` auf dem Server). Wird pro Prozess nur einmal ausgeführt.
let ensured: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS scans (
          id serial PRIMARY KEY,
          url text NOT NULL,
          domain text NOT NULL,
          total integer NOT NULL,
          categories jsonb NOT NULL,
          checks jsonb NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS leads (
          id serial PRIMARY KEY,
          scan_id integer NOT NULL REFERENCES scans(id),
          email text NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL,
          notified_at timestamp
        )
      `)
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS content_excerpt text`)
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS ai_analysis jsonb`)
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS brand_visibility jsonb`)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS accounts (
          id serial PRIMARY KEY,
          email text NOT NULL UNIQUE,
          created_at timestamp DEFAULT now() NOT NULL,
          last_login_at timestamp
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS login_tokens (
          id serial PRIMARY KEY,
          email text NOT NULL,
          token_hash text NOT NULL,
          expires_at timestamp NOT NULL,
          used_at timestamp,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id serial PRIMARY KEY,
          account_id integer NOT NULL REFERENCES accounts(id),
          token_hash text NOT NULL,
          expires_at timestamp NOT NULL,
          created_at timestamp DEFAULT now() NOT NULL,
          last_seen_at timestamp
        )
      `)
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS account_id integer REFERENCES accounts(id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS login_tokens_token_hash_idx ON login_tokens (token_hash)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS scans_account_id_idx ON scans (account_id)`)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS monitors (
          id serial PRIMARY KEY,
          account_id integer NOT NULL REFERENCES accounts(id),
          domain text NOT NULL,
          url text NOT NULL,
          active boolean NOT NULL DEFAULT true,
          last_run_at timestamp,
          last_score integer,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS monitors_account_domain_idx ON monitors (account_id, domain)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS monitors_active_last_run_idx ON monitors (active, last_run_at)`)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id serial PRIMARY KEY,
          account_id integer NOT NULL REFERENCES accounts(id),
          stripe_customer_id text NOT NULL,
          stripe_subscription_id text,
          plan text NOT NULL,
          status text NOT NULL,
          current_period_end timestamp,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_account_idx ON subscriptions (account_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions (stripe_customer_id)`)
    })().catch((e) => {
      ensured = null // bei Fehler erneut versuchen
      throw e
    })
  }
  return ensured
}

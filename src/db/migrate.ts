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
    })().catch((e) => {
      ensured = null // bei Fehler erneut versuchen
      throw e
    })
  }
  return ensured
}

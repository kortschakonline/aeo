# AEO-Tool Stufe 4a — Accounts + Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passwortlose Magic-Link-Accounts mit einem Dashboard, das die Scan-Historie pro Domain (Verlauf, Re-Scan, Score-Trend) zeigt und DSGVO-konforme Account-Löschung erlaubt.

**Architecture:** Drei neue Postgres-Tabellen (`accounts`, `login_tokens`, `sessions`) plus `scans.account_id`. Login per Magic-Link über bestehendes SMTP; Session als zufälliger Token, dessen sha256-Hash in der DB liegt und dessen Klartext in einem HttpOnly-Cookie steckt. Beim ersten Login werden Alt-Scans per E-Mail rückwirkend dem Account zugeordnet (Backfill). Die bestehende Report-Darstellung wird in eine wiederverwendbare Client-Komponente extrahiert, damit gespeicherte Scans über `/report/[id]` geöffnet werden können. Der anonyme Funnel auf `/` bleibt vollständig erhalten.

**Tech Stack:** Next.js 16 (App Router, async `cookies()`, `redirect()` aus `next/navigation`, Route Handler mit Web `Request`/`Response`), Drizzle ORM + postgres-js, Zod, nodemailer, Node `crypto`, Vitest.

**Wichtige Konventionen (verifiziert):**
- `cookies()` ist **async** → `const store = await cookies()`. Cookies können nur in Route Handlern / Server Functions **geschrieben** werden, in Server Components nur **gelesen**.
- `redirect(path)` wirft `NEXT_REDIRECT` → immer **außerhalb** von `try/catch` aufrufen.
- Tests laufen unter Vitest mit `environment: 'node'` **ohne DB**. Wie im bestehenden Code (`repo.ts` ist ungetestet, `runScan` testet via Dependency-Injection) bekommen **nur reine Funktionen** echte Unit-Tests; DB-/Route-/RSC-Glue wird über `npm run build` (Typecheck + Compile) und manuellen Smoke-Test verifiziert.
- **Abweichung von der Spec:** Statt echter „gleitender" Session ein **festes 30-Tage-Fenster ab Login** (Re-Login verlängert). Grund: Cookies lassen sich während des RSC-Renderings (wo `getSession()` fürs Dashboard läuft) nicht neu setzen. `getSession()` liest & prüft nur Ablauf, löscht abgelaufene Sessions, schreibt aber kein Cookie.

---

## File Structure

**Neu:**
- `src/auth/tokens.ts` — reine Krypto-Helfer (Token erzeugen/hashen, Ablaufzeiten, `isExpired`). **Getestet.**
- `src/auth/rateLimit.ts` — minimaler In-Memory-Rate-Limiter (pro Prozess). **Getestet.**
- `src/auth/session.ts` — `createSession`, `getSession`, `destroySession` + Cookie-Konstante. (DB+Cookie-Glue.)
- `tests/tokens.test.ts`, `tests/rateLimit.test.ts` — Unit-Tests.
- `app/api/auth/request/route.ts` — POST: Magic-Link anfordern.
- `app/api/auth/callback/route.ts` — GET: Token einlösen, Session anlegen, Redirect.
- `app/api/auth/logout/route.ts` — POST: Logout.
- `app/api/account/delete/route.ts` — POST: Account löschen.
- `app/login/page.tsx` — Login-Seite (Server Component) rendert `LoginForm`.
- `components/LoginForm.tsx` — E-Mail-Formular (Client).
- `app/dashboard/page.tsx` — Dashboard (Server Component).
- `components/RescanButton.tsx` — „Erneut scannen" (Client).
- `components/AccountMenu.tsx` — „Abmelden" + „Account löschen" (Client).
- `components/Sparkline.tsx` — kleiner Score-Verlauf als Inline-SVG (rein, ohne Hooks).
- `components/ReportView.tsx` — extrahierte, wiederverwendbare Report-Darstellung (Client).
- `app/report/[id]/page.tsx` — gespeicherten Scan rendern (Server Component).

**Geändert:**
- `src/db/schema.ts` — neue Tabellen + `scans.accountId`.
- `src/db/migrate.ts` — `ensureSchema()` erweitert.
- `src/db/repo.ts` — Account-/Token-/Session-/Backfill-/Dashboard-/Delete-Funktionen; `saveScan` mit optionaler `accountId`.
- `src/mail/notifier.ts` — `sendMagicLink()` + gemeinsamer Transport-Helfer.
- `app/api/scan/route.ts` — `accountId` aus Session anhängen, `owned` zurückgeben.
- `app/page.tsx` — Report-JSX durch `ReportView` ersetzen.
- `components/SiteHeader.tsx` + `app/layout.tsx` — „Anmelden"/„Dashboard"-Link.
- `app/datenschutz/page.tsx` — Account-/Cookie-Abschnitt.

---

## Task 1: DB-Schema & Migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Schema-Tabellen ergänzen**

In `src/db/schema.ts` den Import um `boolean` ist nicht nötig; `integer`/`text`/`timestamp`/`serial` sind bereits importiert. Am Ende der Datei anfügen:

```ts
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
```

Und die bestehende `scans`-Tabelle um die Spalte erweitern (innerhalb des `pgTable('scans', {...})`-Objekts, nach `brandVisibility`):

```ts
  accountId: integer('account_id').references(() => accounts.id),
```

(`references(() => accounts.id)` ist lazy — die Deklarationsreihenfolge spielt keine Rolle.)

- [ ] **Step 2: `ensureSchema()` erweitern**

In `src/db/migrate.ts` innerhalb des `async () => { ... }`-Blocks, **nach** den bestehenden `ALTER TABLE scans …`-Zeilen, anfügen:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrate.ts
git commit -m "feat(db): Schema für Accounts/Sessions/Login-Tokens + scans.account_id"
```

---

## Task 2: Krypto-Helfer (`tokens.ts`) — TDD

**Files:**
- Create: `src/auth/tokens.ts`
- Test: `tests/tokens.test.ts`

- [ ] **Step 1: Failing test schreiben**

`tests/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  generateToken, hashToken, isExpired, loginTokenExpiry, sessionExpiry,
} from '@/src/auth/tokens'

describe('tokens', () => {
  it('hashToken ist deterministisch und liefert 64 Hex-Zeichen', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('generateToken liefert Token + passenden Hash, Tokens sind eindeutig', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a.tokenHash).toBe(hashToken(a.token))
    expect(a.token).not.toBe(b.token)
    expect(a.token.length).toBeGreaterThan(20)
  })

  it('loginTokenExpiry liegt 15 Minuten in der Zukunft', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(loginTokenExpiry(now).getTime()).toBe(now.getTime() + 15 * 60 * 1000)
  })

  it('sessionExpiry liegt 30 Tage in der Zukunft', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(sessionExpiry(now).getTime()).toBe(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  })

  it('isExpired vergleicht korrekt', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(isExpired(new Date('2025-12-31T23:59:59Z'), now)).toBe(true)
    expect(isExpired(new Date('2026-01-01T00:00:01Z'), now)).toBe(false)
  })
})
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/tokens.test.ts`
Expected: FAIL (Modul `@/src/auth/tokens` existiert nicht).

- [ ] **Step 3: Implementierung**

`src/auth/tokens.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto'

const LOGIN_TTL_MS = 15 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export function loginTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + LOGIN_TTL_MS)
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS)
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npx vitest run tests/tokens.test.ts`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/auth/tokens.ts tests/tokens.test.ts
git commit -m "feat(auth): Krypto-Helfer für Login-/Session-Tokens (TDD)"
```

---

## Task 3: Rate-Limiter (`rateLimit.ts`) — TDD

**Files:**
- Create: `src/auth/rateLimit.ts`
- Test: `tests/rateLimit.test.ts`

- [ ] **Step 1: Failing test schreiben**

`tests/rateLimit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '@/src/auth/rateLimit'

describe('createRateLimiter', () => {
  it('erlaubt bis zum Limit und blockt danach', () => {
    let t = 1000
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('setzt nach Ablauf des Fensters zurück', () => {
    let t = 1000
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => t })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    t = 2001
    expect(limiter.allow('a')).toBe(true)
  })

  it('trennt Schlüssel', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('b')).toBe(true)
  })
})
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/rateLimit.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung**

`src/auth/rateLimit.ts`:

```ts
type Entry = { count: number; resetAt: number }

export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? (() => Date.now())
  const hits = new Map<string, Entry>()
  return {
    allow(key: string): boolean {
      const t = now()
      const e = hits.get(key)
      if (!e || t >= e.resetAt) {
        hits.set(key, { count: 1, resetAt: t + opts.windowMs })
        return true
      }
      if (e.count >= opts.max) return false
      e.count++
      return true
    },
  }
}

// Gemeinsamer Limiter für Login-Anfragen: 5 pro 10 Minuten je Schlüssel.
// Hinweis: In-Memory, pro Prozess — ausreichend für den Single-Container-Deploy.
export const loginRateLimiter = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 })
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npx vitest run tests/rateLimit.test.ts`
Expected: PASS (3 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/auth/rateLimit.ts tests/rateLimit.test.ts
git commit -m "feat(auth): In-Memory-Rate-Limiter für Login-Anfragen (TDD)"
```

---

## Task 4: Repo-Funktionen (Accounts/Tokens/Backfill/Dashboard/Delete)

**Files:**
- Modify: `src/db/repo.ts`

- [ ] **Step 1: Imports & `saveScan` erweitern**

In `src/db/repo.ts` die Importzeile für das Schema um `accounts`, `loginTokens`, `sessions` erweitern und die Operatoren `desc`, `sql` ergänzen (`eq` ist bereits da):

```ts
import { db } from '@/src/db/client'
import { scans, leads, accounts, loginTokens, sessions } from '@/src/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { ensureSchema } from '@/src/db/migrate'
import { isExpired } from '@/src/auth/tokens'
import type { ScanResult } from '@/src/engine/types'
import type { AiAnalysis } from '@/src/ai/types'
import type { BrandVisibility } from '@/src/ai/types'
```

`saveScan` so ändern, dass es eine optionale `accountId` annimmt:

```ts
export async function saveScan(r: ScanResult, accountId?: number | null): Promise<number> {
  await ensureSchema()
  const [row] = await db.insert(scans).values({
    url: r.url, domain: r.domain, total: r.total,
    categories: r.categories, checks: r.checks,
    contentExcerpt: r.contentExcerpt ?? '',
    accountId: accountId ?? null,
  }).returning({ id: scans.id })
  return row.id
}
```

- [ ] **Step 2: Account-/Token-/Backfill-/Dashboard-/Delete-Funktionen anfügen**

Am Ende von `src/db/repo.ts`:

```ts
// ---- Accounts & Auth (Stufe 4a) ----

export async function findOrCreateAccount(email: string): Promise<number> {
  await ensureSchema()
  const normalized = email.toLowerCase()
  const [existing] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, normalized))
  if (existing) {
    await db.update(accounts).set({ lastLoginAt: new Date() }).where(eq(accounts.id, existing.id))
    return existing.id
  }
  const [created] = await db.insert(accounts)
    .values({ email: normalized, lastLoginAt: new Date() })
    .returning({ id: accounts.id })
  return created.id
}

export async function createLoginToken(email: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await ensureSchema()
  await db.insert(loginTokens).values({ email: email.toLowerCase(), tokenHash, expiresAt })
}

/** Prüft & verbraucht einen Login-Token. Liefert die E-Mail oder null. */
export async function consumeLoginToken(tokenHash: string): Promise<string | null> {
  await ensureSchema()
  const [row] = await db.select().from(loginTokens).where(eq(loginTokens.tokenHash, tokenHash))
  if (!row || row.usedAt || isExpired(row.expiresAt)) return null
  await db.update(loginTokens).set({ usedAt: new Date() }).where(eq(loginTokens.id, row.id))
  return row.email
}

/** Ordnet einmalig alle Alt-Scans dieser E-Mail (via leads) dem Account zu. */
export async function backfillScans(accountId: number, email: string): Promise<void> {
  await ensureSchema()
  await db.execute(sql`
    UPDATE scans SET account_id = ${accountId}
    WHERE account_id IS NULL
      AND id IN (SELECT scan_id FROM leads WHERE lower(email) = ${email.toLowerCase()})
  `)
}

export async function getAccountScans(accountId: number) {
  await ensureSchema()
  return db.select().from(scans).where(eq(scans.accountId, accountId)).orderBy(desc(scans.createdAt))
}

/** DSGVO-Löschung: personenbezogene Daten entfernen, Scans anonymisieren. */
export async function deleteAccount(accountId: number, email: string): Promise<void> {
  await ensureSchema()
  const normalized = email.toLowerCase()
  await db.update(scans).set({ accountId: null }).where(eq(scans.accountId, accountId))
  await db.delete(sessions).where(eq(sessions.accountId, accountId))
  await db.execute(sql`DELETE FROM login_tokens WHERE lower(email) = ${normalized}`)
  await db.execute(sql`DELETE FROM leads WHERE lower(email) = ${normalized}`)
  await db.delete(accounts).where(eq(accounts.id, accountId))
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler. (Benötigte Operatoren: `eq`, `desc`, `sql` — keine ungenutzten Imports stehen lassen.)

- [ ] **Step 4: Commit**

```bash
git add src/db/repo.ts
git commit -m "feat(db): Repo-Funktionen für Accounts, Login-Tokens, Backfill, Dashboard, Löschung"
```

---

## Task 5: Session-Modul

**Files:**
- Create: `src/auth/session.ts`

- [ ] **Step 1: Implementierung**

`src/auth/session.ts`:

```ts
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/src/db/client'
import { sessions, accounts } from '@/src/db/schema'
import { ensureSchema } from '@/src/db/migrate'
import { generateToken, hashToken, sessionExpiry, isExpired } from '@/src/auth/tokens'

export const SESSION_COOKIE = 'aeo_session'

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }

/** Nur aus Route Handlern / Server Functions aufrufen (schreibt ein Cookie). */
export async function createSession(accountId: number): Promise<void> {
  await ensureSchema()
  const { token, tokenHash } = generateToken()
  const expiresAt = sessionExpiry()
  await db.insert(sessions).values({ accountId, tokenHash, expiresAt, lastSeenAt: new Date() })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, { ...COOKIE_OPTS, expires: expiresAt })
}

/** Liest die aktuelle Session. Sicher in Server Components (schreibt kein Cookie). */
export async function getSession(): Promise<{ accountId: number; email: string } | null> {
  await ensureSchema()
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const [row] = await db.select({
    id: sessions.id, accountId: sessions.accountId, expiresAt: sessions.expiresAt, email: accounts.email,
  }).from(sessions).innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
  if (!row) return null
  if (isExpired(row.expiresAt)) {
    await db.delete(sessions).where(eq(sessions.id, row.id))
    return null
  }
  return { accountId: row.accountId, email: row.email }
}

/** Nur aus Route Handlern / Server Functions aufrufen (löscht Cookie). */
export async function destroySession(): Promise<void> {
  await ensureSchema()
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  store.set(SESSION_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/auth/session.ts
git commit -m "feat(auth): DB-gestützte Session via HttpOnly-Cookie (create/get/destroy)"
```

---

## Task 6: Magic-Link-Mail

**Files:**
- Modify: `src/mail/notifier.ts`

- [ ] **Step 1: Transport-Helfer extrahieren & `sendMagicLink` ergänzen**

`src/mail/notifier.ts` komplett ersetzen:

```ts
import nodemailer from 'nodemailer'

function createTransport() {
  if (!process.env.SMTP_HOST) return null
  const port = Number(process.env.SMTP_PORT ?? 587)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implizites TLS, 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
}

export async function notifyLead(email: string, domain: string, total: number): Promise<void> {
  const transport = createTransport()
  if (!transport) { console.warn('SMTP nicht konfiguriert, überspringe Mail'); return }
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `Neuer AEO-Lead: ${domain} (Score ${total})`,
    text: `E-Mail: ${email}\nDomain: ${domain}\nScore: ${total}/100`,
  })
}

export async function sendMagicLink(email: string, link: string): Promise<void> {
  const transport = createTransport()
  if (!transport) { console.warn('SMTP nicht konfiguriert, überspringe Magic-Link'); return }
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Dein Login-Link für aeo.kortschak.online',
    text: `Hallo,\n\nhier ist dein Login-Link für das AEO-Tool:\n${link}\n\nDer Link ist 15 Minuten gültig und kann nur einmal verwendet werden. Falls du keinen Login angefordert hast, ignoriere diese E-Mail.\n\n— AEO-Tool, Kortschak`,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/mail/notifier.ts
git commit -m "feat(mail): sendMagicLink + gemeinsamer Transport-Helfer"
```

---

## Task 7: Route `POST /api/auth/request`

**Files:**
- Create: `app/api/auth/request/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/auth/request/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateToken } from '@/src/auth/tokens'
import { loginTokenExpiry } from '@/src/auth/tokens'
import { createLoginToken } from '@/src/db/repo'
import { sendMagicLink } from '@/src/mail/notifier'
import { loginRateLimiter } from '@/src/auth/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 30

const Body = z.object({ email: z.string().email() })

function baseUrl(req: NextRequest): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'aeo.kortschak.online'
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige E-Mail' }, { status: 400 })

  const email = parsed.data.email.toLowerCase()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  // Rate-Limit, antwortet aber weiterhin generisch (keine Enumeration).
  if (loginRateLimiter.allow(`${email}|${ip}`)) {
    const { token, tokenHash } = generateToken()
    await createLoginToken(email, tokenHash, loginTokenExpiry())
    const link = `${baseUrl(req)}/api/auth/callback?token=${token}`
    try {
      await sendMagicLink(email, link)
    } catch (e) {
      console.error('Magic-Link-Mail fehlgeschlagen:', e)
    }
  }

  // Immer gleiche Antwort — keine Account-Enumeration.
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/request/route.ts
git commit -m "feat(auth): POST /api/auth/request — Magic-Link anfordern (Rate-Limit, keine Enumeration)"
```

---

## Task 8: Route `GET /api/auth/callback`

**Files:**
- Create: `app/api/auth/callback/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/auth/callback/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { hashToken } from '@/src/auth/tokens'
import { consumeLoginToken, findOrCreateAccount, backfillScans } from '@/src/db/repo'
import { createSession } from '@/src/auth/session'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) redirect('/login?error=invalid')

  const email = await consumeLoginToken(hashToken(token))
  if (!email) redirect('/login?error=expired')

  const accountId = await findOrCreateAccount(email)
  await backfillScans(accountId, email)
  await createSession(accountId)

  redirect('/dashboard')
}
```

> **Hinweis:** `redirect()` wirft `NEXT_REDIRECT` — daher kein `try/catch` um diese Aufrufe. Cookie wird in `createSession()` **vor** dem finalen `redirect` gesetzt.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/callback/route.ts
git commit -m "feat(auth): GET /api/auth/callback — Token einlösen, Backfill, Session, Redirect"
```

---

## Task 9: Routen `logout` & `account/delete`

**Files:**
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/account/delete/route.ts`

- [ ] **Step 1: Logout-Route**

`app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { destroySession } from '@/src/auth/session'

export const runtime = 'nodejs'

export async function POST() {
  await destroySession()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Account-Löschen-Route**

`app/api/account/delete/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getSession, destroySession } from '@/src/auth/session'
import { deleteAccount } from '@/src/db/repo'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
  await deleteAccount(session.accountId, session.email)
  await destroySession()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/logout/route.ts app/api/account/delete/route.ts
git commit -m "feat(auth): Logout- und Account-Löschen-Routen"
```

---

## Task 10: `/api/scan` mit Account-Kontext

**Files:**
- Modify: `app/api/scan/route.ts`

- [ ] **Step 1: Session lesen & `accountId`/`owned` anhängen**

`app/api/scan/route.ts` ersetzen:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runScan } from '@/src/engine/scan'
import { saveScan } from '@/src/db/repo'
import { getSession } from '@/src/auth/session'

export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({ url: z.string().min(3) })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige URL' }, { status: 400 })
  try {
    const session = await getSession()
    const result = await runScan(parsed.data.url)
    const id = await saveScan(result, session?.accountId ?? null)
    return NextResponse.json({ id, result, owned: !!session })
  } catch (e) {
    return NextResponse.json({ error: 'Scan fehlgeschlagen', detail: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/scan/route.ts
git commit -m "feat(scan): eingeloggte Scans dem Account zuordnen, owned-Flag zurückgeben"
```

---

## Task 11: `ReportView` extrahieren + `/` refactoren + `/report/[id]`

**Files:**
- Create: `components/ReportView.tsx`
- Modify: `app/page.tsx`
- Create: `app/report/[id]/page.tsx`

- [ ] **Step 1: `ReportView` als Client-Komponente anlegen**

`components/ReportView.tsx` — übernimmt exakt die Report-JSX aus `app/page.tsx`, mit steuerbarem Initial-Unlock und optionalem Reset:

```tsx
"use client";

import { useState } from "react";
import ScoreRing from "@/components/ScoreRing";
import CategoryCard from "@/components/CategoryCard";
import EmailGate from "@/components/EmailGate";
import { CATEGORY_LABELS, type Category, type ScanResult } from "@/components/types";

const CARD_ORDER: Category[] = ["technik", "auffindbarkeit", "content", "ki_sichtbarkeit"];

export default function ReportView({
  result,
  scanId,
  initiallyUnlocked = false,
  onReset,
}: {
  result: ScanResult;
  scanId: number;
  initiallyUnlocked?: boolean;
  onReset?: () => void;
}) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);

  const byCategory = new Map<Category, number>();
  for (const c of result.categories) byCategory.set(c.category, c.score);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <div className="animate-fade-up flex flex-col items-center text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">AEO-Report</p>
        <h1 className="mt-3 font-serif text-2xl font-medium text-ink sm:text-3xl">{result.domain}</h1>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 max-w-full truncate font-mono text-xs text-faint underline-offset-4 hover:underline"
        >
          {result.url}
        </a>
      </div>

      <div className="animate-fade-up mt-10 flex justify-center" style={{ animationDelay: "100ms" }}>
        <ScoreRing score={result.total} />
      </div>

      <div
        className="animate-fade-up mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2"
        style={{ animationDelay: "180ms" }}
      >
        {CARD_ORDER.map((cat) => (
          <CategoryCard
            key={cat}
            label={CATEGORY_LABELS[cat]}
            score={byCategory.get(cat) ?? 0}
            soon={cat === "ki_sichtbarkeit"}
          />
        ))}
      </div>

      <EmailGate
        scanId={scanId}
        checks={result.checks}
        unlocked={unlocked}
        onUnlock={() => setUnlocked(true)}
      />

      {onReset && (
        <div className="mt-14 flex justify-center border-t border-line pt-10">
          <button
            onClick={onReset}
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
          >
            ← Neue Seite scannen
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `app/page.tsx` auf `ReportView` umstellen**

In `app/page.tsx`: die Imports von `ScoreRing`, `CategoryCard`, `EmailGate`, `CATEGORY_LABELS` und die lokale `CARD_ORDER`-Konstante entfernen (werden jetzt von `ReportView` gekapselt). `ReportView` importieren:

```tsx
import ReportView from "@/components/ReportView";
```

`unlocked`/`setUnlocked`-State darf bleiben oder entfernt werden — wir nutzen jetzt das `owned`-Flag. `handleScan` so erweitern, dass `owned` gemerkt wird:

```tsx
  const [owned, setOwned] = useState(false);
```
In `handleScan` nach erfolgreichem Fetch zusätzlich `setOwned(Boolean(data.owned));` setzen (und in `reset()` `setOwned(false);`).

Den gesamten `// result`-Block (ab `const byCategory = …` bis zum schließenden `</main>`) ersetzen durch:

```tsx
  // result
  if (!result || scanId === null) return null;

  return (
    <main className="flex flex-1 flex-col">
      <ReportView
        result={result}
        scanId={scanId}
        initiallyUnlocked={owned}
        onReset={reset}
      />
    </main>
  );
```

- [ ] **Step 3: `/report/[id]` Server-Seite**

`app/report/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getScan } from "@/src/db/repo";
import { getSession } from "@/src/auth/session";
import ReportView from "@/components/ReportView";
import type { ScanResult } from "@/components/types";

export const runtime = "nodejs";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getScan(Number(id));
  if (!scan) notFound();

  const session = await getSession();
  const owned = !!session && scan.accountId != null && scan.accountId === session.accountId;
  if (!owned) redirect("/login");

  const result: ScanResult = {
    url: scan.url,
    domain: scan.domain,
    total: scan.total,
    categories: scan.categories as ScanResult["categories"],
    checks: scan.checks as ScanResult["checks"],
    contentExcerpt: scan.contentExcerpt ?? "",
  };

  return (
    <main className="flex flex-1 flex-col">
      <ReportView result={result} scanId={scan.id} initiallyUnlocked />
    </main>
  );
}
```

> **Wenn der TS-Typ von `ScanResult` (`components/types.ts`) kein `contentExcerpt` enthält:** das Feld aus dem Objekt-Literal weglassen — `ReportView` nutzt es nicht. Vor dem Schreiben `components/types.ts` kurz lesen und das Literal an die echten Feldnamen anpassen.

- [ ] **Step 4: Build (prüft RSC + Client-Komponenten + Typen)**

Run: `npm run build`
Expected: Build erfolgreich, keine Typfehler. Routen `/report/[id]` und `/` werden gelistet.

- [ ] **Step 5: Commit**

```bash
git add components/ReportView.tsx app/page.tsx app/report/
git commit -m "refactor(report): ReportView extrahieren; /report/[id] für gespeicherte Scans"
```

---

## Task 12: Login-Seite + Formular

**Files:**
- Create: `components/LoginForm.tsx`
- Create: `app/login/page.tsx`

- [ ] **Step 1: `LoginForm` (Client)**

`components/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function LoginForm({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="animate-fade-up w-full max-w-md text-center">
        <h1 className="font-serif text-2xl font-medium text-ink">Schau in dein Postfach</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Wenn ein Zugang zu <span className="text-ink">{email}</span> existiert, haben wir dir einen
          Login-Link geschickt. Er ist 15 Minuten gültig.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="animate-fade-up w-full max-w-md text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Anmelden</p>
      <h1 className="mt-3 font-serif text-3xl font-medium text-ink">Dein AEO-Dashboard</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Gib deine E-Mail ein — wir schicken dir einen Login-Link. Kein Passwort nötig.
      </p>
      {error && (
        <p className="mt-4 text-sm text-brand">
          Der Link war ungültig oder abgelaufen. Fordere einen neuen an.
        </p>
      )}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="dein@unternehmen.at"
        className="mt-6 w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand"
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-brand px-6 py-3 font-sans text-sm font-semibold text-ink transition-colors hover:bg-brand-alt disabled:opacity-60"
      >
        {loading ? "Wird gesendet…" : "Login-Link schicken"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `/login` Server-Seite**

`app/login/page.tsx`:

```tsx
import LoginForm from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <LoginForm error={error} />
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build erfolgreich; Route `/login` gelistet.

- [ ] **Step 4: Commit**

```bash
git add components/LoginForm.tsx app/login/
git commit -m "feat(auth): Login-Seite mit Magic-Link-Formular"
```

---

## Task 13: Dashboard + Re-Scan + Account-Menü + Sparkline

**Files:**
- Create: `components/Sparkline.tsx`
- Create: `components/RescanButton.tsx`
- Create: `components/AccountMenu.tsx`
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: `Sparkline` (rein, ohne Hooks)**

`components/Sparkline.tsx`:

```tsx
export default function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const w = 120;
  const h = 28;
  const max = 100;
  const step = w / (scores.length - 1);
  const points = scores
    .map((s, i) => `${(i * step).toFixed(1)},${(h - (s / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-brand" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: `RescanButton` (Client)**

`components/RescanButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RescanButton({ url }: { url: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function rescan() {
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/report/${data.id}`);
      else router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={rescan}
      disabled={loading}
      className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted transition-colors hover:text-ink disabled:opacity-60"
    >
      {loading ? "Scannt…" : "Erneut scannen"}
    </button>
  );
}
```

- [ ] **Step 3: `AccountMenu` (Client) — Logout + Löschen**

`components/AccountMenu.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function deleteAccount() {
    if (!confirm("Account und alle persönlichen Daten endgültig löschen? Deine Scan-Daten werden anonymisiert.")) return;
    setBusy(true);
    await fetch("/api/account/delete", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="font-mono text-faint">{email}</span>
      <button onClick={logout} disabled={busy} className="text-muted hover:text-ink disabled:opacity-60">
        Abmelden
      </button>
      <button onClick={deleteAccount} disabled={busy} className="text-muted hover:text-brand disabled:opacity-60">
        Account löschen
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `/dashboard` Server-Seite (nach Domain gruppiert)**

`app/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/src/auth/session";
import { getAccountScans } from "@/src/db/repo";
import ScoreRing from "@/components/ScoreRing";
import Sparkline from "@/components/Sparkline";
import RescanButton from "@/components/RescanButton";
import AccountMenu from "@/components/AccountMenu";

export const runtime = "nodejs";

type ScanRow = {
  id: number;
  url: string;
  domain: string;
  total: number;
  createdAt: Date;
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = (await getAccountScans(session.accountId)) as ScanRow[];

  // Nach Domain gruppieren, je Domain neueste zuerst.
  const byDomain = new Map<string, ScanRow[]>();
  for (const r of rows) {
    const list = byDomain.get(r.domain) ?? [];
    list.push(r);
    byDomain.set(r.domain, list);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Dashboard</p>
          <h1 className="mt-2 font-serif text-3xl font-medium text-ink">Deine Domains</h1>
        </div>
        <AccountMenu email={session.email} />
      </div>

      {byDomain.size === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-muted">Noch keine Scans.</p>
          <Link href="/" className="mt-4 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-ink hover:bg-brand-alt">
            Erste Seite scannen
          </Link>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-8">
          {[...byDomain.entries()].map(([domain, scans]) => {
            const latest = scans[0];
            const trend = [...scans].reverse().map((s) => s.total);
            return (
              <section key={domain} className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={latest.total} />
                    <div>
                      <h2 className="font-serif text-lg font-medium text-ink">{domain}</h2>
                      <p className="font-mono text-xs text-faint">
                        zuletzt {latest.createdAt.toLocaleDateString("de-AT")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <Sparkline scores={trend} />
                    <RescanButton url={latest.url} />
                  </div>
                </div>

                <ul className="mt-5 divide-y divide-line border-t border-line">
                  {scans.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-mono text-xs text-muted">
                        {s.createdAt.toLocaleDateString("de-AT")} · Score {s.total}
                      </span>
                      <Link href={`/report/${s.id}`} className="text-xs text-brand hover:underline">
                        Report öffnen →
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

> **Hinweis:** `ScoreRing` wird hier in einer Server Component verwendet. Falls `ScoreRing` ein `"use client"`-Modul ist, funktioniert das problemlos (Client-Komponente in RSC eingebettet). Vor dem Bau `components/ScoreRing.tsx` kurz prüfen: nimmt es wirklich `score: number`? Falls der Prop anders heißt, hier anpassen.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Build erfolgreich; Route `/dashboard` gelistet.

- [ ] **Step 6: Commit**

```bash
git add components/Sparkline.tsx components/RescanButton.tsx components/AccountMenu.tsx app/dashboard/
git commit -m "feat(dashboard): Domain-Verlauf, Re-Scan, Score-Trend, Account-Menü"
```

---

## Task 14: Header-Link + Datenschutz

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/SiteHeader.tsx`
- Modify: `app/datenschutz/page.tsx`

- [ ] **Step 1: Login-Status in den Header bringen**

Zuerst `app/layout.tsx` und `components/SiteHeader.tsx` lesen. `layout.tsx` ist eine Server Component → dort die Session lesen und als Prop an `SiteHeader` geben.

In `app/layout.tsx`: importieren und Session ermitteln, an `<SiteHeader />` übergeben:

```tsx
import { getSession } from "@/src/auth/session";
```
Die Layout-Funktion zu `async` machen (falls noch nicht) und vor dem Return:
```tsx
  const session = await getSession();
```
Dann `<SiteHeader isLoggedIn={!!session} />`.

In `components/SiteHeader.tsx`: Prop `isLoggedIn?: boolean` ergänzen und im Nav-Bereich (neben dem Logo) einen Link rendern. Die genaue JSX-Position an die vorhandene Struktur anpassen; das Element:

```tsx
import Link from "next/link";
// …
<Link
  href={isLoggedIn ? "/dashboard" : "/login"}
  className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
>
  {isLoggedIn ? "Dashboard" : "Anmelden"}
</Link>
```

> Falls `SiteHeader` aktuell eine reine Server-Komponente ohne Props ist, genügt das Hinzufügen des Props. Falls es `"use client"` ist, funktioniert die Prop-Übergabe vom Server-Layout ebenfalls.

- [ ] **Step 2: Datenschutz-Abschnitt ergänzen**

`app/datenschutz/page.tsx` lesen und einen neuen Abschnitt im bestehenden Stil einfügen (gleiche Überschriften-/Absatz-Komponenten wie die Nachbarabschnitte verwenden). Inhalt:

> **Nutzerkonten & Login**
> Wer ein Konto anlegt, wird per Magic-Link angemeldet: Wir senden einen einmaligen Login-Link an die angegebene E-Mail-Adresse. Wir speichern dazu die E-Mail-Adresse, Zeitpunkte von Erstellung und letztem Login sowie kurzlebige Login-Tokens (15 Minuten gültig). Für die Anmeldung setzen wir ein technisch notwendiges Session-Cookie (`aeo_session`, HttpOnly, 30 Tage) — dieses dient ausschließlich dem eingeloggten Zustand und erfordert keine Einwilligung. Einem Konto werden die mit derselben E-Mail durchgeführten Scans zugeordnet, damit der Verlauf sichtbar ist.
>
> **Löschung**
> Du kannst dein Konto jederzeit im Dashboard löschen. Dabei werden E-Mail-Adresse, Sitzungen, Login-Tokens und die zugehörigen Lead-Einträge entfernt; verbleibende Scan-Daten (Domain und Score) werden anonymisiert und sind danach keiner Person mehr zuordenbar.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/SiteHeader.tsx app/datenschutz/page.tsx
git commit -m "feat(ui): Header-Login/Dashboard-Link; Datenschutz um Konten/Cookie erweitert"
```

---

## Task 15: Gesamt-Verifikation

**Files:** keine (nur Prüfungen)

- [ ] **Step 1: Alle Tests**

Run: `npm test`
Expected: Alle Tests grün (bestehende + `tokens` + `rateLimit`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: keine Fehler (ungenutzte Imports ggf. entfernen).

- [ ] **Step 3: Production-Build**

Run: `npm run build`
Expected: Erfolgreich; gelistete Routen enthalten `/login`, `/dashboard`, `/report/[id]`, `/api/auth/request`, `/api/auth/callback`, `/api/auth/logout`, `/api/account/delete`.

- [ ] **Step 4: Lokaler Smoke-Test (manuell, falls lokale DB/SMTP vorhanden)**

Mit gesetzter `DATABASE_URL` (und optional SMTP):
1. `npm run dev`
2. `/login` → E-Mail eingeben → „Schau in dein Postfach". Bei fehlendem SMTP: Magic-Link-URL aus dem Server-Log kopieren.
3. Callback-Link öffnen → Redirect auf `/dashboard`.
4. Wurde mit derselben E-Mail vorher anonym ein Scan freigeschaltet, erscheint dieser im Dashboard (Backfill).
5. „Erneut scannen" → neuer Report unter `/report/[id]`, ungeblockt.
6. „Account löschen" → zurück auf `/`, Konto weg, Scans anonymisiert.

> Ohne lokale DB ist der Smoke-Test auf dem Server nach dem Deploy nachzuholen (`ensureSchema()` legt die Tabellen beim ersten Zugriff an).

- [ ] **Step 5: Deploy (nach Merge auf `master`)**

Wie etabliert: Push auf `master` → GitHub Actions baut Image → nach erfolgreichem Run `VPS_updateProjectV1(virtualMachineId=1478430, projectName="aeo")`. Danach Smoke-Test live unter https://aeo.kortschak.online.

> Optional: Env `APP_BASE_URL=https://aeo.kortschak.online` als Projekt-Env am VPS setzen (sonst wird die Basis-URL aus den Traefik-Forward-Headern abgeleitet).

---

## Self-Review-Notiz (Plan ↔ Spec)

- **Auth/Magic-Link** → Tasks 2,5,6,7,8,12. **Session (DB+Cookie)** → Tasks 1,5. **Leads↔Account rückwirkend** → Task 4 (`backfillScans`) + 8. **Dashboard (Verlauf/Re-Scan/Trend)** → Task 13. **Report öffnen** → Task 11. **Gate-Skip für Eingeloggte** → Task 10 (`owned`) + 11. **Account-Löschung/DSGVO** → Tasks 4,9,14. **Sicherheit (Hash, Einmal-Token, keine Enumeration, Rate-Limit)** → Tasks 2,3,4,7. **Datenschutz-Text** → Task 14. **Tests** → Tasks 2,3 (reine Logik) + Build/Smoke für Glue.
- **Bewusste Spec-Abweichung:** feste 30-Tage-Session statt gleitend (RSC-Cookie-Beschränkung) — oben dokumentiert.
- **Bewusst nicht getestet per Unit-Test:** DB-/Route-/RSC-Glue (kein DB in Vitest-`node`-Env, wie im bestehenden Code) → über Build + manuellen Smoke-Test abgesichert.

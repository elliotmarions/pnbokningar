import postgres from 'postgres'
import { isHolidayOrEve } from './holidays'
import { formatSwedishPhone } from './phone'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // Required for Supabase transaction pooler (pgbouncer)
})

export function getDb() {
  return sql
}

let _migrationPromise: Promise<void> | null = null
export function ensureMigrated(): Promise<void> {
  if (!_migrationPromise) {
    _migrationPromise = migrate().catch((err) => {
      // Don't permanently cache a failure — allow retry on the next request.
      _migrationPromise = null
      throw err
    })
  }
  return _migrationPromise
}

async function migrate() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT,
      phone       TEXT,
      role        TEXT NOT NULL DEFAULT 'driver',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS shifts (
      id           SERIAL PRIMARY KEY,
      week_year    INTEGER NOT NULL,
      week_number  INTEGER NOT NULL,
      day_index    INTEGER NOT NULL,
      date         TEXT NOT NULL,
      is_open      INTEGER NOT NULL DEFAULT 1,
      slots        INTEGER NOT NULL DEFAULT 5,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (week_year, week_number, day_index)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id               SERIAL PRIMARY KEY,
      shift_id         INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      user_id          TEXT    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
      applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rejected         INTEGER NOT NULL DEFAULT 0,
      rejection_reason TEXT,
      UNIQUE (shift_id, user_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS approvals (
      id              SERIAL PRIMARY KEY,
      application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
      approved_by     TEXT    NOT NULL REFERENCES users(id),
      approved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sms_sent        INTEGER NOT NULL DEFAULT 0,
      reminder_sent   INTEGER NOT NULL DEFAULT 0
    )
  `
  // Drop legacy password_hash column from the credentials-auth era.
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS password_hash`
  // Add withdrawn column (admin removed previously-approved driver)
  await sql`
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS withdrawn INTEGER NOT NULL DEFAULT 0
  `
  // Add withdrawal_reason column (internal admin note, not shown to drivers)
  await sql`
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT
  `
  // Track which admin performed the withdrawal (shown in withdrawal history)
  await sql`
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS withdrawn_by TEXT REFERENCES users(id)
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_applications_withdrawn_by ON applications(withdrawn_by)`
  // Reserve list: driver can join when shift is full
  await sql`
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS reserve INTEGER NOT NULL DEFAULT 0
  `
  // Track whether a shift was ever opened by admin (distinguishes "never opened" from "opened then closed")
  await sql`
    ALTER TABLE shifts ADD COLUMN IF NOT EXISTS ever_opened INTEGER NOT NULL DEFAULT 0
  `
  // Backfill: mark shifts as ever_opened if they are currently open OR have had applicants
  await sql`
    UPDATE shifts SET ever_opened = 1
    WHERE ever_opened = 0
      AND (
        is_open = 1
        OR id IN (SELECT DISTINCT shift_id FROM applications)
      )
  `
  // Long-term bookings
  await sql`
    CREATE TABLE IF NOT EXISTS long_term_bookings (
      id             SERIAL PRIMARY KEY,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_date      TEXT NOT NULL,
      to_date        TEXT NOT NULL,
      excluded_dates TEXT NOT NULL DEFAULT '[]',
      notes          TEXT,
      created_by     TEXT NOT NULL REFERENCES users(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  // Web Push subscriptions (per-device) — wrapped in try/catch so a failure
  // here can never block other migrations or app functionality.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id         SERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint   TEXT NOT NULL UNIQUE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`
    await sql`ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY`
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'push_subscriptions' AND policyname = 'service_role_all'
        ) THEN
          EXECUTE 'CREATE POLICY service_role_all ON push_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true)';
        END IF;
      END $$
    `)
  } catch (err) {
    console.error('[migrate] push_subscriptions migration failed (non-fatal):', err)
  }

  // Activity log — immutable audit trail of booking actions. Names are
  // denormalized (snapshot) so entries stay readable even if a user is later
  // renamed or deleted. No FKs for the same reason.
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS activity_log (
        id           SERIAL PRIMARY KEY,
        action       TEXT NOT NULL,
        actor_name   TEXT,
        driver_name  TEXT,
        shift_date   TEXT,
        day_index    INTEGER,
        detail       TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)`
    await sql`ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY`
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'activity_log' AND policyname = 'service_role_all'
        ) THEN
          EXECUTE 'CREATE POLICY service_role_all ON activity_log FOR ALL TO service_role USING (true) WITH CHECK (true)';
        END IF;
      END $$
    `)
  } catch (err) {
    console.error('[migrate] activity_log migration failed (non-fatal):', err)
  }

  // Custom closed days (admin-defined, with reason + color)
  await sql`
    CREATE TABLE IF NOT EXISTS custom_closed_days (
      id         SERIAL PRIMARY KEY,
      date       TEXT NOT NULL UNIQUE,
      reason     TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#EF4444',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  // Indexes for query performance
  await sql`CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date)`
  await sql`CREATE INDEX IF NOT EXISTS idx_applications_shift_id ON applications(shift_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_approvals_application_id ON approvals(application_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_long_term_dates ON long_term_bookings(from_date, to_date)`

  // Indexes for unindexed foreign keys (Supabase advisor)
  await sql`CREATE INDEX IF NOT EXISTS idx_approvals_approved_by ON approvals(approved_by)`
  await sql`CREATE INDEX IF NOT EXISTS idx_long_term_user_id ON long_term_bookings(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_long_term_created_by ON long_term_bookings(created_by)`
  await sql`CREATE INDEX IF NOT EXISTS idx_custom_closed_created_by ON custom_closed_days(created_by)`

  // Enable Row Level Security on all tables (server-side app — service_role bypasses RLS)
  await sql`ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE shifts ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE applications ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE approvals ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE long_term_bookings ENABLE ROW LEVEL SECURITY`
  await sql`ALTER TABLE custom_closed_days ENABLE ROW LEVEL SECURITY`

  // Allow service_role full access (all DB calls go through the server-side API)
  for (const table of ['schema_migrations', 'users', 'shifts', 'applications', 'approvals', 'long_term_bookings', 'custom_closed_days']) {
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = '${table}' AND policyname = 'service_role_all'
        ) THEN
          EXECUTE 'CREATE POLICY service_role_all ON ${table} FOR ALL TO service_role USING (true) WITH CHECK (true)';
        END IF;
      END $$
    `)
  }

  // One-time backfill: normalize all existing phone numbers to the canonical
  // "070 966 98 55" format. Gated by a schema_migrations marker so it runs once.
  try {
    const [done] = await sql<{ version: number }[]>`SELECT version FROM schema_migrations WHERE version = 1001`
    if (!done) {
      const rows = await sql<{ id: string; phone: string }[]>`
        SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone <> ''
      `
      for (const r of rows) {
        const formatted = formatSwedishPhone(r.phone)
        if (formatted !== r.phone) {
          await sql`UPDATE users SET phone = ${formatted} WHERE id = ${r.id}`
        }
      }
      await sql`INSERT INTO schema_migrations (version) VALUES (1001) ON CONFLICT DO NOTHING`
    }
  } catch (err) {
    console.error('[migrate] phone backfill failed (non-fatal):', err)
  }

  // One-time backfill: clear bookings on dates that were excluded from a
  // long-term booking before the toggle-date fix removed them automatically.
  try {
    const [done] = await sql<{ version: number }[]>`SELECT version FROM schema_migrations WHERE version = 1002`
    if (!done) {
      const bookings = await sql<{ user_id: string; excluded_dates: string }[]>`
        SELECT user_id, excluded_dates FROM long_term_bookings
      `
      for (const b of bookings) {
        let excluded: string[] = []
        try { excluded = JSON.parse(b.excluded_dates) } catch { excluded = [] }
        for (const d of excluded) {
          await sql`
            DELETE FROM applications
            WHERE user_id = ${b.user_id}
              AND shift_id IN (SELECT id FROM shifts WHERE date = ${d})
          `
        }
      }
      await sql`INSERT INTO schema_migrations (version) VALUES (1002) ON CONFLICT DO NOTHING`
    }
  } catch (err) {
    console.error('[migrate] long-term excluded-date cleanup failed (non-fatal):', err)
  }
}

// --------------- Users ---------------

export interface DbUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: 'driver' | 'admin'
  created_at: string
  push_enabled?: boolean
}

export const userRepo = {
  async upsert(u: { id: string; name: string; email?: string | null }): Promise<DbUser> {
    await ensureMigrated()
    const [existing] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${u.id}`
    if (existing) {
      await sql`UPDATE users SET name = ${u.name}, email = ${u.email ?? null} WHERE id = ${u.id}`
    } else {
      const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const role = adminIds.includes(u.id) ? 'admin' : 'driver'
      await sql`INSERT INTO users (id, name, email, role) VALUES (${u.id}, ${u.name}, ${u.email ?? null}, ${role})`
    }
    const [user] = await sql<DbUser[]>`SELECT * FROM users WHERE id = ${u.id}`
    return user
  },

  async getById(id: string): Promise<DbUser | undefined> {
    await ensureMigrated()
    const [user] = await sql<DbUser[]>`SELECT * FROM users WHERE id = ${id}`
    return user
  },

  async all(): Promise<DbUser[]> {
    await ensureMigrated()
    return sql<DbUser[]>`
      SELECT u.*,
        EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id) AS push_enabled
      FROM users u
      ORDER BY u.name
    `
  },

  async updatePhone(id: string, phone: string): Promise<void> {
    await sql`UPDATE users SET phone = ${phone} WHERE id = ${id}`
  },

  async setRole(id: string, role: 'driver' | 'admin'): Promise<void> {
    await sql`UPDATE users SET role = ${role} WHERE id = ${id}`
  },

  async delete(id: string): Promise<void> {
    await ensureMigrated()
    await sql`DELETE FROM users WHERE id = ${id}`
  },
}

// --------------- Shifts ---------------

export interface DbShift {
  id: number
  week_year: number
  week_number: number
  day_index: number
  date: string
  is_open: number
  ever_opened: number
  slots: number
  created_at: string
}

export const shiftRepo = {
  async getById(id: number): Promise<DbShift | null> {
    await ensureMigrated()
    const [shift] = await sql<DbShift[]>`SELECT * FROM shifts WHERE id = ${id}`
    return shift ?? null
  },

  async getWeek(weekYear: number, weekNumber: number): Promise<DbShift[]> {
    await ensureMigrated()
    return sql<DbShift[]>`
      SELECT * FROM shifts
      WHERE week_year = ${weekYear} AND week_number = ${weekNumber}
      ORDER BY day_index
    `
  },

  async getWeekWithCounts(weekYear: number, weekNumber: number) {
    await ensureMigrated()
    type Row = DbShift & { approved: number; pending: number; reserves: number }
    return sql<Row[]>`
      SELECT s.*,
        COALESCE(COUNT(DISTINCT ap.id), 0)::int AS approved,
        COALESCE(
          COUNT(DISTINCT CASE WHEN a.rejected = 0 AND a.withdrawn = 0 AND a.reserve = 0 THEN a.id END)
          - COUNT(DISTINCT ap.id), 0
        )::int AS pending,
        COALESCE(COUNT(DISTINCT CASE WHEN a.reserve = 1 AND a.rejected = 0 AND a.withdrawn = 0 THEN a.id END), 0)::int AS reserves
      FROM shifts s
      LEFT JOIN applications a ON a.shift_id = s.id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE s.week_year = ${weekYear} AND s.week_number = ${weekNumber}
      GROUP BY s.id
      ORDER BY s.day_index
    `
  },

  async ensureWeek(
    weekYear: number,
    weekNumber: number,
    days: { dayIndex: number; date: string }[]
  ): Promise<{ shifts: DbShift[]; created: boolean }> {
    await ensureMigrated()

    // Fast path: if the week is fully created, skip the transaction entirely.
    const existing = await shiftRepo.getWeek(weekYear, weekNumber)
    if (existing.length === days.length) return { shifts: existing, created: false }

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    await sql.begin(async tx => {
      for (const d of days) {
        await tx`
          INSERT INTO shifts (week_year, week_number, day_index, date, is_open)
          VALUES (${weekYear}, ${weekNumber}, ${d.dayIndex}, ${d.date}, ${0})
          ON CONFLICT (week_year, week_number, day_index) DO NOTHING
        `
        if (isHolidayOrEve(d.date)) {
          await tx`
            UPDATE shifts SET is_open = 0
            WHERE week_year = ${weekYear} AND week_number = ${weekNumber} AND day_index = ${d.dayIndex}
          `
        }
      }
      await tx`
        UPDATE shifts SET is_open = 0
        WHERE week_year = ${weekYear} AND week_number = ${weekNumber} AND date < ${todayStr}
      `
    })

    const shifts = await shiftRepo.getWeek(weekYear, weekNumber)
    return { shifts, created: true }
  },

  async update(id: number, fields: { is_open?: number; slots?: number }): Promise<void> {
    if (fields.is_open !== undefined) {
      if (fields.is_open === 1) {
        // Mark as ever_opened when admin opens a shift
        await sql`UPDATE shifts SET is_open = 1, ever_opened = 1 WHERE id = ${id}`
      } else {
        await sql`UPDATE shifts SET is_open = ${fields.is_open} WHERE id = ${id}`
      }
    }
    if (fields.slots !== undefined) {
      await sql`UPDATE shifts SET slots = ${fields.slots} WHERE id = ${id}`
    }
  },

  async getMonthWithCounts(from: string, to: string) {
    await ensureMigrated()
    type Row = DbShift & { approved: number; pending: number; reserves: number }
    return sql<Row[]>`
      SELECT s.*,
        COALESCE(COUNT(DISTINCT ap.id), 0)::int AS approved,
        COALESCE(
          COUNT(DISTINCT CASE WHEN a.rejected = 0 AND a.withdrawn = 0 AND a.reserve = 0 THEN a.id END)
          - COUNT(DISTINCT ap.id), 0
        )::int AS pending,
        COALESCE(COUNT(DISTINCT CASE WHEN a.reserve = 1 AND a.rejected = 0 AND a.withdrawn = 0 THEN a.id END), 0)::int AS reserves
      FROM shifts s
      LEFT JOIN applications a ON a.shift_id = s.id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE s.date >= ${from} AND s.date <= ${to}
      GROUP BY s.id
      ORDER BY s.date
    `
  },
}

// --------------- Long-term bookings ---------------

export const longTermRepo = {
  async all() {
    await ensureMigrated()
    return sql<{
      id: number; user_id: string; from_date: string; to_date: string;
      excluded_dates: string; notes: string | null; created_at: string;
      user_name: string; user_phone: string | null;
    }[]>`
      SELECT lt.*, u.name AS user_name, u.phone AS user_phone
      FROM long_term_bookings lt
      JOIN users u ON u.id = lt.user_id
      ORDER BY lt.from_date ASC, u.name ASC
    `
  },

  async create(data: { userId: string; fromDate: string; toDate: string; notes?: string; createdBy: string }) {
    await ensureMigrated()
    const [booking] = await sql<{ id: number }[]>`
      INSERT INTO long_term_bookings (user_id, from_date, to_date, notes, created_by)
      VALUES (${data.userId}, ${data.fromDate}, ${data.toDate}, ${data.notes ?? null}, ${data.createdBy})
      RETURNING id
    `
    return booking
  },

  async delete(id: number) {
    await ensureMigrated()
    await sql`DELETE FROM long_term_bookings WHERE id = ${id}`
  },

  async toggleExcludeDate(id: number, date: string): Promise<string[]> {
    await ensureMigrated()
    const [booking] = await sql<{ excluded_dates: string }[]>`
      SELECT excluded_dates FROM long_term_bookings WHERE id = ${id}
    `
    if (!booking) throw new Error('Not found')
    const excluded: string[] = JSON.parse(booking.excluded_dates)
    const idx = excluded.indexOf(date)
    if (idx >= 0) excluded.splice(idx, 1)
    else excluded.push(date)
    await sql`UPDATE long_term_bookings SET excluded_dates = ${JSON.stringify(excluded)} WHERE id = ${id}`
    return excluded
  },

  async forDate(date: string): Promise<{ id: number; user_id: string }[]> {
    await ensureMigrated()
    const rows = await sql<{ id: number; user_id: string; excluded_dates: string }[]>`
      SELECT id, user_id, excluded_dates
      FROM long_term_bookings
      WHERE from_date <= ${date} AND to_date >= ${date}
    `
    return rows.filter(r => {
      const excluded: string[] = JSON.parse(r.excluded_dates)
      return !excluded.includes(date)
    })
  },
}

// --------------- Custom closed days ---------------

export interface DbCustomClosedDay {
  id: number
  date: string
  reason: string
  color: string
  created_by: string
  created_at: string
}

export const customClosedRepo = {
  async all(): Promise<DbCustomClosedDay[]> {
    await ensureMigrated()
    return sql<DbCustomClosedDay[]>`SELECT * FROM custom_closed_days ORDER BY date ASC`
  },

  async create(data: { date: string; reason: string; color: string; createdBy: string }): Promise<DbCustomClosedDay> {
    await ensureMigrated()
    const [row] = await sql<DbCustomClosedDay[]>`
      INSERT INTO custom_closed_days (date, reason, color, created_by)
      VALUES (${data.date}, ${data.reason}, ${data.color}, ${data.createdBy})
      ON CONFLICT (date) DO UPDATE SET reason = EXCLUDED.reason, color = EXCLUDED.color
      RETURNING *
    `
    return row
  },

  async delete(id: number): Promise<void> {
    await ensureMigrated()
    await sql`DELETE FROM custom_closed_days WHERE id = ${id}`
  },

  async forDate(date: string): Promise<DbCustomClosedDay | null> {
    await ensureMigrated()
    const [row] = await sql<DbCustomClosedDay[]>`SELECT * FROM custom_closed_days WHERE date = ${date}`
    return row ?? null
  },

  // Batch version — returns a Set of dates (YYYY-MM-DD) that are custom-closed.
  // Avoids N+1 queries when checking many dates at once.
  async forDates(dates: string[]): Promise<Set<string>> {
    if (dates.length === 0) return new Set()
    await ensureMigrated()
    const rows = await sql<{ date: string }[]>`
      SELECT date FROM custom_closed_days WHERE date IN ${sql(dates)}
    `
    return new Set(rows.map(r => r.date))
  },
}

// --------------- Applications ---------------

export interface DbApplication {
  id: number
  shift_id: number
  user_id: string
  applied_at: string
}

export const applicationRepo = {
  async apply(shiftId: number, userId: string, reserve = false): Promise<DbApplication> {
    await sql`INSERT INTO applications (shift_id, user_id, reserve) VALUES (${shiftId}, ${userId}, ${reserve ? 1 : 0})`
    const [app] = await sql<DbApplication[]>`
      SELECT id, shift_id, user_id, (applied_at AT TIME ZONE 'Europe/Stockholm')::text AS applied_at
      FROM applications WHERE shift_id = ${shiftId} AND user_id = ${userId}
    `
    return app
  },

  async withdraw(shiftId: number, userId: string): Promise<void> {
    const [app] = await sql<{ id: number }[]>`
      SELECT id FROM applications WHERE shift_id = ${shiftId} AND user_id = ${userId}
    `
    if (!app) return
    const [approval] = await sql`SELECT id FROM approvals WHERE application_id = ${app.id}`
    if (approval) throw new Error('ALREADY_APPROVED')
    await sql`DELETE FROM applications WHERE id = ${app.id}`
  },

  async forShift(shiftId: number) {
    type Row = DbApplication & {
      user_name: string
      user_phone: string | null
      approved: boolean
      rejected: number
      rejection_reason: string | null
      withdrawn: number
      withdrawal_reason: string | null
      reserve: number
    }
    return sql<Row[]>`
      SELECT a.id, a.shift_id, a.user_id, (a.applied_at AT TIME ZONE 'Europe/Stockholm')::text AS applied_at,
             a.rejected, a.rejection_reason, a.withdrawn, a.withdrawal_reason, a.reserve,
             u.name AS user_name, u.phone AS user_phone,
             CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
      FROM applications a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE a.shift_id = ${shiftId}
      ORDER BY a.applied_at ASC
    `
  },

  async forShifts(shiftIds: number[]) {
    if (shiftIds.length === 0) return []
    type Row = DbApplication & {
      user_name: string
      user_phone: string | null
      approved: boolean
      rejected: number
      rejection_reason: string | null
      withdrawn: number
      withdrawal_reason: string | null
      reserve: number
    }
    return sql<Row[]>`
      SELECT a.id, a.shift_id, a.user_id, (a.applied_at AT TIME ZONE 'Europe/Stockholm')::text AS applied_at,
             a.rejected, a.rejection_reason, a.withdrawn, a.withdrawal_reason, a.reserve,
             u.name AS user_name, u.phone AS user_phone,
             CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
      FROM applications a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE a.shift_id IN ${sql(shiftIds)}
      ORDER BY a.applied_at ASC
    `
  },

  async promote(appId: number, adminId: string): Promise<{ user_id: string; user_name: string; user_phone: string | null; shift_day_index: number; shift_date: string }> {
    // Move from reserve to regular approved application
    await sql`UPDATE applications SET reserve = 0 WHERE id = ${appId}`
    await approvalRepo.approve(appId, adminId)
    const [info] = await sql<{ user_id: string; user_name: string; user_phone: string | null; shift_day_index: number; shift_date: string }[]>`
      SELECT u.id AS user_id, u.name AS user_name, u.phone AS user_phone, s.day_index AS shift_day_index, s.date AS shift_date
      FROM applications a
      JOIN users u ON u.id = a.user_id
      JOIN shifts s ON s.id = a.shift_id
      WHERE a.id = ${appId}
    `
    return info
  },

  async reject(appId: number, reason?: string): Promise<void> {
    await sql`UPDATE applications SET rejected = 1, rejection_reason = ${reason ?? null} WHERE id = ${appId}`
  },

  async unreject(appId: number): Promise<void> {
    await sql`UPDATE applications SET rejected = 0, rejection_reason = NULL WHERE id = ${appId}`
  },

  async markWithdrawn(appId: number, reason?: string, adminId?: string): Promise<void> {
    await sql`UPDATE applications SET withdrawn = 1, withdrawal_reason = ${reason ?? null}, withdrawn_by = ${adminId ?? null} WHERE id = ${appId}`
  },

  async unmarkWithdrawn(appId: number): Promise<void> {
    await sql`UPDATE applications SET withdrawn = 0, withdrawn_by = NULL WHERE id = ${appId}`
  },

  async forUser(userId: string) {
    type Row = DbApplication & {
      shift_date: string
      shift_day_index: number
      shift_week_year: number
      shift_week_number: number
      approved: boolean
      rejected: number
      rejection_reason: string | null
      withdrawn: number
    }
    return sql<Row[]>`
      SELECT a.id, a.shift_id, a.user_id, (a.applied_at AT TIME ZONE 'Europe/Stockholm')::text AS applied_at,
             a.rejected, a.rejection_reason, a.withdrawn, a.reserve,
             s.date AS shift_date, s.day_index AS shift_day_index,
             s.week_year AS shift_week_year, s.week_number AS shift_week_number,
             CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
      FROM applications a
      JOIN shifts s ON s.id = a.shift_id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE a.user_id = ${userId}
      ORDER BY s.date DESC
    `
  },

  async consecutiveCount(userId: string, targetDate: string): Promise<number> {
    // Only a small window around the target date can affect a consecutive-day
    // streak, so bound the query instead of scanning the user's whole approved
    // history on every apply (matters during the week-open booking burst).
    // Dates are 'YYYY-MM-DD' text, so lexical comparison is chronological.
    const fmtDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const base = new Date(targetDate + 'T12:00:00')
    const lower = new Date(base); lower.setDate(lower.getDate() - 14)
    const upper = new Date(base); upper.setDate(upper.getDate() + 14)
    const rows = await sql<{ date: string }[]>`
      SELECT s.date FROM applications a
      JOIN shifts s ON s.id = a.shift_id
      JOIN approvals ap ON ap.application_id = a.id
      WHERE a.user_id = ${userId}
        AND s.date >= ${fmtDay(lower)} AND s.date <= ${fmtDay(upper)}
      ORDER BY s.date ASC
    `
    const dateSet = new Set(rows.map(r => r.date))
    dateSet.add(targetDate)

    const d = new Date(targetDate + 'T12:00:00')
    let count = 1
    for (let i = 1; i <= 365; i++) {
      const prev = new Date(d); prev.setDate(prev.getDate() - i)
      const s = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`
      if (dateSet.has(s)) count++; else break
    }
    for (let i = 1; i <= 365; i++) {
      const next = new Date(d); next.setDate(next.getDate() + i)
      const s = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`
      if (dateSet.has(s)) count++; else break
    }
    return count
  },
}

// --------------- Approvals ---------------

export interface DbApproval {
  id: number
  application_id: number
  approved_by: string
  approved_at: string
  sms_sent: number
  reminder_sent: number
}

export const approvalRepo = {
  async approve(applicationId: number, approvedBy: string): Promise<DbApproval> {
    await sql`
      INSERT INTO approvals (application_id, approved_by)
      VALUES (${applicationId}, ${approvedBy})
      ON CONFLICT (application_id) DO NOTHING
    `
    const [approval] = await sql<DbApproval[]>`
      SELECT id, application_id, approved_by, (approved_at AT TIME ZONE 'Europe/Stockholm')::text AS approved_at, sms_sent, reminder_sent
      FROM approvals WHERE application_id = ${applicationId}
    `
    return approval
  },

  async unapprove(applicationId: number): Promise<void> {
    await sql`DELETE FROM approvals WHERE application_id = ${applicationId}`
  },
}

// --------------- Push Subscriptions ---------------

export interface DbPushSubscription {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
}

export const pushSubscriptionRepo = {
  async upsert(s: {
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent?: string | null
  }): Promise<void> {
    await ensureMigrated()
    await sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      VALUES (${s.userId}, ${s.endpoint}, ${s.p256dh}, ${s.auth}, ${s.userAgent ?? null})
      ON CONFLICT (endpoint) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            p256dh  = EXCLUDED.p256dh,
            auth    = EXCLUDED.auth,
            user_agent = EXCLUDED.user_agent
    `
  },

  async forUser(userId: string): Promise<DbPushSubscription[]> {
    await ensureMigrated()
    return sql<DbPushSubscription[]>`
      SELECT * FROM push_subscriptions WHERE user_id = ${userId}
    `
  },

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await ensureMigrated()
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`
  },

  async deleteForUser(userId: string): Promise<void> {
    await ensureMigrated()
    await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`
  },
}

// --------------- Activity log ---------------

export interface DbActivity {
  id: number
  action: string
  actor_name: string | null
  driver_name: string | null
  shift_date: string | null
  day_index: number | null
  detail: string | null
  created_at: string
}

export const activityRepo = {
  async log(entry: {
    action: string
    actorName?: string | null
    driverName?: string | null
    shiftDate?: string | null
    dayIndex?: number | null
    detail?: string | null
  }): Promise<void> {
    await ensureMigrated()
    await sql`
      INSERT INTO activity_log (action, actor_name, driver_name, shift_date, day_index, detail)
      VALUES (${entry.action}, ${entry.actorName ?? null}, ${entry.driverName ?? null},
              ${entry.shiftDate ?? null}, ${entry.dayIndex ?? null}, ${entry.detail ?? null})
    `
  },

  async recent(limit = 200): Promise<DbActivity[]> {
    await ensureMigrated()
    return sql<DbActivity[]>`
      SELECT id, action, actor_name, driver_name, shift_date, day_index, detail,
             (created_at AT TIME ZONE 'Europe/Stockholm')::text AS created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  },
}

/** Fire-and-forget activity logging — never blocks or breaks the calling action. */
export function logActivityAsync(entry: {
  action: string
  actorName?: string | null
  driverName?: string | null
  shiftDate?: string | null
  dayIndex?: number | null
  detail?: string | null
}): void {
  activityRepo.log(entry).catch(err => console.error('[activity] log failed', err))
}

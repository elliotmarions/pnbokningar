import postgres from 'postgres'
import { isHolidayOrEve } from './holidays'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: 'require',
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
})

export function getDb() {
  return sql
}

let _migrationPromise: Promise<void> | null = null
export function ensureMigrated(): Promise<void> {
  if (!_migrationPromise) _migrationPromise = migrate()
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
}

// --------------- Users ---------------

export interface DbUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: 'driver' | 'admin'
  created_at: string
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
    return sql<DbUser[]>`SELECT * FROM users ORDER BY name`
  },

  async updatePhone(id: string, phone: string): Promise<void> {
    await sql`UPDATE users SET phone = ${phone} WHERE id = ${id}`
  },

  async setRole(id: string, role: 'driver' | 'admin'): Promise<void> {
    await sql`UPDATE users SET role = ${role} WHERE id = ${id}`
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

  async ensureWeek(
    weekYear: number,
    weekNumber: number,
    days: { dayIndex: number; date: string }[]
  ): Promise<DbShift[]> {
    await ensureMigrated()
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

    return shiftRepo.getWeek(weekYear, weekNumber)
  },

  async update(id: number, fields: { is_open?: number; slots?: number }): Promise<void> {
    if (fields.is_open !== undefined) {
      await sql`UPDATE shifts SET is_open = ${fields.is_open} WHERE id = ${id}`
    }
    if (fields.slots !== undefined) {
      await sql`UPDATE shifts SET slots = ${fields.slots} WHERE id = ${id}`
    }
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
  async apply(shiftId: number, userId: string): Promise<DbApplication> {
    await sql`INSERT INTO applications (shift_id, user_id) VALUES (${shiftId}, ${userId})`
    const [app] = await sql<DbApplication[]>`
      SELECT id, shift_id, user_id, applied_at::text AS applied_at
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
    }
    return sql<Row[]>`
      SELECT a.id, a.shift_id, a.user_id, a.applied_at::text AS applied_at,
             a.rejected, a.rejection_reason,
             u.name AS user_name, u.phone AS user_phone,
             CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
      FROM applications a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE a.shift_id = ${shiftId}
      ORDER BY a.applied_at ASC
    `
  },

  async reject(appId: number, reason?: string): Promise<void> {
    await sql`UPDATE applications SET rejected = 1, rejection_reason = ${reason ?? null} WHERE id = ${appId}`
  },

  async unreject(appId: number): Promise<void> {
    await sql`UPDATE applications SET rejected = 0, rejection_reason = NULL WHERE id = ${appId}`
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
    }
    return sql<Row[]>`
      SELECT a.id, a.shift_id, a.user_id, a.applied_at::text AS applied_at,
             a.rejected, a.rejection_reason,
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
    const rows = await sql<{ date: string }[]>`
      SELECT s.date FROM applications a
      JOIN shifts s ON s.id = a.shift_id
      JOIN approvals ap ON ap.application_id = a.id
      WHERE a.user_id = ${userId}
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
      SELECT id, application_id, approved_by, approved_at::text AS approved_at, sms_sent, reminder_sent
      FROM approvals WHERE application_id = ${applicationId}
    `
    return approval
  },

  async unapprove(applicationId: number): Promise<void> {
    await sql`DELETE FROM approvals WHERE application_id = ${applicationId}`
  },

  async markSmsSent(applicationId: number): Promise<void> {
    await sql`UPDATE approvals SET sms_sent = 1 WHERE application_id = ${applicationId}`
  },

  async markReminderSent(applicationId: number): Promise<void> {
    await sql`UPDATE approvals SET reminder_sent = 1 WHERE application_id = ${applicationId}`
  },

  async pendingReminders() {
    type Row = {
      application_id: number
      user_name: string
      user_phone: string | null
      shift_date: string
      shift_day_index: number
      start_time: string
      end_time: string
    }
    return sql<Row[]>`
      SELECT ap.application_id, u.name AS user_name, u.phone AS user_phone,
             s.date AS shift_date, s.day_index AS shift_day_index,
             CASE WHEN s.day_index = 5 THEN '09:45' ELSE '16:00' END AS start_time,
             CASE WHEN s.day_index = 5 THEN '16:30' ELSE '22:00' END AS end_time
      FROM approvals ap
      JOIN applications a ON a.id = ap.application_id
      JOIN shifts s ON s.id = a.shift_id
      JOIN users u ON u.id = a.user_id
      WHERE ap.reminder_sent = 0
        AND u.phone IS NOT NULL
        AND (s.date || 'T' || CASE WHEN s.day_index = 5 THEN '09:45' ELSE '16:00' END || ':00')::timestamptz
            <= NOW() + INTERVAL '2 hours'
        AND (s.date || 'T' || CASE WHEN s.day_index = 5 THEN '09:45' ELSE '16:00' END || ':00')::timestamptz
            > NOW()
    `
  },
}

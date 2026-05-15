import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { isHolidayOrEve } from './holidays'

// Use DATABASE_PATH env if set (absolute path preferred), otherwise resolve
// relative to project root using __dirname (works regardless of CWD)
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..')
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(PROJECT_ROOT, 'data', 'passbokning.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT,
      phone       TEXT,
      role        TEXT NOT NULL DEFAULT 'driver',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      week_year    INTEGER NOT NULL,
      week_number  INTEGER NOT NULL,
      day_index    INTEGER NOT NULL,
      date         TEXT NOT NULL,
      is_open      INTEGER NOT NULL DEFAULT 1,
      slots        INTEGER NOT NULL DEFAULT 5,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(week_year, week_number, day_index)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id    INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      user_id     TEXT    NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
      applied_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(shift_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
      approved_by     TEXT    NOT NULL REFERENCES users(id),
      approved_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      sms_sent        INTEGER NOT NULL DEFAULT 0,
      reminder_sent   INTEGER NOT NULL DEFAULT 0
    );
  `)

  // Versioned one-time migrations using SQLite user_version pragma
  const version = (db.pragma('user_version', { simple: true }) as number) ?? 0

  if (version < 1) {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    db.prepare('UPDATE shifts SET is_open = 0 WHERE date >= ?').run(todayStr)
    db.pragma('user_version = 1')
  }

  if (version < 2) {
    // Migration 2: add rejection columns to applications
    db.exec(`
      ALTER TABLE applications ADD COLUMN rejected INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE applications ADD COLUMN rejection_reason TEXT;
    `)
    db.pragma('user_version = 2')
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
}

export const userRepo = {
  upsert(u: { id: string; name: string; email?: string | null }) {
    const db = getDb()
    const existing = db.prepare('SELECT role FROM users WHERE id = ?').get(u.id) as { role: string } | undefined
    if (existing) {
      db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(u.name, u.email ?? null, u.id)
    } else {
      const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const role = adminIds.includes(u.id) ? 'admin' : 'driver'
      db.prepare('INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)').run(u.id, u.name, u.email ?? null, role)
    }
    return db.prepare('SELECT * FROM users WHERE id = ?').get(u.id) as DbUser
  },

  getById(id: string): DbUser | undefined {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined
  },

  all(): DbUser[] {
    return getDb().prepare('SELECT * FROM users ORDER BY name').all() as DbUser[]
  },

  updatePhone(id: string, phone: string) {
    getDb().prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, id)
  },

  setRole(id: string, role: 'driver' | 'admin') {
    getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
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
  getById(id: number): DbShift | null {
    return (getDb().prepare('SELECT * FROM shifts WHERE id = ?').get(id) as DbShift | undefined) ?? null
  },

  getWeek(weekYear: number, weekNumber: number): DbShift[] {
    return getDb()
      .prepare('SELECT * FROM shifts WHERE week_year = ? AND week_number = ? ORDER BY day_index')
      .all(weekYear, weekNumber) as DbShift[]
  },

  ensureWeek(weekYear: number, weekNumber: number, days: { dayIndex: number; date: string }[]) {
    const db = getDb()
    const insert = db.prepare(
      'INSERT OR IGNORE INTO shifts (week_year, week_number, day_index, date, is_open) VALUES (?, ?, ?, ?, ?)'
    )
    // Close shifts that fall on a holiday/eve
    const closeHoliday = db.prepare(
      'UPDATE shifts SET is_open = 0 WHERE week_year = ? AND week_number = ? AND day_index = ?'
    )
    // Close shifts whose date has already passed (date < today in YYYY-MM-DD)
    const closePast = db.prepare(
      'UPDATE shifts SET is_open = 0 WHERE week_year = ? AND week_number = ? AND date < ?'
    )
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const insertMany = db.transaction((rows: typeof days) => {
      for (const d of rows) {
        // New shifts always start closed — admin opens them when ready
        insert.run(weekYear, weekNumber, d.dayIndex, d.date, 0)
        // Also force-close holidays/eves even if previously created as open
        if (isHolidayOrEve(d.date)) closeHoliday.run(weekYear, weekNumber, d.dayIndex)
      }
      // Auto-close all past days in this week
      closePast.run(weekYear, weekNumber, todayStr)
    })
    insertMany(days)
    return shiftRepo.getWeek(weekYear, weekNumber)
  },

  update(id: number, fields: { is_open?: number; slots?: number }) {
    const db = getDb()
    if (fields.is_open !== undefined) db.prepare('UPDATE shifts SET is_open = ? WHERE id = ?').run(fields.is_open, id)
    if (fields.slots !== undefined) db.prepare('UPDATE shifts SET slots = ? WHERE id = ?').run(fields.slots, id)
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
  apply(shiftId: number, userId: string): DbApplication {
    const db = getDb()
    db.prepare('INSERT INTO applications (shift_id, user_id) VALUES (?, ?)').run(shiftId, userId)
    return db.prepare('SELECT * FROM applications WHERE shift_id = ? AND user_id = ?').get(shiftId, userId) as DbApplication
  },

  withdraw(shiftId: number, userId: string) {
    const db = getDb()
    const app = db.prepare('SELECT id FROM applications WHERE shift_id = ? AND user_id = ?').get(shiftId, userId) as { id: number } | undefined
    if (!app) return
    const approval = db.prepare('SELECT id FROM approvals WHERE application_id = ?').get(app.id)
    if (approval) throw new Error('ALREADY_APPROVED')
    db.prepare('DELETE FROM applications WHERE id = ?').run(app.id)
  },

  forShift(shiftId: number): (DbApplication & { user_name: string; user_phone: string | null; approved: boolean; rejected: number; rejection_reason: string | null })[] {
    return getDb().prepare(`
      SELECT a.*, u.name AS user_name, u.phone AS user_phone,
             CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
      FROM applications a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE a.shift_id = ?
      ORDER BY a.applied_at ASC
    `).all(shiftId) as (DbApplication & { user_name: string; user_phone: string | null; approved: boolean; rejected: number; rejection_reason: string | null })[]
  },

  reject(appId: number, reason?: string) {
    getDb().prepare('UPDATE applications SET rejected = 1, rejection_reason = ? WHERE id = ?').run(reason ?? null, appId)
  },

  unreject(appId: number) {
    getDb().prepare('UPDATE applications SET rejected = 0, rejection_reason = NULL WHERE id = ?').run(appId)
  },

  forUser(userId: string): (DbApplication & { shift_date: string; shift_day_index: number; shift_week_year: number; shift_week_number: number; approved: boolean; rejected: number; rejection_reason: string | null })[] {
    return getDb().prepare(`
      SELECT a.*, s.date AS shift_date, s.day_index AS shift_day_index,
             s.week_year AS shift_week_year, s.week_number AS shift_week_number,
             CASE WHEN ap.id IS NOT NULL THEN 1 ELSE 0 END AS approved
      FROM applications a
      JOIN shifts s ON s.id = a.shift_id
      LEFT JOIN approvals ap ON ap.application_id = a.id
      WHERE a.user_id = ?
      ORDER BY s.date DESC
    `).all(userId) as (DbApplication & { shift_date: string; shift_day_index: number; shift_week_year: number; shift_week_number: number; approved: boolean; rejected: number; rejection_reason: string | null })[]
  },

  // Returns the length of the consecutive-day streak that would include targetDate
  // if it were added to the user's approved shifts.
  consecutiveCount(userId: string, targetDate: string): number {
    const rows = getDb().prepare(`
      SELECT s.date FROM applications a
      JOIN shifts s ON s.id = a.shift_id
      JOIN approvals ap ON ap.application_id = a.id
      WHERE a.user_id = ?
      ORDER BY s.date ASC
    `).all(userId) as { date: string }[]

    const dateSet = new Set(rows.map(r => r.date))
    dateSet.add(targetDate)

    // Walk consecutive days outward from targetDate
    const d = new Date(targetDate + 'T12:00:00')
    let count = 1
    // backward
    for (let i = 1; i <= 365; i++) {
      const prev = new Date(d); prev.setDate(prev.getDate() - i)
      const s = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`
      if (dateSet.has(s)) count++; else break
    }
    // forward
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
  approve(applicationId: number, approvedBy: string): DbApproval {
    const db = getDb()
    db.prepare('INSERT OR IGNORE INTO approvals (application_id, approved_by) VALUES (?, ?)').run(applicationId, approvedBy)
    return db.prepare('SELECT * FROM approvals WHERE application_id = ?').get(applicationId) as DbApproval
  },

  unapprove(applicationId: number) {
    getDb().prepare('DELETE FROM approvals WHERE application_id = ?').run(applicationId)
  },

  markSmsSent(applicationId: number) {
    getDb().prepare('UPDATE approvals SET sms_sent = 1 WHERE application_id = ?').run(applicationId)
  },

  markReminderSent(applicationId: number) {
    getDb().prepare('UPDATE approvals SET reminder_sent = 1 WHERE application_id = ?').run(applicationId)
  },

  pendingReminders(): {
    application_id: number
    user_name: string
    user_phone: string | null
    shift_date: string
    shift_day_index: number
    start_time: string
    end_time: string
  }[] {
    return getDb().prepare(`
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
        AND datetime(s.date || ' ' || CASE WHEN s.day_index = 5 THEN '09:45' ELSE '16:00' END) <= datetime('now', '+2 hours', 'localtime')
        AND datetime(s.date || ' ' || CASE WHEN s.day_index = 5 THEN '09:45' ELSE '16:00' END) > datetime('now', 'localtime')
    `).all() as ReturnType<typeof approvalRepo.pendingReminders>
  },
}

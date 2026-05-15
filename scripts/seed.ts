/**
 * Seed script — creates test users and a week of shifts.
 * Run: npm run seed
 *
 * Creates:
 *   - 1 admin user (Anna Karlén)
 *   - 8 driver users
 *   - Shifts for the current ISO week
 *   - Some applications and approvals
 */

import { getDb, userRepo, shiftRepo, applicationRepo, approvalRepo } from '../src/lib/db'
import { currentWeekInfo } from '../src/lib/weeks'

const db = getDb()

// ---- Users ----
const users = [
  { id: 'test-admin-001', name: 'Anna Karlén',     email: 'anna.karlen@test.postnord.se',    phone: '+46701000001', role: 'admin' as const },
  { id: 'test-driver-001', name: 'Erik Lindqvist',  email: 'erik.lindqvist@test.postnord.se',  phone: '+46701000002', role: 'driver' as const },
  { id: 'test-driver-002', name: 'Sara Bergström',  email: 'sara.bergstrom@test.postnord.se',  phone: '+46701000003', role: 'driver' as const },
  { id: 'test-driver-003', name: 'Magnus Holmberg', email: 'magnus.holmberg@test.postnord.se', phone: '+46701000004', role: 'driver' as const },
  { id: 'test-driver-004', name: 'Anders Sjögren',  email: 'anders.sjogren@test.postnord.se',  phone: '+46701000005', role: 'driver' as const },
  { id: 'test-driver-005', name: 'Linda Karlsson',  email: 'linda.karlsson@test.postnord.se',  phone: '+46701000006', role: 'driver' as const },
  { id: 'test-driver-006', name: 'Per Nyström',     email: 'per.nystrom@test.postnord.se',     phone: '+46701000007', role: 'driver' as const },
  { id: 'test-driver-007', name: 'Johan Wikström',  email: 'johan.wikstrom@test.postnord.se',  phone: '+46701000008', role: 'driver' as const },
  { id: 'test-driver-008', name: 'Helena Forsberg', email: 'helena.forsberg@test.postnord.se', phone: '+46701000009', role: 'driver' as const },
]

console.log('Seeding users…')
for (const u of users) {
  db.prepare('INSERT OR IGNORE INTO users (id, name, email, phone, role) VALUES (?, ?, ?, ?, ?)')
    .run(u.id, u.name, u.email, u.phone, u.role)
}

// ---- Shifts ----
const week = currentWeekInfo()
console.log(`Seeding shifts for week ${week.weekNumber} / ${week.weekYear}…`)

const slotsByDay = [5, 5, 4, 0, 6, 4]  // 0 = closed
const openByDay  = [1, 1, 1, 0, 1, 1]

const shifts = shiftRepo.ensureWeek(week.weekYear, week.weekNumber, week.days)
for (const shift of shifts) {
  const d = shift.day_index
  db.prepare('UPDATE shifts SET slots = ?, is_open = ? WHERE id = ?')
    .run(slotsByDay[d] || 5, openByDay[d], shift.id)
}

// Reload after update
const updatedShifts = shiftRepo.getWeek(week.weekYear, week.weekNumber)

// ---- Applications & Approvals ----
console.log('Seeding applications…')

function seedApply(shiftId: number, userId: string, hoursAgo = 2, approve = false, adminId = 'test-admin-001') {
  const db2 = getDb()
  const d = new Date()
  d.setHours(d.getHours() - hoursAgo)
  const iso = d.toISOString().replace('T', ' ').slice(0, 19)

  db2.prepare('INSERT OR IGNORE INTO applications (shift_id, user_id, applied_at) VALUES (?, ?, ?)')
    .run(shiftId, userId, iso)
  if (approve) {
    const app = db2.prepare('SELECT id FROM applications WHERE shift_id = ? AND user_id = ?').get(shiftId, userId) as { id: number }
    if (app) db2.prepare('INSERT OR IGNORE INTO approvals (application_id, approved_by, sms_sent) VALUES (?, ?, 1)').run(app.id, adminId)
  }
}

const mon = updatedShifts.find(s => s.day_index === 0)
const tue = updatedShifts.find(s => s.day_index === 1)
const wed = updatedShifts.find(s => s.day_index === 2)
const fri = updatedShifts.find(s => s.day_index === 4)
const sat = updatedShifts.find(s => s.day_index === 5)

if (mon) {
  seedApply(mon.id, 'test-driver-002', 5, true)
  seedApply(mon.id, 'test-driver-003', 4, true)
  seedApply(mon.id, 'test-driver-004', 3, false)
  seedApply(mon.id, 'test-driver-005', 2, false)
}
if (tue) {
  seedApply(tue.id, 'test-driver-001', 6, true)
  seedApply(tue.id, 'test-driver-006', 5, true)
  seedApply(tue.id, 'test-driver-007', 3, false)
}
if (wed) {
  seedApply(wed.id, 'test-driver-002', 7, false)
  seedApply(wed.id, 'test-driver-003', 6, false)
  seedApply(wed.id, 'test-driver-008', 4, false)
}
if (fri) {
  seedApply(fri.id, 'test-driver-001', 8, true)
  seedApply(fri.id, 'test-driver-002', 7, true)
  seedApply(fri.id, 'test-driver-003', 6, true)
  seedApply(fri.id, 'test-driver-004', 5, true)
  seedApply(fri.id, 'test-driver-005', 4, true)
  seedApply(fri.id, 'test-driver-006', 3, true)
}
if (sat) {
  seedApply(sat.id, 'test-driver-007', 3, true)
  seedApply(sat.id, 'test-driver-008', 2, false)
}

console.log('✓ Seed complete.')
console.log()
console.log('Test accounts:')
console.log('  Admin:   test-admin-001  (Anna Karlén)')
console.log('  Driver:  test-driver-001 (Erik Lindqvist)')
console.log()
console.log('To log in as a test user without Azure AD, set NEXTAUTH_SECRET and')
console.log('use the credentials provider (see README for dev login instructions).')

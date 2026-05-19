import { getDb, applicationRepo, approvalRepo, longTermRepo, customClosedRepo } from './db'
import { isHolidayOrEve } from './holidays'

/**
 * Applies any active long-term bookings to a specific shift.
 * Called when a shift is created or opened.
 * Skips holidays, eves, and custom closed days.
 */
export async function applyLongTermToShift(shiftId: number, date: string, adminId: string) {
  if (isHolidayOrEve(date)) return
  const customClosed = await customClosedRepo.forDate(date)
  if (customClosed) return

  const sql = getDb()
  const bookings = await longTermRepo.forDate(date)
  for (const booking of bookings) {
    const [existing] = await sql<{ id: number; rejected: number; withdrawn: number }[]>`
      SELECT id, rejected, withdrawn FROM applications
      WHERE shift_id = ${shiftId} AND user_id = ${booking.user_id}
    `
    let appId: number
    if (existing) {
      await sql`UPDATE applications SET rejected=0, withdrawn=0, rejection_reason=NULL, withdrawal_reason=NULL WHERE id=${existing.id}`
      await sql`DELETE FROM approvals WHERE application_id=${existing.id}`
      appId = existing.id
    } else {
      const app = await applicationRepo.apply(shiftId, booking.user_id)
      appId = app.id
    }
    await approvalRepo.approve(appId, adminId)
  }
}

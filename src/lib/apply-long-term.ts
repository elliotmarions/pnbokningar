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
      // Respect an admin's deliberate removal. If this driver was avbokad
      // (withdrawn=1) or nekad (rejected=1) for this specific shift, that
      // decision stands — auto-applying the long-term booking must NOT bring
      // them back. Otherwise re-opening the week (or any is_open:1 save) silently
      // resurrects a driver the admin removed for the day. To undo a removal the
      // admin re-books the driver directly, clicks "Ångra avbokning", or
      // re-selects the day in Schemalägg (which deletes this row first).
      if (existing.rejected === 1 || existing.withdrawn === 1) continue
      // Re-activate an existing application but DON'T overwrite its source —
      // if the driver booked this day themselves, it stays 'driver' so that
      // excluding the day later still warns the admin.
      await sql`UPDATE applications SET rejected=0, withdrawn=0, rejection_reason=NULL, withdrawal_reason=NULL WHERE id=${existing.id}`
      await sql`DELETE FROM approvals WHERE application_id=${existing.id}`
      appId = existing.id
    } else {
      const app = await applicationRepo.apply(shiftId, booking.user_id, false, 'long_term')
      appId = app.id
    }
    await approvalRepo.approve(appId, adminId)
  }
}

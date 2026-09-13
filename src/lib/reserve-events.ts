import { getDb } from './db'
import {
  ReserveSnapshot,
  sendReserveAddedAsync,
  sendReserveRemovedAsync,
} from './integration'
import { shiftHours } from './weeks'

/**
 * Reserve-list change tracking for the partner integration.
 *
 * The partner mirrors our reserve list, so every change has to be pushed —
 * roughly a dozen routes can add or remove a reserve (a driver signing up, an
 * admin moving someone to or off the list, a rejection, a withdrawal, a
 * promotion, a partner booking, a deleted application, a restored reserve
 * after a cancellation).
 *
 * Rather than re-deriving "is this an active reserve?" at each of those call
 * sites — twelve chances to get the condition subtly wrong — every route takes
 * a snapshot before its mutation and hands both to `emitReserveDelta`. The
 * definition of an active reserve lives here, once.
 *
 * Usage:
 *   const before = await reserveSnapshot(appId)   // null when creating a row
 *   ... mutate ...
 *   await emitReserveDelta(appId, before)
 */

/**
 * The reserve as the partner should see it, or null if this application is not
 * currently an active reserve. Mirrors the filter in GET /api/integration/reserves:
 * reserve = 1, not withdrawn, not rejected, and not already approved.
 */
export async function reserveSnapshot(appId: number): Promise<ReserveSnapshot | null> {
  if (!Number.isInteger(appId) || appId < 1) return null

  const sql = getDb()
  const [row] = await sql<{
    id: number; user_name: string; day_index: number; date: string; applied_at: Date
  }[]>`
    SELECT a.id, u.name AS user_name, s.day_index, s.date, a.applied_at
    FROM applications a
    JOIN shifts s ON s.id = a.shift_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN approvals ap ON ap.application_id = a.id
    WHERE a.id = ${appId}
      AND a.reserve = 1 AND a.withdrawn = 0 AND a.rejected = 0
      AND ap.id IS NULL
  `
  if (!row) return null

  const { start, end } = shiftHours(row.day_index)
  return {
    reserveId: row.id,
    driverName: row.user_name,
    date: row.date,
    startTime: start,
    endTime: end,
    // ISO-8601 UTC, as the partner's webhook contract specifies.
    appliedAt: new Date(row.applied_at).toISOString(),
  }
}

/**
 * Compare the reserve state before a mutation with the state after it, and
 * push the event the change implies. A no-op when nothing crossed the line,
 * so it is safe to call from routes that only sometimes touch a reserve.
 *
 * Pass `before = null` when the application did not exist yet.
 */
export async function emitReserveDelta(
  appId: number,
  before: ReserveSnapshot | null,
): Promise<void> {
  const after = await reserveSnapshot(appId)

  switch (reserveDelta(before, after)) {
    case 'added':   return sendReserveAddedAsync(after!)
    case 'removed': return sendReserveRemovedAsync(before!.reserveId)
    case null:      return
  }
}

/**
 * Which event a before/after pair implies, or null when nothing crossed the
 * line. Split out from the emit so the decision is testable without a database.
 *
 * "Still a reserve" sends nothing: the fields the partner mirrors (driver,
 * date, times) cannot change on an existing application.
 */
export function reserveDelta(
  before: ReserveSnapshot | null,
  after: ReserveSnapshot | null,
): 'added' | 'removed' | null {
  if (!before && after) return 'added'
  if (before && !after) return 'removed'
  return null
}

/**
 * Convenience for routes that delete the application row outright: the row is
 * gone, so `reserveSnapshot` can tell us nothing afterwards.
 */
export function emitReserveRemovedIfWas(before: ReserveSnapshot | null): void {
  if (before) sendReserveRemovedAsync(before.reserveId)
}

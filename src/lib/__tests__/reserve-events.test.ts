import { describe, it, expect } from 'vitest'
import { reserveDelta } from '../reserve-events'
import type { ReserveSnapshot } from '../integration'

const snapshot = (reserveId = 512): ReserveSnapshot => ({
  reserveId,
  driverName: 'Anna Andersson',
  date: '2026-09-15',
  startTime: '16:00',
  endTime: '22:00',
  appliedAt: '2026-09-12T13:31:00.000Z',
})

describe('reserveDelta', () => {
  it('signals added when an application becomes an active reserve', () => {
    expect(reserveDelta(null, snapshot())).toBe('added')
  })

  it('signals removed when it stops being one — whatever the reason', () => {
    // booked, rejected, withdrawn or deleted all land here
    expect(reserveDelta(snapshot(), null)).toBe('removed')
  })

  it('stays silent when it was and remains a reserve', () => {
    expect(reserveDelta(snapshot(), snapshot())).toBeNull()
  })

  it('stays silent when it was never a reserve', () => {
    // Most routes call this unconditionally; the common case must be a no-op.
    expect(reserveDelta(null, null)).toBeNull()
  })

  it('treats a cancelled booking returning to the list as a fresh add', () => {
    // The partner deleted the row on booking.confirmed, so they need it back.
    expect(reserveDelta(null, snapshot(3174))).toBe('added')
  })
})

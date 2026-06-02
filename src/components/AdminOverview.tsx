'use client'
import { useState } from 'react'
import { AdminWeek } from './AdminWeek'
import { AdminMonth } from './AdminMonth'
import type { OverviewView } from './ViewToggle'

export function AdminOverview() {
  const [view, setView] = useState<OverviewView>('week')

  // The view toggle is rendered inside each view (on the same row as the driver
  // search) so they share one toolbar line instead of stacking.
  return view === 'week'
    ? <AdminWeek view={view} onView={setView} />
    : <AdminMonth mode={view === 'interval' ? 'interval' : 'month'} view={view} onView={setView} />
}

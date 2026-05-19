'use client'
import { useState } from 'react'
import { AdminWeek } from './AdminWeek'
import { AdminMonth } from './AdminMonth'

type View = 'week' | 'month' | 'interval'

export function AdminOverview() {
  const [view, setView] = useState<View>('week')

  return (
    <>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}>
        <div className="view-toggle">
          <button className={view === 'week'     ? 'active' : ''} onClick={() => setView('week')}>Vecka</button>
          <button className={view === 'month'    ? 'active' : ''} onClick={() => setView('month')}>Månad</button>
          <button className={view === 'interval' ? 'active' : ''} onClick={() => setView('interval')}>Intervall</button>
        </div>
      </div>
      {view === 'week'
        ? <AdminWeek />
        : <AdminMonth mode={view === 'interval' ? 'interval' : 'month'} />}
    </>
  )
}

'use client'
import { useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { WeekConfig } from '@/components/WeekConfig'
import { LongTermBookings } from '@/components/LongTermBookings'

type Tab = 'week' | 'long-term'

export default function AdminConfigPage() {
  const [tab, setTab] = useState<Tab>('week')

  return (
    <AdminLayout
      title="Schemalägg"
      sub={tab === 'week' ? 'Konfigurera platser och öppna dagar.' : 'Boka chaufförer för längre perioder, t.ex. sommarvikariat.'}
    >
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}>
        <div className="view-toggle">
          <button className={tab === 'week'      ? 'active' : ''} onClick={() => setTab('week')}>Vecka</button>
          <button className={tab === 'long-term' ? 'active' : ''} onClick={() => setTab('long-term')}>Långtid</button>
        </div>
      </div>
      {tab === 'week' ? <WeekConfig /> : <LongTermBookings />}
    </AdminLayout>
  )
}

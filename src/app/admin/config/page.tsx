'use client'
import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { WeekConfig } from '@/components/WeekConfig'
import { LongTermBookings } from '@/components/LongTermBookings'
import { useAdminCache } from '@/components/AdminCacheProvider'

type Tab = 'week' | 'long-term'

function PrefetchLongTerm() {
  const cache = useAdminCache()
  useEffect(() => {
    // Prefetch the data the Långtid tab needs so clicking it feels instant.
    if (!cache.get('long-term-bookings')) {
      fetch('/api/long-term')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.bookings) cache.set('long-term-bookings', d.bookings) })
        .catch(() => {})
    }
    if (!cache.get('custom-closed')) {
      fetch('/api/custom-closed')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.days) cache.set('custom-closed', d.days) })
        .catch(() => {})
    }
    if (!cache.get('users')) {
      fetch('/api/users')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) cache.set('users', d) })
        .catch(() => {})
    }
  }, [cache])
  return null
}

export default function AdminConfigPage() {
  const [tab, setTab] = useState<Tab>('week')

  return (
    <AdminLayout
      title="Schemalägg"
      sub={tab === 'week' ? 'Konfigurera platser och öppna dagar.' : 'Boka chaufförer för längre perioder, t.ex. sommarvikariat.'}
    >
      <PrefetchLongTerm />
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

'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useUser, useSignOut } from '@/lib/supabase/use-user'
import { Home, Calendar, Users, BarChart, Briefcase, LogOut, Sun } from './Icons'

const NAV = [
  { href: '/admin',            label: 'Översikt',    icon: Home },
  { href: '/admin/config',     label: 'Schemalägg',  icon: Calendar },
  { href: '/admin/calendar',   label: 'Kalender',    icon: Sun },
  { href: '/admin/drivers',    label: 'Chaufförer',  icon: Users },
  { href: '/admin/export',     label: 'Statistik',   icon: BarChart },
]

function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function AdminLayout({ children, title, sub }: { children: React.ReactNode; title: string; sub: string }) {
  const pathname = usePathname()
  const user = useUser()
  const signOut = useSignOut()

  return (
    <div className="frame">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/pn-logo.png" alt="PostNord" className="brand-logo" />
          <div>
            <div className="label">Passbokning</div>
            <div className="sub">Trafikledning</div>
          </div>
        </div>

        <div className="nav-section-label">Administration</div>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch
            className={`nav-item ${pathname === href ? 'active' : ''}`}
          >
            <Icon className="svg-ico ico" />
            {label}
          </Link>
        ))}

        <div style={{ flex: 1 }} />

        <Link href="/driver" prefetch className="nav-item">
          <Briefcase className="svg-ico ico" />
          Chaufförsvy
        </Link>

        <Link href="/profile" prefetch className="nav-foot nav-foot-link" title="Min profil">
          <div className="avatar">{initials(user?.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who">{user?.name ?? '—'}</div>
            <div className="role">Trafikledare</div>
          </div>
          <span className="btn-icon btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); signOut() }} title="Logga ut">
            <LogOut className="svg-ico" />
          </span>
        </Link>

        <div style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          letterSpacing: '0.3px',
        }}>
          Powered by <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Veddesta Hempaket</span>
        </div>
      </aside>

      <div className="main">
        <header className="main-header">
          <div>
            <h1>{title}</h1>
            <div className="sub">{sub}</div>
          </div>
        </header>
        <div className="main-body">{children}</div>
      </div>
    </div>
  )
}

'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { Home, Calendar, Users, Download, Briefcase, LogOut, Sun } from './Icons'

const NAV = [
  { href: '/admin',            label: 'Översikt',    icon: Home },
  { href: '/admin/config',     label: 'Schemalägg',  icon: Calendar },
  { href: '/admin/calendar',   label: 'Kalender',    icon: Sun },
  { href: '/admin/drivers',    label: 'Chaufförer',  icon: Users },
  { href: '/admin/export',     label: 'Export',      icon: Download },
]

function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export function AdminLayout({ children, title, sub }: { children: React.ReactNode; title: string; sub: string }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user

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

        <div className="nav-section-label">Vyer</div>
        <Link href="/driver" prefetch className="nav-item">
          <Briefcase className="svg-ico ico" />
          Chaufförsvy
        </Link>

        <div className="nav-foot">
          <div className="avatar">{initials(user?.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who">{user?.name ?? '—'}</div>
            <div className="role">Trafikledare</div>
          </div>
          <button className="btn-ghost btn btn-icon" title="Logga ut" onClick={() => signOut({ callbackUrl: '/' })}>
            <LogOut className="svg-ico" />
          </button>
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

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  {
    id: 'dashboard', label: 'Dashboard', href: '/dashboard', exact: true,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>,
  },
  {
    id: 'eeg-reports', label: 'Analysis History', href: '/dashboard/eeg-reports',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  },
  {
    id: 'settings', label: 'Settings', href: '/dashboard/settings',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  },
]

export function Sidebar({ userEmail, userRole, userName }: { userEmail: string; userRole: string; userName?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <aside className="clinical-sidebar flex h-full w-60 shrink-0 flex-col">
      {/* ── Logo ── */}
      <Link href="/dashboard" className="flex items-center gap-3 px-6 py-6 transition-opacity hover:opacity-80">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm border border-slate-200">
          <img src="/logo.jpeg" alt="" className="h-full w-full object-contain" />
        </div>
        <div className="text-[17px] font-bold tracking-tight" style={{ color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
          NeuroSentinel AI
        </div>
      </Link>

      {/* ── Navigation Label ── */}
      <div className="clinical-sidebar-nav-label">Navigation</div>

      {/* ── Nav Items ── */}
      <nav className="flex-1 overflow-y-auto pb-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.id}
              href={item.href}
              id={`nav-${item.id}`}
              className={`clinical-nav-item ${active ? 'active' : ''}`}
            >
              <span className="nav-icon" style={{ flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
              {active && <span className="clinical-nav-indicator" />}
            </Link>
          )
        })}
      </nav>

      {/* ── Footer: User + Sign Out ── */}
      <div className="space-y-2 border-t px-0 py-3" style={{ borderColor: 'var(--border-default)' }}>
        <div className="clinical-user-card">
          <div className="clinical-user-avatar">
            {(userName || userEmail).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{userName || userEmail}</div>
            <div className="text-[11px] capitalize" style={{ color: 'var(--text-muted)' }}>{userRole}</div>
          </div>
        </div>

        <button
          id="btn-sign-out"
          onClick={handleSignOut}
          disabled={signingOut}
          className="clinical-signout-btn"
        >
          {signingOut ? (
            <><div className="clinical-spinner-sm" />Signing out...</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>Sign Out</>
          )}
        </button>
      </div>
    </aside>
  )
}

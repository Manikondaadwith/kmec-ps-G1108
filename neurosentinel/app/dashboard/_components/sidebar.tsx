'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  {
    id: 'dashboard', label: 'Command Centre', href: '/dashboard', exact: true,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  },
  {
    id: 'eeg-reports', label: 'Analysis History', href: '/dashboard/eeg-reports',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  },
  {
    id: 'settings', label: 'Settings', href: '/dashboard/settings',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  },
]

export function Sidebar({ userEmail, userRole }: { userEmail: string; userRole: string }) {
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
    <aside className="flex h-full w-60 shrink-0 flex-col border-r" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
      <Link href="/dashboard" className="flex items-center gap-3 border-b px-4 py-4 transition-opacity hover:opacity-80" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg,rgba(0,240,255,0.18),rgba(123,97,255,0.12))', border: '1px solid var(--accent-primary)', boxShadow: '0 0 10px rgba(0,240,255,0.15)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M2 12 Q4 8 6 12 Q8 16 10 12 Q12 8 14 12 Q16 16 18 12 Q20 8 22 12" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--accent-primary)', fontFamily: "'Outfit',sans-serif" }}>NeuroSentinel AI</div>
        </div>
      </Link>

      <div className="px-4 pb-1.5 pt-4">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Navigation</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)

          return (
            <Link
              key={item.id}
              href={item.href}
              id={`nav-${item.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150"
              style={{
                background: active ? 'rgba(0,240,255,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(0,240,255,0.18)' : 'transparent'}`,
                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                boxShadow: active ? '0 0 12px rgba(0,240,255,0.07)' : 'none',
              }}
            >
              <span style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent-primary)', boxShadow: '0 0 5px var(--accent-primary)' }} />}
            </Link>
          )
        })}
      </nav>

      <div className="space-y-2 border-t px-2 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: 'linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))', color: '#0A0A0F', fontFamily: "'Outfit',sans-serif" }}
          >
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{userEmail}</div>
            <div className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{userRole}</div>
          </div>
        </div>

        <button
          id="btn-sign-out"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
          style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.22)', color: 'var(--accent-danger)' }}
        >
          {signingOut ? (
            <><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Signing out...</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>Sign Out</>
          )}
        </button>
      </div>
    </aside>
  )
}

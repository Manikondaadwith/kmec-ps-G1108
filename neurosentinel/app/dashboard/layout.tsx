import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from './_components/sidebar'
import { ensureUserProfile } from '@/lib/user-profile'
import { getRoleLabel } from '@/lib/scout-guide'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  let userRole = 'Role not set'
  try {
    const profile = await ensureUserProfile(supabase, user)
    userRole = getRoleLabel(profile.role)
  } catch {}

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* ── Left: Sidebar ── */}
      <Sidebar userEmail={user.email ?? ''} userRole={userRole} />

      {/* ── Center: page content ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ensureUserProfile } from '@/lib/user-profile'
import { getRoleLabel } from '@/lib/scout-guide'
import { SettingsClient } from './settings-client'

export const metadata = {
  title: 'Settings - NeuroSentinel AI',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const profile = await ensureUserProfile(supabase, user)

  return (
    <>
      <header
        className="flex shrink-0 items-center justify-between border-b px-6 py-3"
        style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(16px)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>NeuroSentinel AI</span>
          <span style={{ color: 'var(--border-default)' }}>/</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit',sans-serif" }}>Settings</span>
        </div>
      </header>

      <SettingsClient email={user.email ?? ''} roleLabel={getRoleLabel(profile.role)} />
    </>
  )
}

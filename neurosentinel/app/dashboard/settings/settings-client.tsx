'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SettingsClient({ email, roleLabel }: { email: string; roleLabel: string }) {
  const supabase = createClient()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handlePasswordChange = async () => {
    setPasswordError(null)
    setPasswordMessage(null)

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Password confirmation does not match.')
      return
    }

    setPasswordLoading(true)

    try {
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to change password.')
      }

      setPasswordMessage('Password updated successfully.')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      setPasswordError(error.message || 'Unable to change password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('This will permanently delete your account and all data. This cannot be undone.')
    if (!confirmed) return

    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to delete your account.')
      }

      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (error: any) {
      setDeleteError(error.message || 'Unable to delete your account.')
      setDeleteLoading(false)
    }
  }

  return (
    <div className="max-w-4xl flex-1 space-y-8 overflow-y-auto p-8" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
          Settings
        </div>
        <h1 className="mt-2 text-3xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit',sans-serif" }}>
          Profile, security, and account controls
        </h1>
        <p className="mt-2 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
          Manage the details tied to your NeuroSentinel AI account.
        </p>
      </div>

      <section className="rounded-[30px] border p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div style={{ color: 'var(--accent-primary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>
            User Profile
          </h2>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border p-5" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Registered Email</div>
            <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit',sans-serif" }}>{email}</div>
          </div>
          <div className="rounded-2xl border p-5" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Role</div>
            <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit',sans-serif" }}>{roleLabel}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div style={{ color: 'var(--accent-primary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-secondary)' }}>
            Security
          </h2>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            className="rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.02)' }}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            className="rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none"
            style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.02)' }}
          />
        </div>

        {passwordError ? <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(255,51,102,0.22)', background: 'rgba(255,51,102,0.08)', color: 'var(--accent-danger)' }}>{passwordError}</div> : null}
        {passwordMessage ? <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(0,255,157,0.22)', background: 'rgba(0,255,157,0.08)', color: 'var(--accent-success)' }}>{passwordMessage}</div> : null}

        <button
          type="button"
          onClick={() => void handlePasswordChange()}
          disabled={passwordLoading}
          className="mt-5 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-warning))', color: '#0A0A0F' }}
        >
          {passwordLoading ? 'Updating password...' : 'Change Password'}
        </button>
      </section>

      <section className="rounded-[30px] border p-6" style={{ background: 'rgba(255,51,102,0.04)', borderColor: 'rgba(255,51,102,0.12)' }}>
        <div className="flex items-center gap-3">
          <div style={{ color: 'var(--accent-danger)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--accent-danger)' }}>
            Account
          </h2>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
          Deleting your account permanently removes your profile, reports, SCOUT chat history, and authentication record. This cannot be undone.
        </p>

        {deleteError ? <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(255,51,102,0.22)', background: 'rgba(255,51,102,0.08)', color: 'var(--accent-danger)' }}>{deleteError}</div> : null}

        <button
          type="button"
          onClick={() => void handleDeleteAccount()}
          disabled={deleteLoading}
          className="mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: 'rgba(255,51,102,0.26)', color: 'var(--accent-danger)' }}
        >
          {deleteLoading ? 'Deleting account...' : 'Delete Account'}
        </button>
      </section>
    </div>
  )
}

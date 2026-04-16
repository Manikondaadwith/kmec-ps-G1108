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

  // Icons
  const IconUser = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  )
  const IconLock = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  )
  const IconTrash = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
  )

  return (
    <div
      className="max-w-4xl flex-1 space-y-10 overflow-y-auto p-12"
      style={{ background: 'var(--bg-primary)', minHeight: '100%', animation: 'clinicalFadeIn 0.4s ease forwards' }}
    >
      {/* Header Area */}
      <div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--text-faint)' }}
        >
          General Settings
        </div>
        <h1
          className="mt-2 text-3xl font-extrabold tracking-tight"
          style={{ color: 'var(--text-heading)', fontFamily: "'Inter', sans-serif" }}
        >
          Account & Security Settings
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '600px' }}>
          Configure your clinical authentication details and manage your account status with professional-grade security controls.
        </p>
      </div>

      <div className="space-y-10">
        {/* 1. USER PROFILE SECTION */}
        <section
          className="clinical-card p-1 transition-all duration-300"
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div className="border-b px-8 py-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <div style={{ color: 'var(--text-muted)' }}>
                <IconUser />
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-heading)' }}>
                  User Profile
                </h2>
                <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  Your registered authentication details
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
                  Registered Email Address
                </div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {email}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
                  Assigned User Role
                </div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {roleLabel}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 1.5 ASSISTANT SETTINGS */}
        <section
          className="clinical-card p-1 transition-all duration-300"
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div className="border-b px-8 py-5" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-3">
              <div style={{ color: 'var(--accent-primary)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-heading)' }}>
                  SCOUT Assistant
                </h2>
                <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  Manage assistant tutorials and preferences
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard Guided Tour</div>
                <div className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>Replay the interactive walkthrough of the clinical workspace.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('ns-restart-tour'))
                }}
                className="rounded-xl px-5 py-2.5 text-[13px] font-bold shadow-sm transition-all hover:-translate-y-0.5 active:scale-95"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                Restart Tour
              </button>
            </div>
          </div>
        </section>

        {/* 2. SECURITY SECTION */}
        <section
          className="clinical-card p-1 transition-all duration-300"
          style={{ boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-strong)' }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div className="border-b px-8 py-6" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: 'var(--accent-primary-light)', color: 'var(--accent-primary)' }}
              >
                <IconLock />
              </div>
              <div>
                <h2 className="text-[16px] font-bold" style={{ color: 'var(--text-heading)' }}>
                  Security & Authentication
                </h2>
                <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  Secure your account access credentials
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="max-w-2xl space-y-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-2.5">
                  <label className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    New Security Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter new password"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent-primary)'
                      e.target.style.boxShadow = '0 0 0 3px rgba(14, 116, 144, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--border-default)'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all placeholder:text-slate-400"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent-primary)'
                      e.target.style.boxShadow = '0 0 0 3px rgba(14, 116, 144, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--border-default)'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                <div className="mt-0.5" style={{ color: 'var(--accent-primary)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </div>
                <p>Use a robust password configuration with at least 8 characters including alphanumeric symbols for optimal clinical security.</p>
              </div>

              {passwordError && (
                <div
                  className="rounded-xl border px-4 py-3 text-[13px] font-medium"
                  style={{
                    borderColor: 'rgba(220, 38, 38, 0.15)',
                    background: 'var(--accent-danger-light)',
                    color: 'var(--accent-danger)',
                  }}
                >
                  {passwordError}
                </div>
              )}

              {passwordMessage && (
                <div
                  className="rounded-xl border px-4 py-3 text-[13px] font-medium"
                  style={{
                    borderColor: 'rgba(22, 163, 74, 0.15)',
                    background: 'var(--accent-success-light)',
                    color: 'var(--accent-success)',
                  }}
                >
                  {passwordMessage}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handlePasswordChange()}
                disabled={passwordLoading}
                className="clinical-btn-primary"
                style={{
                  height: 46,
                  padding: '0 32px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(14, 116, 144, 0.2)',
                }}
              >
                {passwordLoading ? 'Processing Updates...' : 'Change Security Password'}
              </button>
            </div>
          </div>
        </section>

        {/* 3. ACCOUNT SECTION (DANGER ZONE) */}
        <section
          className="clinical-card p-1 transition-all duration-300"
          style={{ background: '#fffafa', borderColor: 'rgba(220, 38, 38, 0.1)' }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div className="border-b px-8 py-6" style={{ borderColor: 'rgba(220, 38, 38, 0.06)' }}>
            <div className="flex items-center gap-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: 'var(--accent-danger-light)', color: 'var(--accent-danger)' }}
              >
                <IconTrash />
              </div>
              <div>
                <h2 className="text-[16px] font-bold" style={{ color: 'var(--accent-danger)' }}>
                  Permanent Account Removal
                </h2>
                <p className="text-[13px]" style={{ color: 'var(--accent-danger)', opacity: 0.7 }}>
                  Critical action area — exercise caution
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <p className="max-w-xl text-[14.5px] font-medium leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Executing an account deletion will permanently purge your clinical profile, historical reports, scout sessions, and authentication metadata.
              <span className="mt-2 block font-bold text-red-600">This action is medically irreversible.</span>
            </p>

            {deleteError && (
              <div
                className="mt-6 rounded-xl border px-4 py-3 text-[13px] font-medium"
                style={{
                  borderColor: 'rgba(220, 38, 38, 0.25)',
                  background: 'white',
                  color: 'var(--accent-danger)',
                }}
              >
                {deleteError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleDeleteAccount()}
              disabled={deleteLoading}
              className="mt-8 clinical-btn-danger-outline"
              style={{
                height: 44,
                padding: '0 28px',
                borderRadius: '12px',
                fontWeight: 700,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-danger-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {deleteLoading ? 'Processing Purge...' : 'Purge Clinical Account'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

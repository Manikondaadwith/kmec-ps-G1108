'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureUserProfile } from '@/lib/user-profile'

function BackgroundAura() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-[0.07]"
        style={{
          background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)',
          animation: 'pulseGlow 6s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -bottom-60 -right-40 h-[700px] w-[700px] rounded-full opacity-[0.05]"
        style={{
          background: 'radial-gradient(circle, var(--accent-danger) 0%, transparent 70%)',
          animation: 'pulseGlow 8s ease-in-out infinite 2s',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  )
}

function Logo() {
  return (
    <div className="mb-8 flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        <div
          className="absolute h-16 w-16 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, var(--accent-primary), transparent)',
            animation: 'ping-slow 2.5s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />
        <div
          className="relative flex h-12 w-12 items-center justify-center rounded-xl border"
          style={{
            background: 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(123,97,255,0.1))',
            borderColor: 'var(--accent-primary)',
            boxShadow: 'var(--glow-sm)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M3 13 Q5 9 7 13 Q9 17 11 13 Q13 9 15 13 Q17 17 19 13 Q21 9 23 13" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="3" cy="13" r="1.5" fill="var(--accent-primary)" />
            <circle cx="23" cy="13" r="1.5" fill="var(--accent-primary)" />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent-primary)', fontFamily: "'Outfit', sans-serif" }}>
          NeuroSentinel AI
        </h1>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          Sign in to the Command Centre
        </p>
      </div>
    </div>
  )
}

type InputFieldProps = {
  id: string
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoComplete?: string
  disabled?: boolean
  icon: ReactNode
  suffix?: ReactNode
}

function InputField({ id, label, type, value, onChange, placeholder, autoComplete, disabled, icon, suffix }: InputFieldProps) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <div
        className="relative flex items-center rounded-xl transition-all"
        style={{
          background: 'var(--bg-tertiary)',
          border: `1px solid ${focused ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        }}
      >
        <span className="absolute left-3.5 text-sm" style={{ color: focused ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full rounded-xl bg-transparent py-3.5 pl-10 pr-12 text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        {suffix ? <div className="absolute right-3 flex items-center">{suffix}</div> : null}
      </div>
    </div>
  )
}

function EyeButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md p-1 transition-all hover:bg-[rgba(255,255,255,0.04)]" style={{ color: 'var(--text-muted)' }}>
      {visible ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94" /><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.17 4.26" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setInfoMessage(params.get('message'))
  }, [])

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Email and password required.')
      return
    }

    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Session not available after sign in.')
      }

      await ensureUserProfile(supabase, user)
      window.sessionStorage.removeItem('ns-pending-onboarding')
      window.location.href = '/dashboard'
    } catch (authError: any) {
      setError(authError.message || 'Unable to complete sign in.')
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <BackgroundAura />
      <div className="glass-card scanline shadow-card relative w-full max-w-md px-8 py-10" style={{ animation: 'fadeInUp 0.5s ease forwards' }}>
        <Logo />
        <form onSubmit={handleSignIn} className="flex flex-col gap-5">
          <InputField id="email" label="Email Address" type="email" value={email} onChange={setEmail} placeholder="your@email.com" autoComplete="email" disabled={loading} icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>} />
          <InputField
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            placeholder="********"
            autoComplete="current-password"
            disabled={loading}
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
            suffix={<EyeButton visible={showPassword} onClick={() => setShowPassword((value) => !value)} />}
          />

          {infoMessage ? <div className="rounded-lg border p-3 text-xs" style={{ background: 'rgba(0,240,255,0.05)', borderColor: 'rgba(0,240,255,0.2)', color: 'var(--accent-primary)' }}>{infoMessage}</div> : null}
          {error && <div className="rounded-lg border p-3 text-xs" style={{ background: 'rgba(255,51,102,0.05)', borderColor: 'rgba(255,51,102,0.2)', color: 'var(--accent-danger)' }}>{error}</div>}

          <button type="submit" disabled={loading} className="w-full rounded-xl py-3.5 font-bold transition-all" style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#0A0A0F', boxShadow: 'var(--glow-sm)' }}>
            {loading ? 'Authenticating...' : 'Sign In ->'}
          </button>

          <div className="space-y-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <p>Need access? <a href="/" className="font-semibold" style={{ color: 'var(--accent-primary)' }}>Request an account</a></p>
          </div>
        </form>
      </div>
    </main>
  )
}

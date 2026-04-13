'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureUserProfile } from '@/lib/user-profile'

type Step = 'signup' | 'otp' | 'success'

const OTP_LENGTH = 6
const RESEND_SECONDS = 60

function BackgroundAura() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)', animation: 'pulseGlow 6s ease-in-out infinite' }}
      />
      <div
        className="absolute -bottom-60 -right-40 h-[700px] w-[700px] rounded-full opacity-[0.05]"
        style={{ background: 'radial-gradient(circle, var(--accent-danger) 0%, transparent 70%)', animation: 'pulseGlow 8s ease-in-out infinite 2s' }}
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
          style={{ background: 'radial-gradient(circle, var(--accent-primary), transparent)', animation: 'ping-slow 2.5s cubic-bezier(0,0,0.2,1) infinite' }}
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
            <path
              d="M3 13 Q5 9 7 13 Q9 17 11 13 Q13 9 15 13 Q17 17 19 13 Q21 9 23 13"
              stroke="var(--accent-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
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
          AI-Powered Seizure Intelligence
        </p>
      </div>
    </div>
  )
}

function EyeButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md p-1 transition-all hover:bg-[rgba(255,255,255,0.04)]" style={{ color: 'var(--text-muted)' }}>
      {visible ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.17 4.26" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

function InputField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  icon,
  suffix,
}: {
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
}) {
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
          boxShadow: focused ? 'var(--glow-sm)' : 'none',
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
          style={{ color: 'var(--text-primary)', caretColor: 'var(--accent-primary)' }}
        />
        {suffix ? <div className="absolute right-3 flex items-center">{suffix}</div> : null}
      </div>
    </div>
  )
}

function OtpInput({ digits, onChange, disabled }: { digits: string[]; onChange: (digits: string[]) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  const focus = (index: number) => refs.current[index]?.focus()

  const handleInput = (index: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1)
    if (!char) return
    const next = [...digits]
    next[index] = char
    onChange(next)
    if (index < OTP_LENGTH - 1) focus(index + 1)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = [...digits]
      if (next[index]) {
        next[index] = ''
        onChange(next)
      } else if (index > 0) {
        next[index - 1] = ''
        onChange(next)
        focus(index - 1)
      }
    }

    if (event.key === 'ArrowLeft' && index > 0) focus(index - 1)
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) focus(index + 1)
  }

  const handlePaste = (event: ClipboardEvent) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((char, index) => {
      next[index] = char
    })
    onChange(next)
    focus(Math.min(pasted.length, OTP_LENGTH - 1))
  }

  return (
    <div className="flex justify-center gap-3" onPaste={handlePaste}>
      {digits.map((digit, index) => {
        const filled = digit !== ''

        return (
          <input
            key={index}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(event) => handleInput(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.target.select()}
            aria-label={`OTP digit ${index + 1}`}
            className="h-14 w-12 rounded-xl text-center text-xl font-bold transition-all"
            style={{
              background: filled ? 'rgba(0,240,255,0.08)' : 'var(--bg-tertiary)',
              border: `1.5px solid ${filled ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              color: filled ? 'var(--accent-primary)' : 'var(--text-primary)',
              boxShadow: filled ? 'var(--glow-sm)' : 'none',
              fontFamily: "'Outfit', monospace",
              caretColor: 'var(--accent-primary)',
            }}
          />
        )
      })}
    </div>
  )
}

function PrimaryButton({
  id,
  loading,
  disabled,
  onClick,
  children,
}: {
  id: string
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="relative w-full overflow-hidden rounded-xl py-3.5 text-sm font-semibold tracking-wide transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
        color: '#0A0A0F',
        boxShadow: disabled || loading ? 'none' : 'var(--glow-sm)',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {!disabled && !loading ? (
        <span
          className="absolute inset-0 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
            backgroundSize: '200% auto',
            animation: 'shimmer 2.5s linear infinite',
          }}
        />
      ) : null}
      <span className="relative flex items-center justify-center gap-2">
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Processing...
          </>
        ) : (
          children
        )}
      </span>
    </button>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
      role="alert"
      style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: 'var(--accent-danger)' }}
    >
      <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.4449 0.608765C8.0183 -0.107015 6.9817 -0.107015 6.55509 0.608765L0.161178 11.3368C-0.275824 12.0697 0.252503 13 1.10608 13H13.8939C14.7475 13 15.2758 12.0697 14.8388 11.3368L8.4449 0.608765ZM7.4141 1.12073C7.45288 1.05566 7.54712 1.05566 7.5859 1.12073L13.9798 11.8488C14.0196 11.9154 13.9715 12 13.8939 12H1.10608C1.02849 12 0.980454 11.9154 1.02018 11.8488L7.4141 1.12073ZM6.8269 4.48611C6.81221 4.10423 7.11783 3.78663 7.5 3.78663C7.88217 3.78663 8.18778 4.10423 8.1731 4.48611L8.01921 8.48701C8.00848 8.766 7.778 8.98664 7.5 8.98664C7.222 8.98664 6.99151 8.766 6.98078 8.48701L6.8269 4.48611ZM8.24989 10.476C8.24989 10.8902 7.9141 11.226 7.49989 11.226C7.08568 11.226 6.74989 10.8902 6.74989 10.476C6.74989 10.0618 7.08568 9.72599 7.49989 9.72599C7.9141 9.72599 8.24989 10.0618 8.24989 10.476Z"
        />
      </svg>
      {message}
    </div>
  )
}

function SuccessScreen({ email }: { email: string }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center" style={{ animation: 'fadeInScale 0.4s ease forwards' }}>
      <div className="relative">
        <div
          className="absolute inset-0 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, var(--accent-success), transparent)', animation: 'ping-slow 2s cubic-bezier(0,0,0.2,1) infinite' }}
        />
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: 'rgba(0,255,157,0.1)', border: '1.5px solid var(--accent-success)' }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="var(--accent-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--accent-success)', fontFamily: "'Outfit', sans-serif" }}>
          Identity Verified
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Welcome to NeuroSentinel AI.
          <br />
          <span style={{ color: 'var(--text-muted)' }}>{email}</span>
        </p>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Preparing your SCOUT — Signal Capture & Observation Unified Tool onboarding...
      </p>
    </div>
  )
}

export default function SignUpPage() {
  const supabase = createClient()
  const [step, setStep] = useState<Step>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [verificationToken, setVerificationToken] = useState('')
  const [resendIn, setResendIn] = useState(RESEND_SECONDS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAutoSubmitted = useRef(false)

  const allFilled = useMemo(() => digits.every((digit) => digit !== ''), [digits])

  useEffect(() => {
    if (step !== 'otp') return undefined

    setResendIn(RESEND_SECONDS)
    const interval = window.setInterval(() => {
      setResendIn((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [step, verificationToken])

  const handleDigitChange = useCallback((next: string[]) => {
    if (!next.every((digit) => digit !== '')) {
      hasAutoSubmitted.current = false
    }
    setDigits(next)
    setError(null)
  }, [])

  const requestOtp = async () => {
    const response = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const result = await response.json()

    if (!response.ok) {
      if (response.status === 409 && result?.redirectTo) {
        window.location.href = result.redirectTo
        return
      }
      throw new Error(result.error || 'Unable to send verification code.')
    }

    setVerificationToken(result.verificationToken || '')
  }

  const handleSignUp = async () => {
    setError(null)

    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Password and confirm password must match.')
      return
    }

    if (!acceptedTerms) {
      setError('You need to accept the Terms and Privacy Policy to continue.')
      return
    }

    setLoading(true)
    try {
      await requestOtp()
      setDigits(Array(OTP_LENGTH).fill(''))
      hasAutoSubmitted.current = false
      setStep('otp')
    } catch (requestError: any) {
      setError(requestError.message || 'Unable to send verification code.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = useCallback(async () => {
    const otp = digits.join('')

    if (otp.length < OTP_LENGTH) {
      setError(`Please enter all ${OTP_LENGTH} digits.`)
      return
    }

    if (!verificationToken) {
      setError('Your verification session expired. Please request a new code.')
      hasAutoSubmitted.current = false
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/complete-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          otp,
          verificationToken,
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to complete sign up.')
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        throw new Error(signInError.message)
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await ensureUserProfile(supabase, user)
      }

      window.sessionStorage.setItem('ns-pending-onboarding', 'true')
      setStep('success')
      window.setTimeout(() => {
        window.location.href = '/onboarding'
      }, 1400)
    } catch (verifyError: any) {
      setError(verifyError.message || 'Unable to verify code.')
      hasAutoSubmitted.current = false
    } finally {
      setLoading(false)
    }
  }, [digits, email, password, supabase, verificationToken])

  useEffect(() => {
    if (step === 'otp' && allFilled && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true
      void handleVerifyOtp()
    }
  }, [allFilled, handleVerifyOtp, step])

  const handleResend = async () => {
    if (resendIn > 0) return

    setLoading(true)
    setError(null)
    try {
      await requestOtp()
      setDigits(Array(OTP_LENGTH).fill(''))
      hasAutoSubmitted.current = false
    } catch (resendError: any) {
      setError(resendError.message || 'Unable to resend verification code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <BackgroundAura />

      <div className="glass-card scanline shadow-card relative w-full max-w-md px-8 py-10" style={{ animation: 'fadeInUp 0.5s ease forwards' }}>
        <div className="absolute left-8 right-8 top-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)' }} />

        <Logo />

        {step === 'signup' ? (
          <div className="flex flex-col gap-5" style={{ animation: 'fadeInScale 0.35s ease forwards' }}>
            <div className="text-center">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                Create your account
              </h2>
            </div>

            <InputField
              id="email"
              label="Email Address"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value)
                setError(null)
              }}
              placeholder="your@email.com"
              autoComplete="email"
              disabled={loading}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              }
            />

            <InputField
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(value) => {
                setPassword(value)
                setError(null)
              }}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              disabled={loading}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              }
              suffix={<EyeButton visible={showPassword} onClick={() => setShowPassword((value) => !value)} />}
            />

            <InputField
              id="confirm-password"
              label="Confirm Password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value)
                setError(null)
              }}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              disabled={loading}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M12 15h.01" />
                </svg>
              }
              suffix={<EyeButton visible={showConfirmPassword} onClick={() => setShowConfirmPassword((value) => !value)} />}
            />

            <label
              className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => {
                  setAcceptedTerms(event.target.checked)
                  setError(null)
                }}
                className="mt-0.5 h-4 w-4 rounded"
                style={{ accentColor: 'var(--accent-primary)' }}
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-4" style={{ color: 'var(--text-primary)' }}>
                  Terms of Use
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4" style={{ color: 'var(--text-primary)' }}>
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            {error ? <ErrorBanner message={error} /> : null}

            <PrimaryButton id="btn-signup" onClick={handleSignUp} loading={loading}>
              Send Verification Code
            </PrimaryButton>

            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              A 6-digit code will be sent from manikondaadwith6@gmail.com.
            </p>

            <div className="flex items-center gap-3">
              <div className="h-[1px] flex-1" style={{ background: 'var(--border-subtle)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Already have an account?
              </span>
              <div className="h-[1px] flex-1" style={{ background: 'var(--border-subtle)' }} />
            </div>

            <a href="/login" className="text-center text-sm font-medium" style={{ color: 'var(--accent-primary)' }}>
              Sign in instead
            </a>
          </div>
        ) : null}

        {step === 'otp' ? (
          <div className="flex flex-col gap-6" style={{ animation: 'fadeInScale 0.35s ease forwards' }}>
            <div className="text-center">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                Check your email
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                We sent a 6-digit code to {email}. Enter it below.
              </p>
            </div>

            <OtpInput digits={digits} onChange={handleDigitChange} disabled={loading} />

            {error ? <ErrorBanner message={error} /> : null}

            <PrimaryButton id="btn-verify" onClick={() => void handleVerifyOtp()} loading={loading} disabled={!allFilled}>
              Verify and Create Account
            </PrimaryButton>

            <div className="space-y-2 text-center text-xs">
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendIn > 0}
                className="font-medium disabled:opacity-50"
                style={{ color: resendIn > 0 ? 'var(--text-muted)' : 'var(--accent-primary)' }}
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('signup')
                    setDigits(Array(OTP_LENGTH).fill(''))
                    setVerificationToken('')
                    setError(null)
                  }}
                  className="font-medium"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Change email
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 'success' ? <SuccessScreen email={email} /> : null}
      </div>
    </main>
  )
}

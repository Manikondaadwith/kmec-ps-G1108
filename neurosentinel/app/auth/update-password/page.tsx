'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

/* Reuse the background styling from login for consistency */
function PageBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      aria-hidden="true"
      style={{
        background: `
          radial-gradient(circle at top left, rgba(16, 185, 129, 0.08), transparent 40%),
          radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.06), transparent 50%),
          url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E\"),
          linear-gradient(135deg, #F8FAFC, #E2E8F0)
        `,
      }}
    >
      <div
        className="absolute left-[35%] top-[30%] h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'rgba(14,165,164,0.05)', filter: 'blur(80px)' }}
      />
      <div
        className="absolute left-[65%] top-[60%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'rgba(59,130,246,0.04)', filter: 'blur(80px)' }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ opacity: 0.025 }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="neural-wave-reset" x="0" y="0" width="120" height="60" patternUnits="userSpaceOnUse">
            <path
              d="M0 30 Q10 15 20 30 Q30 45 40 30 Q50 15 60 30 Q70 45 80 30 Q90 15 100 30 Q110 45 120 30"
              stroke="#0EA5A4"
              strokeWidth="1.2"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#neural-wave-reset)" />
      </svg>
    </div>
  )
}

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login?message=Password updated successfully. Please sign in.'
      }, 2000)
    }
    setLoading(false)
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4 font-['Outfit']">
      <PageBackground />

      <div
        className="relative z-10 w-full"
        style={{
          maxWidth: '440px',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          padding: '40px'
        }}
      >
        <div className="mb-8 text-center">
          <h1 className="text-[22px] font-bold text-[#0F172A]">Reset Password</h1>
          <p className="mt-2 text-[14px] font-medium text-[#334155]">Enter your new password below</p>
          <div className="mx-auto mt-4 h-0.5 w-16 bg-[#0EA5A4] opacity-50" />
        </div>

        {success ? (
          <div className="rounded-xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-100">
            <span className="text-2xl">✅</span>
            <p className="mt-2 text-sm font-bold text-emerald-800">Password updated successfully!</p>
            <p className="mt-1 text-xs text-emerald-600">Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#334155]">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full rounded-xl border border-black/5 bg-[#F1F5F9] px-4 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-4 focus:ring-[#10B981]/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#334155]">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full rounded-xl border border-black/5 bg-[#F1F5F9] px-4 py-3 text-sm outline-none transition-all focus:border-[#10B981] focus:ring-4 focus:ring-[#10B981]/10"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-[13px] text-red-600 ring-1 ring-red-100">
                <span>⚠️</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-xl bg-gradient-to-r from-[#0EA5A4] to-[#059669] text-sm font-bold text-white shadow-lg shadow-[#0EA5A4]/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

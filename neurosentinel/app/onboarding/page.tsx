'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScoutAvatar } from '@/app/components/scout-avatar'
import {
  SCOUT_FULL_NAME,
  classifyRoleInput,
  getGuideChoicePrompt,
  getRoleConfirmation,
  getRoleLabel,
  SCOUT_GUIDE_CHOICE_ACTIONS,
  SCOUT_ONBOARDING_FINISH,
  SCOUT_ONBOARDING_INTRO,
  SCOUT_ONBOARDING_ROLE_PROMPT,
  SCOUT_ONBOARDING_TOUR,
  type ScoutRole,
} from '@/lib/scout-guide'
import { ensureUserProfile, toDatabaseRole } from '@/lib/user-profile'

type OnboardingStage = 'intro' | 'role_prompt' | 'guide_choice' | 'tour' | 'finishing'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  }
}

function highlightStyle(active: boolean, dimmed: boolean) {
  if (active) {
    return {
      opacity: 1,
      transform: 'translateY(-4px)',
      borderColor: 'rgba(0,240,255,0.38)',
      boxShadow: '0 0 0 1px rgba(0,240,255,0.2), 0 24px 60px rgba(0,0,0,0.36), 0 0 40px rgba(0,240,255,0.12)',
    }
  }

  if (dimmed) {
    return {
      opacity: 0.34,
      transform: 'scale(0.985)',
      borderColor: 'rgba(255,255,255,0.05)',
      boxShadow: 'none',
    }
  }

  return {
    opacity: 1,
    transform: 'none',
    borderColor: 'rgba(255,255,255,0.08)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [typing, setTyping] = useState(false)
  const [stage, setStage] = useState<OnboardingStage>('intro')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [roleInput, setRoleInput] = useState('')
  const [role, setRole] = useState<ScoutRole>(null)
  const [error, setError] = useState<string | null>(null)
  const [tourStepIndex, setTourStepIndex] = useState(0)

  const tourSteps = useMemo(() => SCOUT_ONBOARDING_TOUR.filter((step) => step.target !== 'role'), [])
  const currentStep = tourSteps[tourStepIndex]
  const currentTarget = stage === 'tour' ? currentStep?.target : null
  const progressLabel = useMemo(() => `${tourStepIndex + 1}/${tourSteps.length}`, [tourStepIndex, tourSteps.length])

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/')
        return
      }

      const shouldShowOnboarding = window.sessionStorage.getItem('ns-pending-onboarding') === 'true'
      const profile = await ensureUserProfile(supabase, user)

      if (profile.onboarding_complete || !shouldShowOnboarding) {
        window.sessionStorage.removeItem('ns-pending-onboarding')
        router.replace('/dashboard')
        return
      }

      setRole(profile.role)

      if (profile.role) {
        setRoleInput(profile.role)
        setMessages([
          createMessage('assistant', SCOUT_ONBOARDING_INTRO),
          createMessage('assistant', getGuideChoicePrompt(profile.role)),
        ])
        setStage('guide_choice')
      } else {
        setMessages([createMessage('assistant', SCOUT_ONBOARDING_INTRO)])
        setStage('intro')
      }

      setChecking(false)
    }

    void checkUser()
  }, [router, supabase])

  useEffect(() => {
    if (checking || stage !== 'intro') return undefined

    setTyping(true)
    const timer = window.setTimeout(() => {
      setMessages((current) => [...current, createMessage('assistant', SCOUT_ONBOARDING_ROLE_PROMPT)])
      setTyping(false)
      setStage('role_prompt')
    }, 550)

    return () => window.clearTimeout(timer)
  }, [checking, stage])

  const persistProfile = async (updates: { role?: ScoutRole; onboarding_complete?: boolean }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) throw new Error('Session expired.')

    if (updates.role === 'clinician' || updates.role === 'researcher' || updates.role === 'patient') {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          scout_role: updates.role,
          role: updates.role,
        },
      })

      if (metadataError) throw metadataError
    }

    const profileUpdates: { onboarding_complete: boolean; role?: 'clinician' | 'researcher' | 'patient' } = {
      onboarding_complete: updates.onboarding_complete ?? false,
    }

    const databaseRole = toDatabaseRole(updates.role)
    if (databaseRole === 'clinician' || databaseRole === 'researcher' || databaseRole === 'patient') {
      profileUpdates.role = databaseRole
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(profileUpdates)
      .eq('id', user.id)

    if (updateError) throw updateError
  }

  const completeOnboarding = async (finalAssistantMessage?: string) => {
    setSaving(true)
    setError(null)
    setStage('finishing')

    if (finalAssistantMessage) {
      setMessages((current) => [...current, createMessage('assistant', finalAssistantMessage)])
    }

    try {
      await persistProfile({
        role,
        onboarding_complete: true,
      })

      window.sessionStorage.removeItem('ns-pending-onboarding')
      window.sessionStorage.setItem('ns-scout-tour-complete', 'true')
      router.replace('/dashboard')
    } catch (completeError: any) {
      console.error('[Onboarding] Error:', completeError)
      setError(completeError.message || 'Unable to finish onboarding right now.')
      setSaving(false)
      setStage(role ? 'guide_choice' : 'role_prompt')
    }
  }

  const handleRoleSubmit = async () => {
    setError(null)
    const typedRole = roleInput.trim()
    const classifiedRole = classifyRoleInput(typedRole)

    if (!classifiedRole) {
      setError('Type clinician, researcher, or patient so SCOUT can personalize the experience.')
      return
    }

    setSaving(true)

    try {
      await persistProfile({ role: classifiedRole })
      setRole(classifiedRole)
      setMessages((current) => [
        ...current,
        createMessage('user', typedRole),
        createMessage('assistant', getGuideChoicePrompt(classifiedRole)),
      ])
      setStage('guide_choice')
    } catch (saveError: any) {
      console.error('[Onboarding] Role save error:', saveError)
      setError(saveError.message || 'Unable to save your role right now.')
    } finally {
      setSaving(false)
    }
  }

  const handleTakeTour = () => {
    setError(null)
    setMessages((current) => [...current, createMessage('user', SCOUT_GUIDE_CHOICE_ACTIONS[0])])
    setTourStepIndex(0)
    setStage('tour')
  }

  const handleGoToDashboard = async () => {
    setMessages((current) => [...current, createMessage('user', SCOUT_GUIDE_CHOICE_ACTIONS[1])])
    await completeOnboarding("Understood. I'll take you straight into the dashboard.")
  }

  const handleTourNext = async () => {
    setError(null)

    if (tourStepIndex === tourSteps.length - 1) {
      await completeOnboarding(SCOUT_ONBOARDING_FINISH)
      return
    }

    setTourStepIndex((current) => current + 1)
  }

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent-primary) transparent transparent transparent' }} />
          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
            Initializing {SCOUT_FULL_NAME}...
          </p>
        </div>
      </main>
    )
  }

  if (stage === 'tour') {
    return (
      <main className="relative min-h-dvh overflow-hidden bg-[var(--bg-primary)]">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -left-48 -top-48 h-[620px] w-[620px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.5) 0%, transparent 68%)' }} />
          <div className="absolute -bottom-56 right-[-120px] h-[700px] w-[700px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.5) 0%, transparent 70%)' }} />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,240,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.8) 1px, transparent 1px)',
              backgroundSize: '58px 58px',
            }}
          />
        </div>

        <header
          className="relative z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(10,10,15,0.86)', backdropFilter: 'blur(16px)' }}
        >
          <div className="flex items-center gap-3">
            <ScoutAvatar size={40} pulse />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                NeuroSentinel AI
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {SCOUT_FULL_NAME}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void completeOnboarding('Tour skipped. Taking you to the dashboard.')}
            disabled={saving}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
            style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
          >
            Skip tour
          </button>
        </header>

        <div className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                Guided Product Tour
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                Learn the workflow in one pass.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                SCOUT will highlight the upload flow, the EEG format rules, and what happens once the analysis finishes.
              </p>
            </div>

            <div className="rounded-2xl border px-4 py-3 text-right" style={{ borderColor: 'rgba(0,240,255,0.16)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                Tour Progress
              </div>
              <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--accent-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {progressLabel}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <section
              id="tour-upload-zone"
              className="rounded-[28px] border p-6 transition-all duration-300"
              style={{
                background: 'linear-gradient(180deg, rgba(19,22,31,0.92), rgba(11,13,18,0.94))',
                ...highlightStyle(currentTarget === 'upload', Boolean(currentTarget) && currentTarget !== 'upload'),
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                    Command Centre
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                    Upload your EEG recording
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                    Drop an .edf file here and NeuroSentinel AI handles the rest — channel validation, seizure detection, report generation, and a SCOUT-powered briefing tailored to your role.
                  </p>
                </div>
                <div className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: 'rgba(0,240,255,0.08)', color: 'var(--accent-primary)' }}>
                  Spotlight
                </div>
              </div>

              <div
                className="mt-6 rounded-[28px] border-2 border-dashed px-8 py-16 text-center"
                style={{
                  borderColor: currentTarget === 'upload' ? 'rgba(0,240,255,0.4)' : 'rgba(255,255,255,0.08)',
                  background: currentTarget === 'upload' ? 'rgba(0,240,255,0.05)' : 'rgba(255,255,255,0.02)',
                  boxShadow: currentTarget === 'upload' ? '0 0 0 1px rgba(0,240,255,0.12), inset 0 0 40px rgba(0,240,255,0.05)' : 'none',
                }}
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="mt-5 text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                  Drop your EEG recording here
                </div>
                <div className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  SCOUT checks the file before the model runs.
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-[28px] border p-5" style={{ background: 'linear-gradient(180deg, rgba(19,22,31,0.94), rgba(11,13,18,0.96))', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-3">
                  <ScoutAvatar size={38} compact />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                      Personalization Locked
                    </div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                      {getRoleLabel(role)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border px-4 py-3 text-sm leading-6" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}>
                  {role ? getRoleConfirmation(role) : 'SCOUT will keep the rest of the product aligned to your role.'}
                </div>
              </section>

              <section
                id="tour-format-panel"
                className="rounded-[28px] border p-5 transition-all duration-300"
                style={{
                  background: 'linear-gradient(180deg, rgba(19,22,31,0.94), rgba(11,13,18,0.96))',
                  ...highlightStyle(currentTarget === 'format', Boolean(currentTarget) && currentTarget !== 'format'),
                }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                  EEG Format Rules
                </div>
                <div className="mt-3 space-y-3">
                  {['Accepted format: .edf (European Data Format)', 'Recommended: 22-channel scalp EEG, 10-20 system', 'Sampling: 256 Hz • Analysis time: 30–60 seconds', 'SCOUT validates file integrity before model runs'].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border px-4 py-3 text-sm"
                      style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)' }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section
                id="tour-report-panel"
                className="rounded-[28px] border p-5 transition-all duration-300"
                style={{
                  background: 'linear-gradient(180deg, rgba(19,22,31,0.94), rgba(11,13,18,0.96))',
                  ...highlightStyle(currentTarget === 'report', Boolean(currentTarget) && currentTarget !== 'report'),
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                      Clinical Report
                    </div>
                    <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                      Full detection, risk stratification, brain mapping, and AI briefing
                    </div>
                  </div>
                  <div className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ background: 'rgba(255,184,0,0.08)', color: 'var(--accent-secondary)' }}>
                    30-60 sec
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {[
                    { label: 'Seizure Detection', value: '22-ch V4' },
                    { label: 'Risk Stratification', value: 'Scored' },
                    { label: 'Brain Region Mapping', value: 'Heatmaps' },
                    { label: 'Signal Quality', value: 'Graded' },
                    { label: 'SCOUT AI Summary', value: 'Role-aware' },
                    { label: 'PDF Export', value: 'Ready' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm"
                      style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--accent-primary)' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="fixed bottom-6 right-6 z-20 w-full max-w-[420px] px-4 sm:px-0">
          <div
            className="rounded-[28px] border p-5 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(14,16,24,0.97), rgba(8,10,15,0.98))',
              borderColor: 'rgba(0,240,255,0.16)',
              boxShadow: '0 26px 70px rgba(0,0,0,0.45), 0 0 40px rgba(0,240,255,0.08)',
            }}
          >
            <div className="flex items-start gap-4">
              <ScoutAvatar size={52} pulse />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                      {SCOUT_FULL_NAME}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                      Tour Step {progressLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void completeOnboarding('Tour skipped. Taking you to the dashboard.')}
                    disabled={saving}
                    className="text-[10px] font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Skip
                  </button>
                </div>
                <p className="mt-4 whitespace-pre-line text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                  {currentStep.body}
                </p>
              </div>
            </div>

            {error ? (
              <div
                className="mt-4 rounded-2xl border px-4 py-3 text-sm"
                style={{ borderColor: 'rgba(255,51,102,0.22)', background: 'rgba(255,51,102,0.08)', color: 'var(--accent-danger)' }}
              >
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (tourStepIndex > 0) {
                    setTourStepIndex((current) => current - 1)
                    setError(null)
                  }
                }}
                disabled={saving || tourStepIndex === 0}
                className="rounded-2xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleTourNext()}
                disabled={saving}
                className="rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#0A0A0F' }}
              >
                {saving ? 'Working...' : tourStepIndex === tourSteps.length - 1 ? 'Finish tour' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--bg-primary)] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-44 -top-44 h-[600px] w-[600px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.42) 0%, transparent 68%)' }} />
        <div className="absolute -bottom-56 -right-20 h-[720px] w-[720px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, rgba(255,184,0,0.36) 0%, transparent 70%)' }} />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0,240,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.7) 1px, transparent 1px)',
            backgroundSize: '58px 58px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[760px]">
        <div
          className="overflow-hidden rounded-[32px] border"
          style={{
            background: 'linear-gradient(180deg, rgba(14,16,24,0.96), rgba(8,10,15,0.97))',
            borderColor: 'rgba(0,240,255,0.14)',
            boxShadow: '0 28px 90px rgba(0,0,0,0.45), 0 0 40px rgba(0,240,255,0.08)',
          }}
        >
          <div className="flex items-center gap-4 border-b px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <ScoutAvatar size={54} pulse />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                NeuroSentinel AI
              </div>
              <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {SCOUT_FULL_NAME}
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                First visit setup. Role first, then tour or direct entry.
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-6">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                <div className="max-w-[88%] space-y-1">
                  {message.role === 'assistant' ? (
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                      SCOUT
                    </div>
                  ) : null}
                  <div
                    className="whitespace-pre-line rounded-[24px] px-4 py-3 text-sm leading-7"
                    style={
                      message.role === 'assistant'
                        ? {
                            background: 'rgba(0,240,255,0.07)',
                            border: '1px solid rgba(0,240,255,0.12)',
                            color: 'var(--text-primary)',
                            borderBottomLeftRadius: 8,
                          }
                        : {
                            background: 'linear-gradient(135deg, rgba(0,240,255,0.18), rgba(255,184,0,0.16))',
                            border: '1px solid rgba(0,240,255,0.18)',
                            color: '#F7FBFF',
                            borderBottomRightRadius: 8,
                          }
                    }
                  >
                    {message.content}
                  </div>
                </div>
              </div>
            ))}

            {typing ? (
              <div className="flex justify-start">
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                    SCOUT
                  </div>
                  <div
                    className="flex items-center gap-1 rounded-[24px] px-4 py-3"
                    style={{ background: 'rgba(0,240,255,0.07)', border: '1px solid rgba(0,240,255,0.12)', borderBottomLeftRadius: 8 }}
                  >
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: 'var(--accent-primary)', animation: `pulseGlow 1.2s ease-in-out ${index * 0.15}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div
                className="rounded-2xl border px-4 py-3 text-sm"
                style={{ borderColor: 'rgba(255,51,102,0.22)', background: 'rgba(255,51,102,0.08)', color: 'var(--accent-danger)' }}
              >
                {error}
              </div>
            ) : null}
          </div>

          <div className="border-t px-6 py-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {stage === 'role_prompt' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleRoleSubmit()
                }}
                className="space-y-3"
              >
                <input
                  value={roleInput}
                  onChange={(event) => {
                    setRoleInput(event.target.value)
                    setError(null)
                  }}
                  placeholder="Type clinician, researcher, or patient"
                  className="w-full rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none"
                  style={{
                    color: 'var(--text-primary)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    caretColor: 'var(--accent-primary)',
                  }}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    SCOUT will personalize tone after this step.
                  </div>
                  <button
                    type="submit"
                    disabled={saving || !roleInput.trim()}
                    className="rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#0A0A0F' }}
                  >
                    {saving ? 'Saving...' : 'Continue'}
                  </button>
                </div>
              </form>
            ) : null}

            {stage === 'guide_choice' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Role locked: <span style={{ color: 'var(--accent-primary)' }}>{getRoleLabel(role)}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleTakeTour}
                    className="rounded-2xl px-4 py-3 text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#0A0A0F' }}
                  >
                    {SCOUT_GUIDE_CHOICE_ACTIONS[0]}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGoToDashboard()}
                    disabled={saving}
                    className="rounded-2xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
                  >
                    {SCOUT_GUIDE_CHOICE_ACTIONS[1]}
                  </button>
                </div>
              </div>
            ) : null}

            {stage === 'finishing' ? (
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent-primary) transparent transparent transparent' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Opening the dashboard...
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}

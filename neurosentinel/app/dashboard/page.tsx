'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AnalysisResults } from './_components/analysis-results'
import { UploadZone, type UploadState } from './_components/upload-zone'
import { getRoleLabel } from '@/lib/scout-guide'
import { ensureUserProfile } from '@/lib/user-profile'
import { getReportHeadline, normalizeReport, normalizeReportStatus, type ReportRecord, type ScoutRole } from '@/lib/neurosentinel/types'

function SignalBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[30px]" aria-hidden="true">
      <div
        className="absolute inset-y-0 right-0 w-[48%] opacity-40"
        style={{
          background:
            'radial-gradient(circle at top right, rgba(0,240,255,0.18), transparent 46%), radial-gradient(circle at bottom right, rgba(255,184,0,0.14), transparent 34%)',
        }}
      />
      <svg className="absolute bottom-0 right-0 h-full w-[58%] opacity-55" viewBox="0 0 600 340" fill="none">
        <path
          d="M12 198C42 198 55 106 85 106C115 106 130 240 160 240C190 240 206 86 236 86C266 86 281 196 311 196C341 196 356 126 386 126C416 126 430 220 460 220C490 220 504 152 534 152C564 152 575 202 596 202"
          stroke="rgba(0,240,255,0.85)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M20 246C62 246 70 192 104 192C138 192 146 266 180 266C214 266 224 170 258 170C292 170 300 218 334 218C368 218 374 188 408 188C442 188 448 240 482 240C516 240 522 210 556 210"
          stroke="rgba(255,184,0,0.55)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {[['F3', 368, 72], ['F4', 426, 92], ['T3', 332, 156], ['T4', 458, 168], ['Pz', 392, 218]].map(([label, x, y]) => (
          <g key={label}>
            <circle cx={Number(x)} cy={Number(y)} r="12" fill="rgba(0,240,255,0.16)" stroke="rgba(0,240,255,0.4)" />
            <text x={Number(x)} y={Number(y) + 4} textAnchor="middle" fontSize="10" fill="rgba(232,232,240,0.92)">
              {label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function statusBadge(status: string) {
  if (status === 'completed') {
    return {
      background: 'rgba(0,255,157,0.12)',
      color: 'var(--accent-success)',
    }
  }

  if (status === 'failed') {
    return {
      background: 'rgba(255,51,102,0.12)',
      color: 'var(--accent-danger)',
    }
  }

  return {
    background: 'rgba(0,240,255,0.12)',
    color: 'var(--accent-primary)',
  }
}

export default function DashboardPage() {
  const supabase = createClient()
  const [latestAnalysis, setLatestAnalysis] = useState<ReportRecord | null>(null)
  const [reportsLoading, setReportsLoading] = useState(true)
  const [role, setRole] = useState<ScoutRole>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadFilename, setUploadFilename] = useState<string | undefined>(undefined)

  // Ref so loadDashboardContext can read uploadState without being in its deps
  const uploadStateRef = useRef<UploadState>('idle')
  useEffect(() => { uploadStateRef.current = uploadState }, [uploadState])

  const loadDashboardContext = useCallback(async () => {
    // Don't overwrite latestAnalysis with stale DB data while an upload is running.
    // The UploadZone drives latestAnalysis directly via onAnalysisComplete during uploads.
    if (uploadStateRef.current === 'uploading' || uploadStateRef.current === 'processing') return

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setReportsLoading(false)
        return
      }

      setUserId(user.id)
      const profile = await ensureUserProfile(supabase, user)
      setRole(profile.role)

      const { data, error } = await supabase
        .from('reports')
        .select('id, user_id, filename, status, summary, result_label, event_count, confidence_score, risk_level, quality_grade, duration_minutes, report_json, created_at, error_message')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error
      setLatestAnalysis(Array.isArray(data) && data[0] ? normalizeReport(data[0]) : null)
    } catch (loadError) {
      console.error('[Dashboard] Failed to load dashboard context:', loadError)
    } finally {
      setReportsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadDashboardContext()
  }, [loadDashboardContext])

  useEffect(() => {
    const status = normalizeReportStatus(latestAnalysis?.status)
    // Only poll the DB when a report is still pending/processing AND no active XHR upload
    // is managing latestAnalysis itself (UploadZone handles that path via onAnalysisComplete).
    if (status !== 'pending' && status !== 'processing') return
    if (uploadStateRef.current === 'uploading' || uploadStateRef.current === 'processing') return

    const interval = window.setInterval(() => {
      void loadDashboardContext()
    }, 5000)

    return () => window.clearInterval(interval)
  }, [latestAnalysis, loadDashboardContext])

  const latestStatus = normalizeReportStatus(latestAnalysis?.status)

  return (
    <>
      <header
        className="flex shrink-0 items-center justify-between border-b px-6 py-3"
        style={{
          background: 'rgba(10,10,15,0.9)',
          backdropFilter: 'blur(16px)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-[11px] font-mono tracking-widest transition-colors hover:text-[#00F0FF]" style={{ color: '#8888A0' }}>NeuroSentinel AI</Link>
          <span style={{ color: 'var(--border-default)' }}>/</span>
          <span className="text-sm font-medium text-[#E8E8F0]" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Command Centre
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#00F0FF', boxShadow: '0 0 8px rgba(0,240,255,0.65)' }} />
          <span className="text-[11px] font-mono tracking-widest text-[#8888A0]">{getRoleLabel(role)}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6" style={{ animation: 'fadeInUp 0.55s ease forwards' }}>
        <div className="space-y-6">
          <section
            className="relative overflow-hidden rounded-[30px] border px-6 py-7"
            style={{ background: 'linear-gradient(180deg, rgba(16,18,26,0.95), rgba(11,13,18,0.96))', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <SignalBackdrop />

            <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
              <div>
                <div className="text-xs font-medium tracking-widest text-[#8888A0]">Clinical EEG Intelligence</div>
                <h1 className="mt-3 max-w-4xl text-3xl font-bold leading-tight md:text-4xl" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                  Upload your EEG.
                  <br />
                  Detect seizures.
                  <br />
                  <span style={{ color: 'var(--accent-primary)' }}>Understand every finding.</span>
                </h1>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#8888A0]">
                  NeuroSentinel AI analyses your EEG file, detects seizure events, maps brain activity, and generates a structured clinical report — then SCOUT walks you through every result in plain language.
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  { label: 'Current role', value: getRoleLabel(role) },
                  { label: 'Latest status', value:
                    uploadState === 'uploading' ? `Uploading${uploadFilename ? ` — ${uploadFilename}` : ''}...`
                    : uploadState === 'processing' ? `Analysing${uploadFilename ? ` — ${uploadFilename}` : ''}...`
                    : latestAnalysis ? getReportHeadline(latestAnalysis)
                    : 'Awaiting upload'
                  },
                ].map((item) => {
                  const isActive = item.label === 'Latest status' && (uploadState === 'uploading' || uploadState === 'processing')
                  return (
                    <div key={item.label} className="rounded-2xl border px-4 py-3" style={{ borderColor: isActive ? 'rgba(0,240,255,0.28)' : 'rgba(0,240,255,0.16)', background: isActive ? 'rgba(0,240,255,0.04)' : 'rgba(255,255,255,0.03)' }}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#8888A0' }}>
                        {item.label}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm font-semibold" style={{ color: isActive ? 'var(--accent-primary)' : '#E8E8F0', fontFamily: "'Outfit', sans-serif" }}>
                        {isActive ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: 'var(--accent-primary)', boxShadow: '0 0 8px rgba(0,240,255,0.5)' }} /> : null}
                        {item.value}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <section className="rounded-[30px] border px-5 py-5" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="mb-4">
                <div className="text-xs font-medium tracking-widest text-[#8888A0]">Upload EEG</div>
                <p className="mt-1 text-sm text-[#8888A0]">Start a new asynchronous analysis and let SCOUT track the result as it completes.</p>
              </div>

              <UploadZone
                onAnalysisComplete={(data) => {
                  setLatestAnalysis(data)
                }}
                onReset={() => setLatestAnalysis(null)}
                onUploadStateChange={(s, fn) => {
                  setUploadState(s)
                  setUploadFilename(fn)
                }}
                shouldAutoRedirect
              />
            </section>

            <section className="rounded-[30px] border px-5 py-5" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium tracking-widest text-[#8888A0]">Latest Analysis</div>
                  <p className="mt-1 text-sm text-[#8888A0]">
                    {(uploadState === 'uploading' || uploadState === 'processing') ? 'Current upload in progress' : 'Your most recent EEG analysis'}
                  </p>
                </div>
                {(uploadState === 'uploading' || uploadState === 'processing') ? (
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide" style={statusBadge('processing')}>
                    {uploadState === 'uploading' ? 'uploading' : 'analysing'}
                  </span>
                ) : latestAnalysis ? (
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide" style={statusBadge(latestStatus)}>
                    {latestStatus}
                  </span>
                ) : null}
              </div>

              <AnalysisResults data={latestAnalysis} uploadState={uploadState} uploadFilename={uploadFilename} />

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/dashboard/eeg-reports" className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]" style={{ borderColor: 'rgba(0,240,255,0.16)', color: 'var(--accent-primary)' }}>
                  Open Analysis History
                </Link>
              </div>
            </section>
          </div>

          {reportsLoading ? (
            <div className="rounded-[30px] border px-5 py-5 text-sm text-[#8888A0]" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
              Loading your latest analysis...
            </div>
          ) : userId ? null : (
            <div className="rounded-[30px] border px-5 py-5 text-sm text-[#8888A0]" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
              Sign in to upload EEG files and track your analysis workflow.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

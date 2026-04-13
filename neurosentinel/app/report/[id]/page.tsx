'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScoutPanel } from '@/app/components/scout-panel'
import { getReportExplainerOpening, type ScoutRole } from '@/lib/scout-guide'
import { ensureUserProfile } from '@/lib/user-profile'
import { formatConfidence, formatDurationMinutes, normalizeReport, normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'

import { ProbabilityTimeline } from '../_components/probability-timeline'
import { EventCards } from '../_components/event-cards'
import { BrainHeatmap } from '../_components/brain-heatmap'
import { BandPowerChart } from '../_components/band-power-chart'
import { DataQualityPanel } from '../_components/data-quality-panel'
import { ClinicalMetrics } from '../_components/clinical-metrics'

/* ─── Helpers ─── */
function statusChip(status: string) {
  if (status === 'completed') return { background: 'rgba(0,255,157,0.08)', color: 'var(--accent-success)' }
  if (status === 'failed') return { background: 'rgba(255,51,102,0.08)', color: 'var(--accent-danger)' }
  return { background: 'rgba(0,240,255,0.08)', color: 'var(--accent-primary)' }
}

function buildReportAutoPrompt(role: ScoutRole, filename?: string | null) {
  const subject = filename ? `"${filename}"` : 'this report'
  return `Summarize ${subject} for me in detail.`
}

/* ─── Page ─── */
export default function ReportPage() {
  const params = useParams()
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id
  const supabase = createClient()
  const [report, setReport] = useState<ReportRecord | null>(null)
  const [role, setRole] = useState<ScoutRole>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ─ Load report ─ */
  useEffect(() => {
    async function loadReport() {
      setLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const profile = await ensureUserProfile(supabase, user)
          setRole(profile.role)
        }
        const { data, error: reportError } = await supabase
          .from('reports')
          .select('id, user_id, filename, status, storage_path, error_message, summary, result_label, event_count, confidence_score, risk_level, quality_grade, duration_minutes, report_json, created_at')
          .eq('user_id', user?.id)
          .eq('id', reportId)
          .maybeSingle()
        if (reportError) throw reportError
        if (!data) throw new Error('Report not found.')
        setReport(normalizeReport(data))
      } catch (loadError: any) {
        console.error('[Report] Failed to load report:', loadError)
        setError(loadError.message || 'Unable to load this report right now.')
      } finally {
        setLoading(false)
      }
    }
    if (reportId) void loadReport()
  }, [reportId, supabase])

  /* ─ Poll for status updates ─ */
  useEffect(() => {
    if (!report) return
    const status = normalizeReportStatus(report.status)
    if (status !== 'pending' && status !== 'processing') return
    const interval = window.setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('id, user_id, filename, status, storage_path, error_message, summary, result_label, confidence_score, risk_level, quality_grade, duration_minutes, report_json, created_at, event_count')
          .eq('user_id', report.user_id)
          .eq('id', report.id)
          .maybeSingle()
        if (error) throw error
        if (data) setReport(normalizeReport(data))
      } catch (error) {
        console.error('[Report] Polling error:', error)
      }
    }, 5000)
    return () => window.clearInterval(interval)
  }, [report, supabase])

  /* ─ Auto-trigger SCOUT summary ─ */

  /* ─ SCOUT context ─ */
  const scoutInitialMessage = useMemo(() => {
    return getReportExplainerOpening(role, {
      fileName: report?.filename,
      result: report?.result_label || undefined,
      confidence: report?.confidence_score ?? undefined,
      summary: report?.summary || undefined,
      status: report?.status,
      riskLevel: report?.risk_level || undefined,
      eventCount: report?.event_count ?? report?.report_json?.events?.length ?? 0,
      createdAt: report?.created_at,
      recordingDuration: report?.duration_minutes ? `${report.duration_minutes.toFixed(1)} min` : undefined,
    })
  }, [report, role])

  const scoutAutoPrompt = useMemo(() => {
    if (!report || normalizeReportStatus(report.status) !== 'completed') return null
    return {
      content: buildReportAutoPrompt(role, report.filename),
      visible: false,
    }
  }, [report, role])

  /* ─ Derived data from report_json ─ */
  const reportJson = report?.report_json
  const status = normalizeReportStatus(report?.status)
  const recommendations = Array.isArray(reportJson?.clinical_report?.recommendations) ? reportJson.clinical_report.recommendations : []
  const topRegions = Array.isArray(reportJson?.top_regions) ? reportJson.top_regions : []
  const topChannels = Array.isArray(reportJson?.explainability?.top_channels) ? reportJson.explainability.top_channels : []
  const events = useMemo(() => Array.isArray(reportJson?.events) ? reportJson.events : [], [reportJson])
  const quality: any = reportJson?.quality || reportJson?.signal_quality || {}
  const modelOutputs: any = reportJson?.model_outputs || {}
  const metadata: any = reportJson?.metadata || {}
  const clinicalReport = reportJson?.clinical_report || {}
  const executiveSummary = reportJson?.executive_summary || clinicalReport?.executive_summary || report?.summary || ''
  const earlyWarning = reportJson?.early_warning ?? false
  const seFlag = reportJson?.se_flag ?? false
  const trendSummary = reportJson?.trend_summary || ''
  const probabilityTimeline = modelOutputs?.probability_timeline
  const missingChannels = Array.isArray(quality?.missing_channels) ? quality.missing_channels : (Array.isArray(reportJson?.missing_channels) ? reportJson.missing_channels : [])

  // Compute background band powers (average across events or from quality)
  const backgroundBandPowers = useMemo((): Record<string, number> | undefined => {
    // Try to get from report-level
    if (reportJson?.background_band_powers) return reportJson.background_band_powers as Record<string, number>
    // Average from events
    if (events.length > 0) {
      const acc: Record<string, number[]> = {}
      for (const e of events) {
        const bp = e.band_powers || {}
        for (const [band, val] of Object.entries(bp)) {
          if (!acc[band]) acc[band] = []
          acc[band].push(val as number)
        }
      }
      const avg: Record<string, number> = {}
      for (const [band, vals] of Object.entries(acc)) {
        avg[band] = vals.reduce((a, b) => a + b, 0) / vals.length
      }
      return Object.keys(avg).length ? avg : undefined
    }
    return undefined
  }, [reportJson, events])

  const riskColor = (() => {
    const r = (report?.risk_level || '').toLowerCase()
    if (r === 'high' || r === 'critical') return '#FF3366'
    if (r === 'moderate' || r === 'medium') return '#FFB800'
    if (r === 'low') return '#00FF9D'
    return '#8888A0'
  })()

  const createdDate = report?.created_at ? new Date(report.created_at) : null

  // Top-line stats for header
  const meanEventDuration = events.length > 0
    ? events.reduce((a: number, e: any) => a + (e.duration_sec || 0), 0) / events.length
    : 0


  /* ═══════════════════════════════════════════════════════════════ */
  /*  RENDER                                                        */
  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-dvh" style={{ background: '#0A0A0F' }}>

      {/* ════════════════════════ HEADER ════════════════════════ */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b px-6 py-3" style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-[11px] font-mono uppercase tracking-widest transition-colors hover:text-[#00F0FF]" style={{ color: 'var(--text-muted)' }}>NeuroSentinel AI</Link>
          <span style={{ color: 'rgba(255,255,255,0.12)' }}>/</span>
          <Link href="/dashboard" className="text-[11px] font-mono uppercase tracking-widest transition-colors hover:text-[#00F0FF]" style={{ color: 'var(--text-muted)' }}>Dashboard</Link>
          <span style={{ color: 'rgba(255,255,255,0.12)' }}>/</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>Clinical Report</span>
        </div>
        <div className="flex items-center gap-3">
          {report ? (
            <a href={`/api/reports/${report.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all hover:bg-[rgba(255,184,0,0.08)]" style={{ borderColor: 'rgba(255,184,0,0.2)', color: '#FFB800' }}>↓ Download PDF</a>
          ) : null}
          <Link href="/dashboard/eeg-reports" className="rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all hover:bg-[rgba(0,240,255,0.06)]" style={{ borderColor: 'rgba(0,240,255,0.16)', color: '#00F0FF' }}>All Reports</Link>
        </div>
      </header>

      <div className="p-6">
        {/* ════════════════════════ LOADING ════════════════════════ */}
        {loading ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#00F0FF transparent transparent transparent' }} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading clinical report...</span>
            </div>
          </div>

        /* ════════════════════════ ERROR ════════════════════════ */
        ) : error || !report ? (
          <div className="mx-auto max-w-2xl rounded-[30px] border px-6 py-10 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#12121A' }}>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>Report unavailable</h1>
            <p className="mt-3 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>{error || 'The requested report could not be loaded.'}</p>
            <Link href="/dashboard/eeg-reports" className="mt-6 inline-flex rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #00F0FF, #818CF8)', color: '#0A0A0F' }}>Back to reports</Link>
          </div>

        /* ════════════════════════ REPORT BODY ════════════════════════ */
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">

              {/* ─── § 1  SUMMARY BANNER ─── */}
              <section className="overflow-hidden rounded-[28px] border" style={{ background: 'linear-gradient(180deg, rgba(18,18,26,0.95), rgba(12,12,18,0.97))', borderColor: 'rgba(255,255,255,0.06)', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                <div className="p-6 pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ background: riskColor, boxShadow: `0 0 14px ${riskColor}60` }} />
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: riskColor }}>
                          {report.risk_level || 'Unknown'} Risk — {report.result_label || 'Pending'}
                        </div>
                      </div>
                      <h1 className="mt-3 text-2xl font-semibold leading-tight" style={{ color: '#E8E8F0', fontFamily: "'Outfit', sans-serif" }}>EEG Analysis Report</h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: '#565670' }}>
                        <span>📄 {report.filename}</span>
                        {createdDate ? <span>📅 {createdDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} at {createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span> : null}
                        <span>🆔 {report.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={statusChip(status)}>{status}</span>
                  </div>
                </div>

                {/* Top-line stats bar */}
                <div className="mt-5 grid grid-cols-2 border-t sm:grid-cols-4 lg:grid-cols-6" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {[
                    { label: 'Seizures', value: `${report.event_count ?? events.length ?? 0}`, color: events.length > 0 ? '#FF3366' : '#00FF88', icon: '⚡' },
                    { label: 'Confidence', value: formatConfidence(report.confidence_score), color: '#00F0FF', icon: '📊' },
                    { label: 'Mean Duration', value: events.length > 0 ? `${meanEventDuration.toFixed(1)}s` : '—', color: '#E8E8F0', icon: '⏱️' },
                    { label: 'Quality', value: report.quality_grade || 'Unknown', color: report.quality_grade?.toLowerCase() === 'good' ? '#00FF88' : '#FFB800', icon: '📶' },
                    { label: 'Risk', value: report.risk_level || 'Unknown', color: riskColor, icon: '🛡️' },
                    { label: 'Duration', value: formatDurationMinutes(report.duration_minutes), color: '#8888A0', icon: '🧠' },
                  ].map((item, idx) => (
                    <div key={item.label} className="border-r px-4 py-3.5 transition-colors hover:bg-[rgba(255,255,255,0.015)]" style={{ borderColor: 'rgba(255,255,255,0.04)', borderRight: idx === 5 ? 'none' : undefined }}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{item.icon}</span>
                        <span className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: '#565670' }}>{item.label}</span>
                      </div>
                      <div className="mt-1 text-base font-bold" style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </section>

              {status === 'completed' ? (
                <>
                  {/* ─── § 2  EXECUTIVE SUMMARY ─── */}
                  {executiveSummary ? (
                    <section className="rounded-[28px] border p-6" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: '#00F0FF' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#00F0FF' }}>Executive Summary</div>
                      </div>
                      <p className="mt-4 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>{executiveSummary}</p>
                      {trendSummary ? (
                        <div className="mt-3 rounded-xl border px-4 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: '#565670' }}>Trend: </span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{trendSummary}</span>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {/* ─── CLINICAL ALERTS ─── */}
                  {(earlyWarning || seFlag) ? (
                    <section className="grid gap-3 md:grid-cols-2">
                      {seFlag ? (
                        <div className="rounded-[28px] border p-5" style={{ borderColor: 'rgba(255,51,102,0.25)', background: 'rgba(255,51,102,0.06)', boxShadow: '0 0 20px rgba(255,51,102,0.08)' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">🚨</span>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#FF3366' }}>Status Epilepticus Flag <span className="text-[8px] font-normal opacity-50">[HEURISTIC]</span></div>
                          </div>
                          <p className="mt-2 text-xs leading-5" style={{ color: '#FF3366' }}>Continuous or rapidly recurring seizure activity detected. Immediate neurologist review required.</p>
                        </div>
                      ) : null}
                      {earlyWarning ? (
                        <div className="rounded-[28px] border p-5" style={{ borderColor: 'rgba(255,184,0,0.25)', background: 'rgba(255,184,0,0.06)' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">⚠️</span>
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#FFB800' }}>Early Warning Signal</div>
                          </div>
                          <p className="mt-2 text-xs leading-5" style={{ color: '#FFB800' }}>Pre-ictal activity detected in this recording. Monitor patient closely.</p>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {/* ─── § 2  PROBABILITY TIMELINE ─── */}
                  <section className="rounded-[28px] border p-6" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-5 rounded-full" style={{ background: '#00F0FF' }} />
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#00F0FF' }}>EEG Probability Timeline</div>
                    </div>
                    <div className="mt-4">
                      <ProbabilityTimeline
                        probabilityTimeline={probabilityTimeline}
                        events={events}
                        thresholdHigh={modelOutputs?.threshold_high}
                        thresholdLow={modelOutputs?.threshold_low}
                      />
                    </div>
                  </section>

                  {/* ─── § 3  SEIZURE EVENT CARDS ─── */}
                  <section className="rounded-[28px] border p-6" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-5 rounded-full" style={{ background: events.length > 0 ? '#FF3366' : '#00FF88' }} />
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: events.length > 0 ? '#FF3366' : '#00FF88' }}>
                        Seizure Events — {events.length > 0 ? `${events.length} Detected` : 'None Detected'}
                      </div>
                    </div>
                    <div className="mt-4">
                      <EventCards events={events} />
                    </div>
                  </section>

                  {/* ─── § 4  BRAIN HEATMAP + CHANNEL IMPORTANCE ─── */}
                  <section className="grid gap-4 md:grid-cols-2">
                    {/* Brain Heatmap */}
                    <div className="rounded-[28px] border p-5" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: '#A78BFA' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#A78BFA' }}>Brain Region Heatmap</div>
                      </div>
                      <div className="mt-4">
                        <BrainHeatmap topChannels={topChannels} />
                      </div>
                    </div>

                    {/* Channel Importance Bars */}
                    <div className="rounded-[28px] border p-5" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: 'var(--accent-secondary, #818CF8)' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#818CF8' }}>Channel Importance</div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {topChannels.length > 0 ? topChannels.slice(0, 10).map(([channel, score]: [string, number]) => (
                          <div key={channel} className="flex items-center gap-3">
                            <span className="w-20 shrink-0 text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>{channel}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: '#1A1A28' }}>
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, score * 100)}%`, background: 'linear-gradient(90deg, #818CF8, #00F0FF)' }} />
                            </div>
                            <span className="w-12 shrink-0 text-right text-[10px] font-mono" style={{ color: '#565670' }}>{score.toFixed(3)}</span>
                          </div>
                        )) : <div className="text-xs" style={{ color: '#565670' }}>Channel importance data unavailable.</div>}
                      </div>
                      {/* Top regions list */}
                      {topRegions.length > 0 ? (
                        <div className="mt-4 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          <div className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: '#565670' }}>Top Brain Regions</div>
                          <div className="mt-2 space-y-1.5">
                            {topRegions.slice(0, 6).map(([region, score]: [string, number]) => (
                              <div key={region} className="flex items-center gap-3">
                                <span className="w-24 shrink-0 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{region}</span>
                                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: '#1A1A28' }}>
                                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, score * 100)}%`, background: 'linear-gradient(90deg, #A78BFA, #818CF8)' }} />
                                </div>
                                <span className="w-12 shrink-0 text-right text-[10px] font-mono" style={{ color: '#565670' }}>{score.toFixed(3)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  {/* ─── § 5  BAND POWER + DATA QUALITY ─── */}
                  <section className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[28px] border p-5" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: '#FFB800' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#FFB800' }}>Band Power & Channels</div>
                      </div>
                      <div className="mt-4">
                        <BandPowerChart
                          bandPowers={backgroundBandPowers}
                          missingChannels={missingChannels}
                          artifactPercent={quality.artifact_frac}
                        />
                      </div>
                    </div>

                    <div className="rounded-[28px] border p-5" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: '#00F0FF' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#00F0FF' }}>Signal Quality</div>
                      </div>
                      <div className="mt-4">
                        <DataQualityPanel
                          qualityScore={quality.mean_quality_score ?? quality.quality_score}
                          qualityGrade={report.quality_grade || quality.grade}
                          snrDb={quality.snr_db}
                          flatlineFrac={quality.flatline_frac}
                          artifactPercent={quality.artifact_frac}
                          missingChannels={missingChannels}
                        />
                      </div>
                    </div>
                  </section>

                  {/* ─── § 7  CLINICAL METRICS ─── */}
                  <section className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[28px] border p-5" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: '#00FF88' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#00FF88' }}>Detection Metrics</div>
                      </div>
                      <div className="mt-4">
                        <ClinicalMetrics role={role} report={report} reportJson={reportJson} events={events} />
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className="rounded-[28px] border p-5" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-5 rounded-full" style={{ background: '#FFB800' }} />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#FFB800' }}>Clinical Recommendations</div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {recommendations.length > 0 ? recommendations.map((item: string, idx: number) => (
                          <div key={item} className="flex gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'rgba(255,184,0,0.1)', background: 'rgba(255,184,0,0.03)' }}>
                            <span className="shrink-0 text-sm font-bold" style={{ color: '#FFB800', fontFamily: "'Outfit', sans-serif" }}>{idx + 1}.</span>
                            <span className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                          </div>
                        )) : (
                          <div className="rounded-xl border px-4 py-3 text-xs" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: '#565670' }}>
                            Recommendations will appear once the clinical report has been generated.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* ─── § 8  POST-ICTAL + SPREAD PATTERN ─── */}
                  {(reportJson?.post_ictal_detected || reportJson?.seizure_spread_pattern) ? (
                    <section className="grid gap-4 md:grid-cols-2">
                      {reportJson.post_ictal_detected ? (
                        <div className="rounded-[28px] border p-5" style={{ borderColor: 'rgba(167,139,250,0.15)', background: 'rgba(167,139,250,0.04)' }}>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-5 rounded-full" style={{ background: '#A78BFA' }} />
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#A78BFA' }}>Post-Ictal Detection <span className="text-[8px] font-normal opacity-50">[HEURISTIC]</span></div>
                          </div>
                          <p className="mt-3 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>Amplitude suppression detected in the 60s post-offset window, consistent with post-ictal state.</p>
                        </div>
                      ) : null}
                      {Array.isArray(reportJson.seizure_spread_pattern) && reportJson.seizure_spread_pattern.length > 0 ? (
                        <div className="rounded-[28px] border p-5" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(18,18,26,0.7)' }}>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-5 rounded-full" style={{ background: '#818CF8' }} />
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#818CF8' }}>Seizure Spread Pattern <span className="text-[8px] font-normal opacity-50">[HEURISTIC]</span></div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {(reportJson.seizure_spread_pattern as string[]).map((ch: string, i: number, arr: string[]) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="rounded-lg border px-2 py-1 text-[10px] font-mono font-semibold" style={{ borderColor: 'rgba(129,140,248,0.2)', background: 'rgba(129,140,248,0.06)', color: '#818CF8' }}>{ch}</span>
                                {i < arr.length - 1 ? <span className="text-[10px]" style={{ color: '#565670' }}>→</span> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {/* ─── PIPELINE METADATA ─── */}
                  <section className="rounded-[28px] border p-5" style={{ background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.2em]" style={{ color: '#565670' }}>Pipeline & Model Metadata</div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-mono" style={{ color: '#4A4A60' }}>
                      {metadata.sampling_rate_original ? <span>Original FS: {metadata.sampling_rate_original} Hz</span> : null}
                      {metadata.sampling_rate_processed ? <span>Processed FS: {metadata.sampling_rate_processed} Hz</span> : null}
                      {metadata.montage_type ? <span>Montage: {metadata.montage_type}</span> : null}
                      {metadata.n_input_channels ? <span>Input Ch: {metadata.n_input_channels}</span> : null}
                      {metadata.n_mapped ? <span>Mapped: {metadata.n_mapped}/22</span> : null}
                      {metadata.n_windows ? <span>Windows: {metadata.n_windows}</span> : null}
                      {metadata.powerline_hz ? <span>Powerline: {metadata.powerline_hz} Hz</span> : null}
                      {metadata.inference_mode ? <span>Inference: {metadata.inference_mode}</span> : null}
                      <span>Model: NeuroSentinel V4 MultiRepEEG</span>
                    </div>
                    <div className="mt-2 text-[9px]" style={{ color: 'rgba(74,74,96,0.6)' }}>
                      ⚠️ This report is generated by an AI model. It is intended for research and clinical decision support only. It does not constitute a medical diagnosis. All [HEURISTIC] and [ESTIMATED] labels indicate rule-based estimates, not ground truth. Neurologist review required.
                    </div>
                  </section>
                </>
              ) : (
                /* ─── IN PROGRESS / FAILED ─── */
                <section className="rounded-[28px] border p-6" style={{ background: 'rgba(18,18,26,0.7)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-5 rounded-full" style={{ background: status === 'failed' ? '#FF3366' : '#00F0FF' }} />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: status === 'failed' ? '#FF3366' : '#00F0FF' }}>
                      {status === 'failed' ? 'Analysis Failed' : 'Analysis In Progress'}
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                    {status === 'failed' ? report.error_message || 'The backend could not complete analysis for this report.' : 'This report page will auto-refresh as the backend processes your EEG recording through the pipeline.'}
                  </p>
                  {status !== 'failed' ? (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#00F0FF transparent transparent transparent' }} />
                      <span className="text-xs" style={{ color: '#565670' }}>Polling for updates every 5 seconds...</span>
                    </div>
                  ) : null}
                </section>
              )}
            </div>

            {/* ─── § 9  SCOUT PANEL ─── */}
            <div className="lg:sticky lg:top-[60px] lg:self-start" style={{ maxHeight: 'calc(100dvh - 76px)' }}>
              <ScoutPanel page="report" role={role} collapsible width={320} initialMessage={scoutInitialMessage} report={report} autoPrompt={scoutAutoPrompt} resizable />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

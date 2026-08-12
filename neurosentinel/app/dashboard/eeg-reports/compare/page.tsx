'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { normalizeReport, normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'

/* ── Helpers ── */
function normalizeConf(val: number | null | undefined): number | null {
  if (val == null) return null
  return val <= 1 && val > 0 ? val * 100 : val
}
function fmtConf(val: number | null | undefined): string {
  const n = normalizeConf(val)
  return n == null ? '—' : `${n.toFixed(1)}%`
}
function fmtDuration(val: number | null | undefined): string {
  return val == null ? '—' : `${val.toFixed(1)} min`
}
function fmtDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

/* ── Metric rows ── */
type MetricRow = { label: string; a: string; b: string; change: string }

function buildMetrics(a: ReportRecord, b: ReportRecord): MetricRow[] {
  const rows: MetricRow[] = []

  // Result
  rows.push({
    label: 'Result',
    a: a.result_label || '—',
    b: b.result_label || '—',
    change: (a.result_label || '').toLowerCase() !== (b.result_label || '').toLowerCase() ? 'Changed' : 'Unchanged',
  })

  // Risk level
  if (a.risk_level || b.risk_level) {
    rows.push({
      label: 'Risk Level',
      a: a.risk_level || '—',
      b: b.risk_level || '—',
      change: (a.risk_level || '').toLowerCase() !== (b.risk_level || '').toLowerCase() ? 'Changed' : 'Unchanged',
    })
  }

  // Confidence
  const aC = normalizeConf(a.confidence_score)
  const bC = normalizeConf(b.confidence_score)
  const confDiff = aC != null && bC != null ? bC - aC : null
  rows.push({
    label: 'Confidence',
    a: fmtConf(a.confidence_score),
    b: fmtConf(b.confidence_score),
    change: confDiff == null ? '—'
      : Math.abs(confDiff) < 0.5 ? 'Unchanged'
      : `${confDiff > 0 ? '+' : ''}${confDiff.toFixed(1)} pp`,
  })

  // Events
  const aEv = a.event_count ?? null
  const bEv = b.event_count ?? null
  const evDiff = aEv != null && bEv != null ? bEv - aEv : null
  rows.push({
    label: 'Events Detected',
    a: aEv != null ? String(aEv) : '—',
    b: bEv != null ? String(bEv) : '—',
    change: evDiff == null ? '—' : evDiff === 0 ? 'Unchanged' : `${evDiff > 0 ? '+' : ''}${evDiff}`,
  })

  // Duration
  const aDur = a.duration_minutes ?? null
  const bDur = b.duration_minutes ?? null
  const durDiff = aDur != null && bDur != null ? bDur - aDur : null
  rows.push({
    label: 'Recording Duration',
    a: fmtDuration(aDur),
    b: fmtDuration(bDur),
    change: durDiff == null ? '—'
      : Math.abs(durDiff) < 0.5 ? 'Unchanged'
      : `${durDiff > 0 ? '+' : ''}${durDiff.toFixed(1)} min`,
  })

  // Quality grade
  if (a.quality_grade || b.quality_grade) {
    rows.push({
      label: 'Quality Grade',
      a: a.quality_grade || '—',
      b: b.quality_grade || '—',
      change: a.quality_grade !== b.quality_grade ? 'Changed' : 'Unchanged',
    })
  }

  // Status
  rows.push({
    label: 'Analysis Status',
    a: a.status.charAt(0).toUpperCase() + a.status.slice(1),
    b: b.status.charAt(0).toUpperCase() + b.status.slice(1),
    change: a.status === b.status ? 'Unchanged' : 'Changed',
  })

  return rows
}

/* ── SCOUT neutral summary (client-side only, no API) ── */
function buildScoutSummary(a: ReportRecord, b: ReportRecord): string[] {
  const diffs: string[] = []

  // Result
  if (a.result_label && b.result_label && a.result_label.toLowerCase() !== b.result_label.toLowerCase()) {
    diffs.push(`Result changed from "${a.result_label}" in Report A to "${b.result_label}" in Report B.`)
  }

  // Events
  const aEv = a.event_count ?? null
  const bEv = b.event_count ?? null
  if (aEv != null && bEv != null) {
    if (aEv === bEv) {
      diffs.push(`Detected event count is the same in both reports (${aEv} event${aEv !== 1 ? 's' : ''}).`)
    } else {
      const diff = bEv - aEv
      diffs.push(`Detected events ${diff > 0 ? 'increased' : 'decreased'} from ${aEv} to ${bEv} (${diff > 0 ? '+' : ''}${diff}).`)
    }
  }

  // Confidence
  const aC = normalizeConf(a.confidence_score)
  const bC = normalizeConf(b.confidence_score)
  if (aC != null && bC != null) {
    const diff = bC - aC
    if (Math.abs(diff) >= 0.5) {
      diffs.push(`Model confidence ${diff > 0 ? 'increased' : 'decreased'} from ${aC.toFixed(1)}% to ${bC.toFixed(1)}% (${diff > 0 ? '+' : ''}${diff.toFixed(1)} percentage points).`)
    } else {
      diffs.push(`Model confidence is similar across both reports (${aC.toFixed(1)}% vs ${bC.toFixed(1)}%).`)
    }
  }

  // Duration
  const aDur = a.duration_minutes ?? null
  const bDur = b.duration_minutes ?? null
  if (aDur != null && bDur != null) {
    const diff = bDur - aDur
    if (Math.abs(diff) >= 0.5) {
      diffs.push(`Recording duration ${diff > 0 ? 'increased' : 'decreased'} from ${aDur.toFixed(1)} min to ${bDur.toFixed(1)} min.`)
    }
  }

  // Risk
  if (a.risk_level && b.risk_level && a.risk_level.toLowerCase() !== b.risk_level.toLowerCase()) {
    diffs.push(`Risk level changed from ${a.risk_level} in Report A to ${b.risk_level} in Report B.`)
  }

  // Quality
  if (a.quality_grade && b.quality_grade && a.quality_grade !== b.quality_grade) {
    diffs.push(`Signal quality grade changed from ${a.quality_grade} to ${b.quality_grade}.`)
  }

  if (diffs.length === 0) {
    diffs.push('No significant differences were identified between the two reports based on available metrics.')
  }

  return diffs
}

/* ── Report summary card ── */
function ReportSummaryCard({ report, label }: { report: ReportRecord; label: 'A' | 'B' }) {
  const status = normalizeReportStatus(report.status)
  const isSeizure = (report.event_count ?? 0) > 0 && status === 'completed'
  const isFailed = status === 'failed'

  let stripeColor = 'var(--accent-primary)'
  if (isFailed) stripeColor = 'var(--accent-danger)'
  else if (isSeizure) stripeColor = 'var(--accent-warning)'
  else if (status === 'completed') stripeColor = 'var(--accent-success)'

  const resultColor = isFailed || isSeizure ? 'var(--accent-danger)' : 'var(--text-heading)'

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: stripeColor, opacity: 0.7 }} />

      {/* Report label badge */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--accent-primary-light)',
          border: '1px solid rgba(16,185,129,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--accent-primary)',
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </div>

      <div style={{ padding: '24px 28px 24px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filename + date */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {report.filename || 'Unnamed EEG File'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', marginLeft: 42 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            {fmtDate(report.created_at)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.04em', marginLeft: 42, marginTop: 3 }}>
            #{report.id.slice(0, 8).toUpperCase()}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        {/* Key result */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', marginBottom: 6 }}>Key Result</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: resultColor, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            {isFailed ? 'Analysis failed' : isSeizure ? `Seizure detected — ${report.event_count} event${(report.event_count ?? 0) > 1 ? 's' : ''}` : report.result_label || 'No activity detected'}
          </div>
        </div>

        {/* Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Confidence', value: fmtConf(report.confidence_score) },
            { label: 'Duration', value: fmtDuration(report.duration_minutes) },
            { label: 'Risk Level', value: report.risk_level || '—' },
            { label: 'Quality', value: report.quality_grade || '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Change pill ── */
function ChangePill({ value }: { value: string }) {
  const isUnchanged = value === 'Unchanged'
  const isDash = value === '—'
  const isChanged = value === 'Changed'

  const bg = isUnchanged || isDash ? 'var(--bg-inset)' : isChanged ? 'rgba(37,99,235,0.07)' : 'rgba(16,185,129,0.08)'
  const color = isUnchanged || isDash ? 'var(--text-faint)' : isChanged ? 'var(--accent-info)' : 'var(--accent-primary)'
  const border = isUnchanged || isDash ? 'var(--border-subtle)' : isChanged ? 'rgba(37,99,235,0.2)' : 'rgba(16,185,129,0.25)'

  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
      {value}
    </span>
  )
}

/* ── Main page ── */
export default function ComparePage() {
  const searchParams = useSearchParams()
  const aId = searchParams.get('a')
  const bId = searchParams.get('b')

  const [reportA, setReportA] = useState<ReportRecord | null>(null)
  const [reportB, setReportB] = useState<ReportRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!aId || !bId) {
      setError('Invalid comparison URL. Please select two reports from Analysis History.')
      setLoading(false)
      return
    }

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setError('Not authenticated.'); setLoading(false); return }

        const { data, error: dbError } = await supabase
          .from('reports')
          .select('id, user_id, filename, status, summary, result_label, event_count, confidence_score, quality_grade, risk_level, duration_minutes, created_at, error_message')
          .eq('user_id', user.id)
          .in('id', [aId, bId])

        if (dbError) throw dbError
        if (!data || data.length < 2) { setError('One or both reports could not be found.'); setLoading(false); return }

        const records = data.map(normalizeReport)
        setReportA(records.find(r => r.id === aId) ?? records[0])
        setReportB(records.find(r => r.id === bId) ?? records[1])
      } catch (e: any) {
        setError(e.message || 'Failed to load reports.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [aId, bId, supabase])

  /* ── Loading ── */
  if (loading) {
    return (
      <>
        <header className="clinical-header">
          <Link href="/dashboard/eeg-reports" className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
            ← Back to Analysis History
          </Link>
        </header>
        <div className="clinical-page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div className="clinical-spinner-sm" style={{ width: 28, height: 28, borderWidth: 3 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Loading reports…</span>
          </div>
        </div>
      </>
    )
  }

  /* ── Error ── */
  if (error || !reportA || !reportB) {
    return (
      <>
        <header className="clinical-header">
          <Link href="/dashboard/eeg-reports" className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
            ← Back to Analysis History
          </Link>
        </header>
        <div className="clinical-page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 8 }}>Unable to load comparison</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{error}</div>
            <Link href="/dashboard/eeg-reports" className="clinical-btn-primary" style={{ display: 'inline-flex', height: 36, padding: '0 20px', fontSize: 13, alignItems: 'center' }}>
              Back to Analysis History
            </Link>
          </div>
        </div>
      </>
    )
  }

  const metrics = buildMetrics(reportA, reportB)
  const scoutDiffs = buildScoutSummary(reportA, reportB)

  return (
    <>
      {/* ── Header ── */}
      <header className="clinical-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            href="/dashboard/eeg-reports"
            className="text-[12px] font-medium transition-colors hover:text-[var(--accent-primary)]"
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Analysis History
          </Link>
          <span style={{ fontSize: 10, color: 'var(--border-strong)' }}>›</span>
          <span className="text-[14px] font-semibold" style={{ color: 'var(--text-heading)' }}>Report Comparison</span>
        </div>
      </header>

      {/* ── Page content ── */}
      <div className="clinical-fade-in clinical-page-content">
        <div className="clinical-page-container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Page hero ── */}
          <section
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
              padding: '28px 40px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(14,116,144,0.028) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div className="clinical-hero-tagline">Side-by-side analysis</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.02em', marginTop: 8 }}>Report Comparison</h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.65, maxWidth: 500 }}>
                Review differences between two EEG analyses. Changes are shown as-is — higher or lower values are not inherently better or worse without clinical context.
              </p>
            </div>
          </section>

          {/* ── Two report cards side by side ── */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
            <ReportSummaryCard report={reportA} label="A" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 40 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 1, height: 40, background: 'var(--border-default)' }} />
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-inset)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
                <div style={{ width: 1, height: 40, background: 'var(--border-default)' }} />
              </div>
            </div>
            <ReportSummaryCard report={reportB} label="B" />
          </div>

          {/* ── Comparison metrics ── */}
          <section
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            {/* Section header */}
            <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--accent-primary-light)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>Comparison Metrics</div>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>Report A vs Report B</div>
              </div>
            </div>

            {/* Column headers */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr 1fr 140px',
                gap: 0,
                padding: '10px 28px',
                background: 'var(--bg-inset)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {['Metric', 'Report A', 'Report B', 'Change'].map((col) => (
                <div key={col} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
                  {col}
                </div>
              ))}
            </div>

            {/* Rows */}
            {metrics.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr 1fr 140px',
                  gap: 0,
                  padding: '14px 28px',
                  background: i % 2 !== 0 ? 'var(--bg-muted)' : 'transparent',
                  borderBottom: i < metrics.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{row.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{row.a}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{row.b}</div>
                <div><ChangePill value={row.change} /></div>
              </div>
            ))}
          </section>

          {/* ── SCOUT Comparison Summary ── */}
          <section
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
            }}
          >
            {/* Header bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, #3B82F6, #06B6D4)' }} />
            <div style={{ padding: '20px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14 }}>✦</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-heading)' }}>SCOUT Comparison Summary</div>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>Seizure Clinical Operations & Understanding Tool</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 99, padding: '3px 10px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                    {scoutDiffs.length} finding{scoutDiffs.length !== 1 ? 's' : ''} identified
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 14, fontStyle: 'italic' }}>
                SCOUT reviewed both reports and identified the following observable differences. These observations are descriptive only — clinical interpretation is required.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scoutDiffs.map((diff, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-inset)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#3B82F6' }}>{i + 1}</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.6 }}>{diff}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Actions ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 28px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <Link
              href="/dashboard/eeg-reports"
              className="clinical-btn-secondary"
              style={{ height: 36, padding: '0 16px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
              Back to Analysis History
            </Link>

            <div style={{ display: 'flex', gap: 10 }}>
              <Link
                href={`/report/${reportA.id}`}
                className="clinical-btn-outline"
                style={{ height: 36, padding: '0 16px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                View Report A
              </Link>
              <Link
                href={`/report/${reportB.id}`}
                className="clinical-btn-primary"
                style={{ height: 36, padding: '0 16px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                View Report B
              </Link>
            </div>
          </div>

          <div style={{ height: 16 }} />
        </div>
      </div>
    </>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { normalizeReport, normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'

function statusColor(status: string) {
  if (status === 'completed') return { color: 'var(--accent-success)', background: 'rgba(0,255,157,0.08)' }
  if (status === 'failed') return { color: 'var(--accent-danger)', background: 'rgba(255,51,102,0.08)' }
  return { color: 'var(--accent-primary)', background: 'rgba(0,240,255,0.08)' }
}

function getKeyResult(report: ReportRecord) {
  if (normalizeReportStatus(report.status) === 'failed') {
    return report.error_message || 'Analysis failed'
  }

  if (normalizeReportStatus(report.status) !== 'completed') {
    return 'Analysis in progress'
  }

  if ((report.event_count ?? 0) > 0) {
    return `${report.event_count ?? 0} seizure event(s) detected`
  }

  return report.result_label || 'No seizure activity detected'
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDateISO(dateStr: string) {
  return new Date(dateStr).toISOString().split('T')[0]
}

export default function AnalysisHistoryPage() {
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function fetchReports() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setReports([])
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('reports')
          .select('id, user_id, filename, status, summary, result_label, event_count, confidence_score, quality_grade, risk_level, duration_minutes, created_at, error_message')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setReports(Array.isArray(data) ? data.map(normalizeReport) : [])
      } catch (fetchError) {
        console.error('[History] Error fetching reports:', fetchError)
        setReports([])
      } finally {
        setLoading(false)
      }
    }

    void fetchReports()
  }, [supabase])

  useEffect(() => {
    const hasActiveWork = reports.some((report) => {
      const status = normalizeReportStatus(report.status)
      return status === 'pending' || status === 'processing'
    })

    if (!hasActiveWork) return

    const interval = window.setInterval(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) return

        const { data, error } = await supabase
          .from('reports')
          .select('id, user_id, filename, status, summary, result_label, event_count, confidence_score, quality_grade, risk_level, duration_minutes, created_at, error_message')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setReports(Array.isArray(data) ? data.map(normalizeReport) : [])
      } catch (error) {
        console.error('[History] Polling error:', error)
      }
    }, 5000)

    return () => window.clearInterval(interval)
  }, [reports, supabase])

  const filtered = useMemo(() => {
    let result = reports

    // Filter by date
    if (dateFilter) {
      result = result.filter((report) => formatDateISO(report.created_at) === dateFilter)
    }

    // Filter by text search
    const query = search.trim().toLowerCase()
    if (query) {
      result = result.filter((report) => {
        const dateStr = new Date(report.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        return [report.filename, report.status, report.result_label, report.summary, report.risk_level, dateStr]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(query))
      })
    }

    return result
  }, [reports, search, dateFilter])

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-3" style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(16px)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-[11px] font-mono uppercase tracking-widest transition-colors hover:text-[#00F0FF]" style={{ color: 'var(--text-muted)' }}>
            NeuroSentinel AI
          </Link>
          <span style={{ color: 'var(--border-default)' }}>/</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
            Analysis History
          </span>
        </div>
        <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} report(s)
        </span>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-6" style={{ animation: 'fadeInUp 0.35s ease forwards' }}>
        <section className="rounded-[30px] border px-5 py-5" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                Your EEG Analysis Archive
              </div>
              <h1 className="mt-2 text-3xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                Past reports and current processing runs
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                This history is scoped to your account only. Search by filename, date, status, or risk level.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="relative w-full max-w-xs">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: 'var(--text-muted)' }}>Search</div>
                <input
                  type="text"
                  placeholder="Filename, status, risk..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border bg-[var(--bg-secondary)] px-4 text-sm outline-none transition-all focus:border-[rgba(0,240,255,0.3)]"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="relative w-full max-w-[180px]">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: 'var(--text-muted)' }}>Filter by Date</div>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border bg-[var(--bg-secondary)] px-3 text-sm outline-none transition-all focus:border-[rgba(0,240,255,0.3)]"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', colorScheme: 'dark' }}
                />
              </div>
              {dateFilter ? (
                <button
                  type="button"
                  onClick={() => setDateFilter('')}
                  className="h-11 rounded-xl border px-3 text-xs font-medium transition-all hover:bg-[rgba(255,255,255,0.04)]"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {loading ? (
            <div className="rounded-[30px] border px-5 py-16 text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent-primary) transparent transparent transparent' }} />
              <div className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                Loading your report history...
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[30px] border px-5 py-16 text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {reports.length > 0 ? 'No matching reports' : 'No reports yet'}
              </div>
              <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {reports.length > 0 ? 'Try adjusting your search or date filter.' : 'Upload an EDF from the Command Centre to begin your first analysis.'}
              </div>
            </div>
          ) : (
            filtered.map((report) => {
              const status = normalizeReportStatus(report.status)
              const palette = statusColor(status)

              return (
                <article
                  key={report.id}
                  className="rounded-[30px] border px-5 py-5"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                        {report.filename}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs">📅</span>
                          {formatDate(report.created_at)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs">🕐</span>
                          {formatTime(report.created_at)}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          ID: {report.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <span className="rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: palette.color, background: palette.background }}>
                      {status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Key result</div>
                      <div className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>{getKeyResult(report)}</div>
                    </div>
                    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Risk</div>
                      <div className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>{report.risk_level || 'Unknown'}</div>
                    </div>
                    <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Summary</div>
                      <div className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>{report.summary || 'Structured summary pending.'}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href={`/report/${report.id}`} className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-warning))', color: '#0A0A0F' }}>
                      View Report
                    </Link>
                    {status === 'completed' ? (
                      <a href={`/api/reports/${report.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: 'rgba(255,184,0,0.22)', color: 'var(--accent-warning)' }}>
                        Download PDF
                      </a>
                    ) : null}
                  </div>
                </article>
              )
            })
          )}
        </section>
      </div>
    </>
  )
}

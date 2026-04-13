'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { formatConfidence, formatDurationMinutes, getReportHeadline, getReportSummary, normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'

import type { UploadState } from './upload-zone'

function QuietTag({ children }: { children: string }) {
  return <div className="text-xs font-medium tracking-widest text-[#8888A0]">{children}</div>
}

function statusStyles(status: string) {
  if (status === 'completed') {
    return {
      background: 'rgba(0,255,157,0.08)',
      borderColor: 'rgba(0,255,157,0.18)',
      color: 'var(--accent-success)',
    }
  }

  if (status === 'failed') {
    return {
      background: 'rgba(255,51,102,0.08)',
      borderColor: 'rgba(255,51,102,0.18)',
      color: 'var(--accent-danger)',
    }
  }

  return {
    background: 'rgba(0,240,255,0.08)',
    borderColor: 'rgba(0,240,255,0.18)',
    color: 'var(--accent-primary)',
  }
}

export function AnalysisResults({ data, uploadState = 'idle', uploadFilename }: { data: ReportRecord | null; uploadState?: UploadState; uploadFilename?: string }) {
  const hasReport = data != null
  const status = normalizeReportStatus(data?.status)
  const reportJson = data?.report_json
  const recommendations = Array.isArray(reportJson?.clinical_report?.recommendations) ? reportJson?.clinical_report?.recommendations.slice(0, 3) : []
  const events = Array.isArray(reportJson?.events) ? reportJson.events.slice(0, 3) : []
  const topRegions = Array.isArray(reportJson?.top_regions) ? reportJson.top_regions.slice(0, 3) : []
  const processingHint = useMemo(() => {
    if (!data || status !== 'processing') return null
    const ageSeconds = Math.max(0, (Date.now() - new Date(data.created_at).getTime()) / 1000)
    if (ageSeconds < 180) return null
    return 'Large EEG files on local CPU can take several minutes. NeuroSentinel AI is still working through preprocessing, inference, and report generation.'
  }, [data, status])

  // If actively uploading/processing, show that state instead of stale data
  const isActiveUpload = uploadState === 'uploading' || uploadState === 'processing'

  if (isActiveUpload) {
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <QuietTag>Analysis status</QuietTag>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium" style={statusStyles('processing')}>
              <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--accent-primary)' }} />
              {uploadState === 'uploading' ? 'Uploading EEG...' : 'Analysing EEG signals...'}
            </span>
          </div>
          <div className="mt-3 text-sm leading-6 text-[#8888A0]">
            {uploadFilename ? <span className="font-medium text-[#E8E8F0]">{uploadFilename}</span> : null}
            {uploadFilename ? ' — ' : ''}
            {uploadState === 'uploading'
              ? 'Your EEG file is being uploaded to NeuroSentinel AI.'
              : 'Preprocessing, running inference, and generating the clinical report. This may take a few minutes for large files.'}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border border-t-transparent" style={{ borderColor: '#00F0FF transparent transparent transparent' }} />
            <span className="text-xs text-[#8888A0]">Working...</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <QuietTag>{hasReport ? 'Analysis status' : 'No Analysis'}</QuietTag>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          {!hasReport ? (
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-[#8888A0]" style={{ background: 'rgba(136,136,160,0.1)', borderColor: 'rgba(136,136,160,0.28)' }}>
              Awaiting upload
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium" style={statusStyles(status)}>
              <span className="h-2 w-2 rounded-full" style={{ background: status === 'failed' ? 'var(--accent-danger)' : status === 'completed' ? 'var(--accent-success)' : 'var(--accent-primary)' }} />
              {getReportHeadline(data)}
            </span>
          )}
          <div className="flex items-center gap-3 text-xs text-[#8888A0]">
            <span>Duration: {hasReport ? formatDurationMinutes(data?.duration_minutes) : 'Unknown'}</span>
            <span>Confidence: {hasReport ? formatConfidence(data?.confidence_score) : 'Unknown'}</span>
          </div>
        </div>
        {hasReport ? (
          <p className="mt-3 text-sm leading-6 text-[#8888A0]">
            {getReportSummary(data)}
          </p>
        ) : null}
      </div>

      {!hasReport ? (
        <p className="text-sm text-[#8888A0]">Create a report to see its queue state, risk summary, event cards, and recommendations.</p>
      ) : status !== 'completed' ? (
        <div className="rounded-2xl border px-4 py-4 text-sm leading-6" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
          <div className="font-medium text-[#E8E8F0]" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {data.filename}
          </div>
          <div className="mt-2">{data.error_message || 'SCOUT and the report detail page will stay available while this analysis moves through the backend lifecycle.'}</div>
          {processingHint ? <div className="mt-2 text-xs text-[#8888A0]">{processingHint}</div> : null}
          <Link
            href={`/report/${data.id}`}
            className="mt-4 inline-flex rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: 'rgba(0,240,255,0.16)', color: 'var(--accent-primary)' }}
          >
            Open report detail
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4 rounded-2xl border px-4 py-4" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <QuietTag>Structured findings</QuietTag>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Events', value: `${data.event_count ?? reportJson?.events?.length ?? 0}` },
                { label: 'Risk', value: data.risk_level || reportJson?.risk_level || 'Unknown' },
                { label: 'Quality', value: data.quality_grade || reportJson?.quality_grade || 'Unknown' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#E8E8F0]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {events.length === 0 ? (
                <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                  No seizure events survived post-processing for this report.
                </div>
              ) : (
                events.map((event) => (
                  <div key={event.event_idx} className="rounded-2xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#E8E8F0]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        Event {event.event_idx}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--accent-primary)' }}>
                        {event.risk_level || 'Unknown'} risk
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#8888A0] sm:grid-cols-3">
                      <span>{event.onset_sec}s → {event.offset_sec}s</span>
                      <span>{event.duration_sec}s duration</span>
                      <span>{typeof event.mean_probability === 'number' ? `${(event.mean_probability * 100).toFixed(1)}% confidence` : 'Confidence unknown'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border px-4 py-4" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <QuietTag>Context</QuietTag>
            <div className="rounded-2xl border px-4 py-3 text-sm leading-6" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
              {reportJson?.trend_summary || data.summary || 'The full report contains structured quality, risk, and explainability outputs.'}
            </div>

            <div className="rounded-2xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                Top regions
              </div>
              <div className="mt-3 space-y-2">
                {topRegions.length > 0 ? (
                  topRegions.map(([region, score]) => (
                    <div key={region} className="flex items-center justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>{region}</span>
                      <span style={{ color: 'var(--accent-primary)' }}>{score.toFixed(3)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-[#8888A0]">Region data will appear here when explainability is available.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                Recommendations
              </div>
              <div className="mt-3 space-y-2 text-sm text-[#8888A0]">
                {recommendations.length > 0 ? recommendations.map((item) => <div key={item}>{item}</div>) : <div>Open the full report for the complete recommendation set.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

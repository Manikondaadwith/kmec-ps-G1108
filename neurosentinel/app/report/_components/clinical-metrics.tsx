'use client'

import type { ScoutRole } from '@/lib/scout-guide'

type Props = {
  role: ScoutRole
  report: any
  reportJson: any
  events: any[]
}

export function ClinicalMetrics({ role, report, reportJson, events }: Props) {
  const modelOutputs = reportJson?.model_outputs || {}
  const quality = reportJson?.quality || {}

  // Compute derived metrics
  const totalDurationSec = (report?.duration_minutes ?? 0) * 60
  const eventsPerHour = modelOutputs.events_per_hour ?? (totalDurationSec > 0 ? (events.length / totalDurationSec) * 3600 : 0)
  const meanDurationSec = events.length > 0
    ? events.reduce((acc: number, e: any) => acc + (e.duration_sec || 0), 0) / events.length
    : 0
  const avgConfidence = events.length > 0
    ? events.reduce((acc: number, e: any) => acc + (e.mean_probability || 0), 0) / events.length
    : 0
  const probSummary = modelOutputs.probability_summary || {}

  if (role === 'patient') {
    // Patient view — simplified, plain language
    const severityLabel = events.length === 0 ? 'Normal'
      : events.some((e: any) => (e.severity_score ?? 0) > 7) ? 'High'
      : events.some((e: any) => (e.severity_score ?? 0) > 4) ? 'Moderate'
      : 'Low'
    const severityColor = severityLabel === 'High' ? '#FF3366' : severityLabel === 'Moderate' ? '#FFB800' : '#00FF88'

    return (
      <div className="space-y-3">
        <div className="rounded-xl border px-4 py-4" style={{ borderColor: `${severityColor}20`, background: `${severityColor}06` }}>
          <div className="text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Overall Severity</div>
            <div className="mt-2 text-2xl font-bold" style={{ color: severityColor, fontFamily: "'Outfit', sans-serif" }}>{severityLabel}</div>
          </div>
        </div>
        <div className="rounded-xl border px-4 py-3 text-xs leading-6" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)', color: 'var(--text-secondary)' }}>
          {events.length === 0
            ? 'No seizure activity was detected in your recording. This is a good sign, but please continue regular check-ups with your neurologist.'
            : `${events.length} seizure event${events.length > 1 ? 's' : ''} ${events.length > 1 ? 'were' : 'was'} detected in your recording. Your neurologist will review these findings and explain what they mean for your treatment plan. The average event lasted ${meanDurationSec.toFixed(0)} seconds.`
          }
        </div>
      </div>
    )
  }

  if (role === 'researcher') {
    // Researcher view — full technical breakdown
    return (
      <div className="space-y-2.5">
        <div className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Researcher Metrics</div>
        {[
          { label: 'Events Detected', value: `${events.length}` },
          { label: 'Events/Hour', value: eventsPerHour.toFixed(2) },
          { label: 'Mean Event Duration', value: `${meanDurationSec.toFixed(1)}s` },
          { label: 'Mean Event Confidence', value: `${(avgConfidence * 100).toFixed(1)}%` },
          { label: 'Prob Mean (all windows)', value: probSummary.mean != null ? probSummary.mean.toFixed(4) : '—' },
          { label: 'Prob Median', value: probSummary.median != null ? probSummary.median.toFixed(4) : '—' },
          { label: 'Prob P99', value: probSummary.p99 != null ? probSummary.p99.toFixed(4) : '—' },
          { label: 'Prob Max', value: probSummary.max != null ? probSummary.max.toFixed(4) : '—' },
          { label: 'Output Domain Shift', value: modelOutputs.output_domain_shift != null ? modelOutputs.output_domain_shift.toFixed(4) : '—' },
          { label: 'Shift Label', value: modelOutputs.shift_label || '—' },
          { label: 'Threshold (High)', value: modelOutputs.threshold_high != null ? modelOutputs.threshold_high.toFixed(4) : '—' },
          { label: 'Threshold (Low)', value: modelOutputs.threshold_low != null ? modelOutputs.threshold_low.toFixed(4) : '—' },
          { label: 'Quality Score', value: quality.mean_quality_score != null ? quality.mean_quality_score.toFixed(4) : '—' },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.012)' }}>
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
            <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{item.value}</span>
          </div>
        ))}
        <div className="rounded-lg border px-3 py-2 text-[9px]" style={{ borderColor: 'rgba(167,139,250,0.1)', background: 'rgba(167,139,250,0.03)', color: '#A78BFA' }}>
          ℹ BatchNorm layers (6) store CHB-MIT statistics. Non-seizure baseline prob ≈ 0.33 on CPU (BN drift). Cross-dataset shift detected via output prob median.
        </div>
      </div>
    )
  }

  // Clinician view (default) — key detection metrics
  const modelConfidence = report?.confidence_score != null ? `${report.confidence_score}%` : (avgConfidence > 0 ? `${(avgConfidence * 100).toFixed(1)}%` : '—')

  return (
    <div className="space-y-2.5">
      <div className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Clinical Detection Metrics</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Events', value: `${events.length}`, color: events.length > 0 ? '#FF3366' : '#00FF88' },
          { label: 'Events/Hour', value: eventsPerHour > 0 ? eventsPerHour.toFixed(2) : '0', color: eventsPerHour > 2 ? '#FF3366' : '#00F0FF' },
          { label: events.length > 0 ? 'Mean Duration' : 'Prob Max', value: events.length > 0 ? `${meanDurationSec.toFixed(1)}s` : (probSummary.max != null ? probSummary.max.toFixed(4) : '—'), color: 'var(--text-primary)' },
          { label: 'Confidence', value: modelConfidence, color: '#00F0FF' },
          { label: 'Domain Shift', value: modelOutputs.shift_label || 'NONE', color: (modelOutputs.shift_label && modelOutputs.shift_label !== 'NONE') ? '#FFB800' : 'var(--text-secondary)' },
          { label: 'Quality', value: report?.quality_grade || '—', color: gradeColor(report?.quality_grade || '') },
        ].map(item => (
          <div key={item.label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
            <div className="text-[8px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
            <div className="mt-1 text-sm font-bold font-mono" style={{ color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function gradeColor(grade: string) {
  const g = grade.toLowerCase()
  if (g === 'good' || g === 'a') return '#00FF88'
  if (g === 'moderate' || g === 'b') return '#FFB800'
  return '#FF3366'
}

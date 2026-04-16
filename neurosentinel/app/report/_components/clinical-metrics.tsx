'use client'

import { formatConfidence, formatDurationMinutes } from '@/lib/neurosentinel/types'

type Props = {
  report: any
  events: any[]
}

export function ClinicalMetrics({ report, events }: Props) {
  const meanDurationSec = events.length > 0
    ? events.reduce((acc: number, e: any) => acc + (e.duration_sec || 0), 0) / events.length
    : 0

  const riskColor = (() => {
    const r = (report?.risk_level || '').toLowerCase()
    if (r === 'high' || r === 'critical') return '#EF4444'
    if (r === 'moderate' || r === 'medium') return '#F59E0B'
    if (r === 'low') return '#10B981'
    return '#64748B'
  })()

  const metrics = [
    { label: 'Confidence', value: formatConfidence(report?.confidence_score), color: '#3B82F6', icon: '📊' },
    { label: 'Mean Duration', value: events.length > 0 ? `${meanDurationSec.toFixed(1)}s` : '—', color: '#1E293B', icon: '⏱️' },
    { label: 'Signal Quality', value: report?.quality_grade || 'Unknown', color: report?.quality_grade?.toLowerCase() === 'good' ? '#10B981' : '#F59E0B', icon: '📶' },
    { label: 'Risk Level', value: report?.risk_level || 'Unknown', color: riskColor, icon: '🛡️' },
    { label: 'Recording', value: formatDurationMinutes(report?.duration_minutes), color: '#64748B', icon: '🧠' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m) => (
        <div 
          key={m.label} 
          className="group flex flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-blue-100"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">{m.icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.label}</span>
          </div>
          <div className="text-base font-bold tracking-tight" style={{ color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function gradeColor(grade: string) {
  const g = grade.toLowerCase()
  if (g === 'good' || g === 'a') return '#00FF88'
  if (g === 'moderate' || g === 'b') return '#FFB800'
  return '#FF3366'
}

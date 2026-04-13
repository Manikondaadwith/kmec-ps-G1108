'use client'

type Props = {
  qualityScore?: number
  qualityGrade?: string
  artifactPercent?: number
  snrDb?: number
  flatlineFrac?: number
  channelReliability?: boolean[]
  missingChannels?: string[]
}

function gradeColor(grade: string) {
  const g = (grade || '').toLowerCase()
  if (g === 'good' || g === 'a') return '#00FF88'
  if (g === 'moderate' || g === 'b') return '#FFB800'
  return '#FF3366'
}

export function DataQualityPanel({ qualityScore, qualityGrade, artifactPercent, snrDb, flatlineFrac, channelReliability, missingChannels }: Props) {
  const score = typeof qualityScore === 'number' ? qualityScore : 0
  const grade = qualityGrade || 'Unknown'
  const color = gradeColor(grade)
  const circumference = 2 * Math.PI * 42
  const strokeDashoffset = circumference - (score * circumference)

  return (
    <div className="space-y-4">
      {/* Quality gauge */}
      <div className="flex items-center gap-5">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg className="-rotate-90" width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
            <circle
              cx="48" cy="48" r="42"
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease-in-out', filter: `drop-shadow(0 0 6px ${color}50)` }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-lg font-bold font-mono" style={{ color, fontFamily: "'Outfit', sans-serif" }}>
              {typeof qualityScore === 'number' ? qualityScore.toFixed(2) : '—'}
            </span>
            <span className="text-[7px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>/ 1.0</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Signal Quality</div>
          <div className="mt-1 text-xl font-bold" style={{ color, fontFamily: "'Outfit', sans-serif" }}>{grade}</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'SNR', value: typeof snrDb === 'number' ? `${snrDb.toFixed(1)} dB` : '—', icon: '📡' },
          { label: 'Flatline', value: typeof flatlineFrac === 'number' ? `${(flatlineFrac * 100).toFixed(1)}%` : '—', icon: '📉' },
          { label: 'Artifacts', value: typeof artifactPercent === 'number' ? `${(artifactPercent * 100).toFixed(1)}%` : '—', icon: '🔧' },
          { label: 'Channels OK', value: channelReliability ? `${channelReliability.filter(Boolean).length}/22` : '—', icon: '📶' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
            <div className="flex items-center gap-1">
              <span className="text-[10px]">{item.icon}</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
            </div>
            <div className="mt-1 text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Missing channels */}
      {missingChannels && missingChannels.length > 0 ? (
        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(255,51,102,0.1)', background: 'rgba(255,51,102,0.03)' }}>
          <div className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: '#FF3366' }}>Missing Channels</div>
          <div className="mt-1 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {missingChannels.join(', ')}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'rgba(0,255,136,0.08)', background: 'rgba(0,255,136,0.02)' }}>
          <div className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: '#00FF88' }}>✓ All 22 Channels Present</div>
        </div>
      )}
    </div>
  )
}

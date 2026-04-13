'use client'

type Props = {
  events: any[]
}

function formatTimestamp(sec: number | undefined) {
  if (typeof sec !== 'number') return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`
}

function riskBadgeStyle(risk: string) {
  const r = (risk || '').toLowerCase()
  if (r === 'critical') return { bg: 'rgba(255,51,102,0.12)', color: '#FF3366', glow: '0 0 12px rgba(255,51,102,0.3)' }
  if (r === 'high') return { bg: 'rgba(255,51,102,0.08)', color: '#FF3366', glow: 'none' }
  if (r === 'medium' || r === 'moderate') return { bg: 'rgba(255,184,0,0.08)', color: '#FFB800', glow: 'none' }
  if (r === 'low') return { bg: 'rgba(0,255,136,0.08)', color: '#00FF88', glow: 'none' }
  return { bg: 'rgba(136,136,160,0.08)', color: '#8888A0', glow: 'none' }
}

export function EventCards({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border px-5 py-6" style={{ borderColor: 'rgba(0,255,136,0.15)', background: 'rgba(0,255,136,0.04)' }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: '#00FF88', boxShadow: '0 0 8px rgba(0,255,136,0.4)' }} />
          <span className="text-sm font-semibold" style={{ color: '#00FF88', fontFamily: "'Outfit', sans-serif" }}>No Seizure Events Detected</span>
        </div>
        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
          The model did not detect any epileptiform activity above the confidence threshold for this recording.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {events.map((event: any, idx: number) => {
        const badge = riskBadgeStyle(event.risk_level || '')
        const bp = event.band_powers || {}
        const domBand = Object.keys(bp).length > 0
          ? Object.entries(bp).sort((a: any, b: any) => b[1] - a[1])[0]?.[0]
          : null

        return (
          <div
            key={event.event_idx ?? idx}
            className="group relative rounded-2xl border p-4 transition-all duration-300 hover:border-[rgba(255,255,255,0.12)]"
            style={{
              borderColor: 'rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold" style={{ background: 'rgba(255,51,102,0.12)', color: '#FF3366', fontFamily: "'JetBrains Mono', monospace" }}>
                  {event.event_idx ?? idx + 1}
                </span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Event</div>
                </div>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em]"
                style={{ background: badge.bg, color: badge.color, boxShadow: badge.glow }}
              >
                {event.risk_level || 'Unknown'}
              </span>
            </div>

            {/* Timing row */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
                <div className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Onset</div>
                <div className="mt-0.5 text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{formatTimestamp(event.onset_sec)}</div>
              </div>
              <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
                <div className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Offset</div>
                <div className="mt-0.5 text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{formatTimestamp(event.offset_sec)}</div>
              </div>
              <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
                <div className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Duration</div>
                <div className="mt-0.5 text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {typeof event.duration_sec === 'number' ? `${event.duration_sec.toFixed(1)}s` : '—'}
                </div>
              </div>
            </div>

            {/* Confidence bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Confidence</span>
                <span className="text-xs font-mono font-bold" style={{ color: '#00F0FF' }}>
                  {typeof event.mean_probability === 'number' ? `${(event.mean_probability * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${typeof event.mean_probability === 'number' ? Math.min(100, event.mean_probability * 100) : 0}%`,
                    background: typeof event.mean_probability === 'number' && event.mean_probability > 0.7
                      ? 'linear-gradient(90deg, #FF3366, #FF6B9D)'
                      : 'linear-gradient(90deg, #00F0FF, #818CF8)',
                  }}
                />
              </div>
            </div>

            {/* Severity ring */}
            {event.severity_score != null ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15" fill="none"
                      stroke={event.severity_score > 7 ? '#FF3366' : event.severity_score > 4 ? '#FFB800' : '#00FF88'}
                      strokeWidth="3"
                      strokeDasharray={`${(event.severity_score / 10) * 94.2} 94.2`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{event.severity_score}</span>
                </div>
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>Severity <span className="text-[7px] font-normal" style={{ color: 'rgba(136,136,160,0.5)' }}>[HEURISTIC]</span></div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{event.severity_score}/10</div>
                </div>
              </div>
            ) : null}

            {/* Tags row */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {event.pattern_type ? (
                <span className="rounded-md px-2 py-0.5 text-[8px] font-semibold uppercase" style={{ background: 'rgba(167,139,250,0.1)', color: '#A78BFA' }}>
                  {event.pattern_type} <span style={{ opacity: 0.5 }}>[H]</span>
                </span>
              ) : null}
              {event.focal_vs_gen ? (
                <span className="rounded-md px-2 py-0.5 text-[8px] font-semibold uppercase" style={{ background: 'rgba(0,240,255,0.08)', color: '#00F0FF' }}>
                  {event.focal_vs_gen} <span style={{ opacity: 0.5 }}>[EST]</span>
                </span>
              ) : null}
              {event.early_warning ? (
                <span className="rounded-md px-2 py-0.5 text-[8px] font-semibold uppercase" style={{ background: 'rgba(255,184,0,0.1)', color: '#FFB800' }}>
                  ⚠ Early Warning
                </span>
              ) : null}
              {event.inter_seizure_interval != null ? (
                <span className="rounded-md px-2 py-0.5 text-[8px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                  ISI: {event.inter_seizure_interval}s
                </span>
              ) : null}
              {domBand ? (
                <span className="rounded-md px-2 py-0.5 text-[8px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                  Band: {domBand}
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

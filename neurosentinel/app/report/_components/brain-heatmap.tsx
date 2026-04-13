'use client'

import { useState } from 'react'

// 10-20 electrode positions for top-down SVG head map
// Coordinates are in a 200x200 viewBox, origin = top-left
const ELECTRODE_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
  'FP1':  { x: 72,  y: 28,  label: 'Fp1' },
  'FP2':  { x: 128, y: 28,  label: 'Fp2' },
  'F7':   { x: 36,  y: 58,  label: 'F7' },
  'F3':   { x: 72,  y: 58,  label: 'F3' },
  'FZ':   { x: 100, y: 52,  label: 'Fz' },
  'F4':   { x: 128, y: 58,  label: 'F4' },
  'F8':   { x: 164, y: 58,  label: 'F8' },
  'FT9':  { x: 18,  y: 78,  label: 'FT9' },
  'FT10': { x: 182, y: 78,  label: 'FT10' },
  'T7':   { x: 22,  y: 100, label: 'T7' },
  'C3':   { x: 68,  y: 96,  label: 'C3' },
  'CZ':   { x: 100, y: 90,  label: 'Cz' },
  'C4':   { x: 132, y: 96,  label: 'C4' },
  'T8':   { x: 178, y: 100, label: 'T8' },
  'P7':   { x: 42,  y: 138, label: 'P7' },
  'P3':   { x: 74,  y: 132, label: 'P3' },
  'PZ':   { x: 100, y: 128, label: 'Pz' },
  'P4':   { x: 126, y: 132, label: 'P4' },
  'P8':   { x: 158, y: 138, label: 'P8' },
  'O1':   { x: 78,  y: 168, label: 'O1' },
  'O2':   { x: 122, y: 168, label: 'O2' },
}

// Map bipolar channel names to their electrode pair
function bipolarToElectrodes(channelName: string): [string, string] | null {
  const parts = channelName.toUpperCase().replace(/ /g, '').split('-')
  if (parts.length !== 2) return null
  return [parts[0], parts[1]]
}

function importanceToColor(value: number, max: number): string {
  const normalized = max > 0 ? Math.min(1, value / max) : 0
  // Cool (cyan) → Warm (purple) → Hot (red)
  if (normalized < 0.33) {
    const t = normalized / 0.33
    const r = Math.round(0 + t * 100)
    const g = Math.round(240 - t * 100)
    const b = Math.round(255 - t * 50)
    return `rgb(${r},${g},${b})`
  } else if (normalized < 0.66) {
    const t = (normalized - 0.33) / 0.33
    const r = Math.round(100 + t * 67)
    const g = Math.round(140 - t * 1)
    const b = Math.round(205 + t * 45)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (normalized - 0.66) / 0.34
    const r = Math.round(167 + t * 88)
    const g = Math.round(139 - t * 88)
    const b = Math.round(250 - t * 148)
    return `rgb(${r},${g},${b})`
  }
}

type Props = {
  topChannels?: [string, number][]
  channelImportance?: number[]
}

export function BrainHeatmap({ topChannels = [] }: Props) {
  const [hoveredElectrode, setHoveredElectrode] = useState<string | null>(null)

  // Build electrode importance map from bipolar channels
  const electrodeScores: Record<string, number> = {}
  let maxScore = 0

  for (const [channel, score] of topChannels) {
    const pair = bipolarToElectrodes(channel)
    if (!pair) continue
    for (const electrode of pair) {
      electrodeScores[electrode] = (electrodeScores[electrode] || 0) + score
      maxScore = Math.max(maxScore, electrodeScores[electrode])
    }
  }

  if (topChannels.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border px-5 py-8" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Channel importance data not available for heatmap rendering.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 200" className="w-full max-w-[240px]" style={{ filter: 'drop-shadow(0 0 20px rgba(0,240,255,0.08))' }}>
        {/* Head outline */}
        <ellipse cx="100" cy="100" rx="88" ry="92" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        {/* Nose indicator */}
        <path d="M 95 8 L 100 2 L 105 8" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        {/* Ear indicators */}
        <path d="M 8 90 Q 2 100 8 110" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <path d="M 192 90 Q 198 100 192 110" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

        {/* Electrode nodes */}
        {Object.entries(ELECTRODE_POSITIONS).map(([key, pos]) => {
          const score = electrodeScores[key] || 0
          const color = importanceToColor(score, maxScore)
          const radius = score > 0 ? 6 + (score / maxScore) * 4 : 5
          const isHovered = hoveredElectrode === key

          return (
            <g key={key}
              onMouseEnter={() => setHoveredElectrode(key)}
              onMouseLeave={() => setHoveredElectrode(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow */}
              {score > 0 ? (
                <circle cx={pos.x} cy={pos.y} r={radius + 4} fill={color} opacity={isHovered ? 0.3 : 0.15} />
              ) : null}
              {/* Node */}
              <circle
                cx={pos.x} cy={pos.y} r={radius}
                fill={score > 0 ? color : 'rgba(40,40,60,0.8)'}
                stroke={isHovered ? '#fff' : 'rgba(255,255,255,0.15)'}
                strokeWidth={isHovered ? 1.5 : 0.8}
              />
              {/* Label */}
              <text
                x={pos.x} y={pos.y + (isHovered ? -radius - 5 : 3)}
                textAnchor="middle"
                fontSize={isHovered ? 8 : 6}
                fill={isHovered ? '#fff' : 'rgba(255,255,255,0.4)'}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight={isHovered ? 700 : 400}
              >
                {pos.label}
              </text>
              {/* Score on hover */}
              {isHovered && score > 0 ? (
                <text
                  x={pos.x} y={pos.y + radius + 10}
                  textAnchor="middle" fontSize="7"
                  fill={color} fontFamily="'JetBrains Mono', monospace" fontWeight="700"
                >
                  {score.toFixed(3)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {/* Color legend */}
      <div className="flex items-center gap-2">
        <span className="text-[8px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Low</span>
        <div className="h-1.5 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, #00F0FF, #A78BFA, #FF3366)' }} />
        <span className="text-[8px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>High</span>
      </div>
      <div className="text-[8px] uppercase tracking-[0.16em]" style={{ color: 'rgba(136,136,160,0.5)' }}>[ESTIMATED]</div>
    </div>
  )
}

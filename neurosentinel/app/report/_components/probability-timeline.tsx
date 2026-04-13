'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts'

type Props = {
  probabilityTimeline?: number[]
  events?: any[]
  thresholdHigh?: number
  thresholdLow?: number
  strideSec?: number
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ProbabilityTimeline({ probabilityTimeline, events = [], thresholdHigh, thresholdLow, strideSec = 1 }: Props) {
  const data = useMemo(() => {
    if (!probabilityTimeline?.length) return []
    return probabilityTimeline.map((p, i) => ({
      time: i * strideSec,
      probability: typeof p === 'number' ? p : 0,
    }))
  }, [probabilityTimeline, strideSec])

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border px-5 py-8" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Probability timeline data not available for this recording.</span>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.[0]) return null
    return (
      <div className="rounded-xl border px-3 py-2" style={{ background: 'rgba(10,10,15,0.95)', borderColor: 'rgba(0,240,255,0.2)', backdropFilter: 'blur(12px)' }}>
        <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {formatTime(label)}
        </div>
        <div className="text-sm font-bold font-mono" style={{ color: '#00F0FF' }}>
          {(payload[0].value * 100).toFixed(1)}%
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
          <defs>
            <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00F0FF" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#00F0FF" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            tick={{ fill: '#565670', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
            stroke="rgba(255,255,255,0.06)"
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1.0]}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: '#565670', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
            stroke="rgba(255,255,255,0.06)"
            tickLine={false}
            width={42}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Seizure event shaded zones */}
          {events.map((evt: any, i: number) => (
            <ReferenceArea
              key={`evt-${i}`}
              x1={evt.onset_sec}
              x2={evt.offset_sec}
              fill="#FF336620"
              stroke="#FF336640"
              strokeDasharray="2 2"
            />
          ))}

          {/* Threshold lines */}
          {typeof thresholdHigh === 'number' ? (
            <ReferenceLine
              y={thresholdHigh}
              stroke="#FF336680"
              strokeDasharray="6 3"
              label={{ value: `Threshold ${(thresholdHigh * 100).toFixed(0)}%`, fill: '#FF336680', fontSize: 9, position: 'right' }}
            />
          ) : null}
          {typeof thresholdLow === 'number' ? (
            <ReferenceLine y={thresholdLow} stroke="#FFB80040" strokeDasharray="4 4" />
          ) : null}

          {/* Onset markers */}
          {events.map((evt: any, i: number) => (
            <ReferenceLine
              key={`onset-${i}`}
              x={evt.onset_sec}
              stroke="#FF3366"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          ))}

          <Area
            type="monotone"
            dataKey="probability"
            stroke="#00F0FF"
            strokeWidth={1.5}
            fill="url(#probGradient)"
            dot={false}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

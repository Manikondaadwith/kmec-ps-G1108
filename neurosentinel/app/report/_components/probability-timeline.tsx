'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, Label,
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
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/30 px-5 py-12">
        <span className="text-xs font-medium text-gray-400">EEG probability data unavailable for this session.</span>
      </div>
    )
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.[0]) return null
    return (
      <div className="rounded-xl border border-blue-100 bg-white/95 p-3 shadow-xl backdrop-blur-md">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
          Offset Time: {formatTime(label)}
        </div>
        <div className="text-lg font-black tracking-tight text-blue-600 font-mono">
          {(payload[0].value * 100).toFixed(1)}% <span className="text-[9px] font-bold text-gray-400">PROBABILITY</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 4 }}>
          <defs>
            <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#F1F5F9" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}
            stroke="#F1F5F9"
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.5, 1.0]}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}
            stroke="#F1F5F9"
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '4 4' }} />

          {/* Seizure event shaded zones with labels */}
          {events.map((evt: any, i: number) => (
            <ReferenceArea
              key={`evt-${i}`}
              x1={evt.onset_sec}
              x2={evt.offset_sec}
              fill="#EF4444"
              fillOpacity={0.08}
              stroke="#EF4444"
              strokeOpacity={0.2}
              strokeDasharray="3 3"
            >
              <Label 
                value="Detection Event" 
                position="top" 
                fill="#EF4444" 
                fontSize={9} 
                fontWeight={800} 
                textAnchor="middle" 
                className="uppercase tracking-widest"
              />
            </ReferenceArea>
          ))}

          {/* Threshold lines */}
          {typeof thresholdHigh === 'number' ? (
            <ReferenceLine
              y={thresholdHigh}
              stroke="#EF4444"
              strokeOpacity={0.4}
              strokeDasharray="6 4"
            >
              <Label 
                value={`Trigger Threshold ${(thresholdHigh * 100).toFixed(0)}%`} 
                position="right" 
                fill="#EF4444" 
                fontSize={9} 
                fontWeight={700}
                className="uppercase tracking-widest opacity-60"
              />
            </ReferenceLine>
          ) : null}

          <Area
            type="monotone"
            dataKey="probability"
            stroke="#3B82F6"
            strokeWidth={2}
            fill="url(#probGradient)"
            dot={false}
            animationDuration={1500}
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

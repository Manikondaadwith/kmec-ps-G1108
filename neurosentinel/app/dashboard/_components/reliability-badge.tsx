'use client'

import React from 'react'
import { RELIABILITY_CONFIG } from '@/lib/neurosentinel/ui-config'
import { getReliability } from '@/lib/neurosentinel/types'

interface ReliabilityBadgeProps {
  confidence?: number | null
  duration?: number | null
  signalQuality?: string | null
  className?: string
}

export function ReliabilityBadge({ confidence, duration, signalQuality, className = '' }: ReliabilityBadgeProps) {
  const reliability = getReliability(confidence, duration, signalQuality)
  const config = RELIABILITY_CONFIG[reliability]

  return (
    <span 
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.label}
      {config.icon && <span className="ml-0.5">{config.icon}</span>}
    </span>
  )
}

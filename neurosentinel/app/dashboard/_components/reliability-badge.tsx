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
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.icon && <span>{config.icon}</span>}
      {config.label}
    </span>
  )
}

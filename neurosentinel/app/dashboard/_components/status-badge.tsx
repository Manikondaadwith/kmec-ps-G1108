'use client'

import React from 'react'
import { STATUS_CONFIG, type StatusType } from '@/lib/neurosentinel/ui-config'
import { normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'

interface StatusBadgeProps {
  report?: ReportRecord | null
  status?: string | null
  showDot?: boolean
  showBorder?: boolean
  className?: string
}

export function StatusBadge({ report, status, showDot = true, showBorder = false, className = '' }: StatusBadgeProps) {
  // Determine the status key
  let statusKey: StatusType = 'pending'
  
  if (report) {
    const normalized = normalizeReportStatus(report.status)
    if (normalized === 'completed') {
      statusKey = (report.event_count ?? 0) > 0 ? 'seizure_detected' : 'no_seizure'
    } else if (normalized === 'failed') {
      statusKey = report.error_message?.toLowerCase().includes('cancelled') || report.error_message?.toLowerCase().includes('abort') 
        ? 'aborted' 
        : 'failed'
    } else {
      statusKey = 'processing'
    }
  } else if (status) {
    statusKey = status as StatusType
  }

  const config = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending
  const isAnimated = statusKey === 'processing' || statusKey === 'uploading'

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold transition-all ${config.bg} ${config.text} ${showBorder ? `border ${config.border}` : ''} ${className}`}
    >
      {showDot && (
        <span 
          className={`w-1.5 h-1.5 rounded-full ${isAnimated ? 'animate-pulse' : ''}`} 
          style={{ backgroundColor: 'currentColor' }} 
        />
      )}
      {config.label}
    </span>
  )
}

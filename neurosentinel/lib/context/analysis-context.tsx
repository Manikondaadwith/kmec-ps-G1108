'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'
import { createClient } from '@/lib/supabase/client'

export type CurrentAnalysis = {
  id: string
  filename: string
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'aborted'
  progress: number
  startedAt: string
} | null

interface AnalysisContextType {
  currentAnalysis: CurrentAnalysis
  setCurrentAnalysis: (analysis: CurrentAnalysis) => void
  abortAnalysis: () => Promise<void>
  refreshStatus: () => Promise<void>
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined)

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [currentAnalysis, setCurrentAnalysis] = useState<CurrentAnalysis>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  const refreshStatus = useCallback(async () => {
    try {
      // 1. Check local processing state via backend job/status
      const res = await fetch('/api/v1/job/status')
      if (res.ok) {
        const job = await res.json()
        if (job.status === 'running' || job.status === 'pending') {
          setCurrentAnalysis(prev => ({
            id: job.report_id || prev?.id || 'pending',
            filename: job.filename || prev?.filename || 'EEG File',
            status: 'processing',
            progress: prev?.progress || 0,
            startedAt: prev?.startedAt || new Date().toISOString(),
          }))
          return
        }
      }

      // 2. If backend is idle, but we had a processing analysis, check Supabase for its final status
      if (currentAnalysis?.status === 'processing') {
        const { data: report } = await supabase
          .from('reports')
          .select('status, filename')
          .eq('id', currentAnalysis.id)
          .maybeSingle()

        if (report) {
          const status = normalizeReportStatus(report.status)
          if (status === 'completed' || status === 'failed') {
            // It's finished
            setCurrentAnalysis(null)
          }
        } else {
          // Report not found or status unknown
          setCurrentAnalysis(null)
        }
      }
    } catch (error) {
      console.error('[AnalysisContext] Failed to refresh status:', error)
    }
  }, [currentAnalysis, supabase])

  const abortAnalysis = useCallback(async () => {
    if (!currentAnalysis) return

    try {
      await fetch('/api/v1/job/cancel', { method: 'POST' })
      setCurrentAnalysis(prev => prev ? { ...prev, status: 'aborted' } : null)
      
      // Brief delay to let the user see the aborted state before clearing
      setTimeout(() => setCurrentAnalysis(null), 3000)
    } catch (error) {
      console.error('[AnalysisContext] Failed to abort analysis:', error)
    }
  }, [currentAnalysis])

  // Initial and periodic polling
  useEffect(() => {
    refreshStatus()

    pollIntervalRef.current = setInterval(refreshStatus, 5000)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [refreshStatus])

  return (
    <AnalysisContext.Provider value={{ currentAnalysis, setCurrentAnalysis, abortAnalysis, refreshStatus }}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis() {
  const context = useContext(AnalysisContext)
  if (context === undefined) {
    throw new Error('useAnalysis must be used within an AnalysisProvider')
  }
  return context
}

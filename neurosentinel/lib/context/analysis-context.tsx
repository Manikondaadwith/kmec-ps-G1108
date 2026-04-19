'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { normalizeReportStatus } from '@/lib/neurosentinel/types'
import { createClient } from '@/lib/supabase/client'

export type CurrentAnalysis = {
  id: string
  filename: string
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'aborted'
  progress: number
  startedAt: string
} | null

export type ActiveAnalysisStatus = NonNullable<CurrentAnalysis>['status']

export function isUploadingAnalysis(status: ActiveAnalysisStatus | null | undefined) {
  return status === 'uploading'
}

export function getAnalysisStatusLabel(status: ActiveAnalysisStatus | null | undefined) {
  return isUploadingAnalysis(status) ? 'File Uploading' : 'Model Processing'
}

export function getAnalysisHeadline(status: ActiveAnalysisStatus | null | undefined) {
  return isUploadingAnalysis(status) ? 'File is uploading' : 'Clinical report is processing'
}

export function getAnalysisDescription(
  filename: string,
  status: ActiveAnalysisStatus | null | undefined
) {
  if (isUploadingAnalysis(status)) {
    return `${filename} is uploading securely. Keep this tab open if you want to monitor progress.`
  }

  return `${filename} is being analysed by NeuroSentinel AI. You can safely navigate away while the report finishes.`
}

export function getAnalysisActionLabel(status: ActiveAnalysisStatus | null | undefined) {
  return isUploadingAnalysis(status) ? 'Cancel Upload' : 'Abort Analysis'
}

interface AnalysisContextType {
  currentAnalysis: CurrentAnalysis
  setCurrentAnalysis: (analysis: CurrentAnalysis | ((prev: CurrentAnalysis) => CurrentAnalysis)) => void
  abortAnalysis: () => Promise<void>
  refreshStatus: () => Promise<void>
  registerAbortHandler: (handler: (() => Promise<void>) | null) => void
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined)

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [currentAnalysis, setCurrentAnalysis] = useState<CurrentAnalysis>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortHandlerRef = useRef<(() => Promise<void>) | null>(null)
  const cancelPendingRef = useRef(false)
  const supabase = createClient()

  const registerAbortHandler = useCallback((handler: (() => Promise<void>) | null) => {
    abortHandlerRef.current = handler
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      // 1. Check the backend job state through the frontend proxy.
      const res = await fetch('/api/job-status', { cache: 'no-store' })
      if (res.ok) {
        const job = await res.json()
        const jobRunning = job.status === 'running' || job.status === 'pending'

        // If a cancellation was just requested, suppress any temporary "still running"
        // rebound until the backend confirms the job is no longer active.
        if (cancelPendingRef.current) {
          if (!jobRunning) {
            cancelPendingRef.current = false
          }
          return
        }
        if (jobRunning) {
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
      cancelPendingRef.current = true

      if (abortHandlerRef.current) {
        await abortHandlerRef.current()
      } else if (currentAnalysis.status === 'processing') {
        const response = await fetch('/api/cancel', { method: 'POST' })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || 'Failed to cancel analysis.')
        }
      }

      setCurrentAnalysis(prev => prev ? { ...prev, status: 'aborted' } : null)
      setTimeout(() => {
        setCurrentAnalysis(prev => (prev?.status === 'aborted' ? null : prev))
      }, 1200)
    } catch (error) {
      cancelPendingRef.current = false
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
    <AnalysisContext.Provider value={{ currentAnalysis, setCurrentAnalysis, abortAnalysis, refreshStatus, registerAbortHandler }}>
      {children}
    </AnalysisContext.Provider>
  )
}

const ANALYSIS_NOOP_CONTEXT: AnalysisContextType = {
  currentAnalysis: null,
  setCurrentAnalysis: () => {},
  abortAnalysis: async () => {},
  refreshStatus: async () => {},
  registerAbortHandler: () => {},
}

export function useAnalysis() {
  const context = useContext(AnalysisContext)
  // Return safe no-op when used outside AnalysisProvider (e.g. root layout pages like /login, /terms)
  return context ?? ANALYSIS_NOOP_CONTEXT
}

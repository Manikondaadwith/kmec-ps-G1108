'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeReport, normalizeReportStatus, type ReportRecord } from '@/lib/neurosentinel/types'
import { useReportNotification } from '@/app/components/report-notification-provider'

type State =
  | { s: 'idle' }
  | { s: 'drag' }
  | { s: 'ready'; file: File }
  | { s: 'uploading'; file: File; msg: string }
  | { s: 'processing'; file: File; msg: string; reportId: string }
  | { s: 'complete'; file: File; reportId: string; msg: string }
  | { s: 'error'; file: File | null; msg: string }

const MAX_FILE_SIZE_MB = 150
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

export type UploadState = 'idle' | 'drag' | 'ready' | 'uploading' | 'processing' | 'complete' | 'error'

export function UploadZone({
  onAnalysisComplete,
  onReset,
  onUploadStateChange,
  shouldAutoRedirect = false,
}: {
  onAnalysisComplete: (data: ReportRecord) => void
  onReset: () => void
  onUploadStateChange?: (state: UploadState, filename?: string) => void
  shouldAutoRedirect?: boolean
}) {
  const [state, setState] = useState<State>({ s: 'idle' })
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCount = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()
  const { showNotification, dismissNotification } = useReportNotification()

  const updateState = useCallback((newState: State) => {
    setState(newState)
    onUploadStateChange?.(newState.s, 'file' in newState ? (newState as any).file?.name : undefined)
  }, [onUploadStateChange])

  const isValid = (file: File) => /\.edf$/i.test(file.name)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const resetUploadState = useCallback(() => {
    stopPolling()
    onReset()
    setUploadProgress(null)
    updateState({ s: 'idle' })
  }, [onReset, updateState, stopPolling])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const pickFile = useCallback(
    (file: File) => {
      resetUploadState()
      if (!isValid(file)) {
        updateState({ s: 'error', file: null, msg: 'Only .edf files are supported.' })
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        updateState({ s: 'error', file: null, msg: `File must be less than ${MAX_FILE_SIZE_MB} MB. Your file is ${formatSize(file.size)}.` })
        return
      }
      updateState({ s: 'ready', file })
    },
    [resetUploadState, updateState]
  )

  const reset = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    resetUploadState()
    if (inputRef.current) inputRef.current.value = ''
  }

  const cancelUpload = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    stopPolling()
    setUploadProgress(null)
    updateState({ s: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }

  /** Start polling supabase for report completion after backend returns processing */
  const startCompletionPolling = useCallback((reportId: string, file: File) => {
    stopPolling()
    const supabase = createClient()

    pollRef.current = setInterval(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: report } = await supabase
          .from('reports')
          .select('id, user_id, filename, status, summary, result_label, event_count, confidence_score, risk_level, quality_grade, duration_minutes, report_json, created_at, error_message')
          .eq('id', reportId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!report) return

        const status = normalizeReportStatus(report.status)

        if (status === 'completed') {
          stopPolling()
          const normalized = normalizeReport(report)
          onAnalysisComplete(normalized)
          setUploadProgress(null)

          // Check if user is on dashboard
          const onDashboard = window.location.pathname.startsWith('/dashboard') && !window.location.pathname.includes('/eeg-reports') && !window.location.pathname.includes('/settings')

          if (shouldAutoRedirect && onDashboard) {
            // Auto-redirect to report page — dismiss toast since we're navigating directly
            dismissNotification()
            router.push(`/report/${normalized.id}`)
          } else {
            // Show "Report Ready" notification on other pages
            showNotification({
              reportId: normalized.id,
              filename: file.name,
              status: 'completed',
              timestamp: Date.now(),
            })
            updateState({ s: 'complete', file, reportId: normalized.id, msg: normalized.summary || 'Your report is ready.' })
          }
        } else if (status === 'failed') {
          stopPolling()
          updateState({ s: 'error', file, msg: report.error_message || 'Analysis failed.' })
        }
        // else still processing — keep polling
      } catch (err) {
        console.error('[UploadZone] Polling error:', err)
      }
    }, 4000)
  }, [stopPolling, onAnalysisComplete, shouldAutoRedirect, router, showNotification, dismissNotification, updateState])

  /**
   * NEW ARCHITECTURE — bypasses Vercel's body-size limit:
   *   1. Upload the .edf directly to Supabase Storage (client-side)
   *   2. Send the resulting URL to the backend via a tiny JSON proxy route
   */
  const analyse = async () => {
    if (state.s !== 'ready') return
    const file = state.file

    updateState({ s: 'uploading', file, msg: 'Uploading the EDF to NeuroSentinel AI for analysis...' })
    setUploadProgress(0)

    // Show notification immediately so it persists cross-page even if user navigates away
    showNotification({
      reportId: '',
      filename: file.name,
      status: 'uploading',
      timestamp: Date.now(),
    })

    try {
      const supabase = createClient()

      // ── Step 1: Upload file directly to Supabase Storage ──
      const storagePath = `uploads/${Date.now()}_${file.name}`
      const abortController = new AbortController()
      abortRef.current = abortController

      // Use XMLHttpRequest for upload progress tracking to Supabase
      const uploadResult = await new Promise<{ path: string }>((resolve, reject) => {

        // We need the session for the auth header — get it async
        supabase.auth.getSession().then(({ data: { session: sess } }) => {
          if (!sess) {
            reject(new Error('You must be signed in to upload files.'))
            return
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
          const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
          const uploadUrl = `${supabaseUrl}/storage/v1/object/eeg-uploads/${storagePath}`

          const xhr = new XMLHttpRequest()

          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return
            const percent = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(percent)
            if (percent === 100) {
              updateState({ s: 'uploading', file, msg: 'Upload complete. Starting analysis...' })
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ path: storagePath })
            } else {
              let errMsg = `Upload to storage failed (${xhr.status})`
              try {
                const payload = JSON.parse(xhr.responseText)
                errMsg = payload?.message || payload?.error || errMsg
              } catch {}
              reject(new Error(errMsg))
            }
          }

          xhr.onerror = () => reject(new Error('Network error during file upload. Please check your connection.'))
          xhr.onabort = () => reject(new Error('Upload was cancelled.'))
          xhr.ontimeout = () => reject(new Error('Upload timed out. Please try again.'))

          xhr.timeout = 600_000 // 10 min for large files
          xhr.open('POST', uploadUrl)
          xhr.setRequestHeader('Authorization', `Bearer ${sess.access_token}`)
          xhr.setRequestHeader('apikey', supabaseAnonKey)
          xhr.setRequestHeader('x-upsert', 'true')
          xhr.send(file)

          // Wire up abort
          abortController.signal.addEventListener('abort', () => xhr.abort())
        }).catch(reject)
      })

      // ── Step 2: Get the public URL for the uploaded file ──
      const { data: urlData } = supabase.storage
        .from('eeg-uploads')
        .getPublicUrl(uploadResult.path)

      const fileUrl = urlData.publicUrl

      // ── Step 3: Send the URL to the backend via our lightweight proxy ──
      updateState({ s: 'uploading', file, msg: 'File uploaded. Sending to NeuroSentinel AI backend...' })

      const proxyResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_url: fileUrl, filename: file.name }),
      })

      if (!proxyResponse.ok) {
        let errorMessage = 'Backend rejected the analysis request.'
        try {
          const errPayload = await proxyResponse.json()
          errorMessage = errPayload?.error || errPayload?.detail || errorMessage
        } catch {}
        throw new Error(errorMessage)
      }

      const result = await proxyResponse.json() as {
        report_id: string
        status?: string
        report_json?: unknown
        summary?: string
      }

      const reportId = result.report_id
      const reportStatus = result.status || 'processing'

      if (reportStatus === 'completed') {
        // Synchronous path (legacy) — backend returned completed immediately
        const normalized = normalizeReport({
          id: reportId,
          filename: file.name,
          status: 'completed',
          storage_path: null,
          created_at: new Date().toISOString(),
          summary: result.summary || 'Your EEG report is ready to review.',
          report_json: result.report_json ?? null,
        })
        onAnalysisComplete(normalized)
        setUploadProgress(null)

        const onDashboard = window.location.pathname.startsWith('/dashboard') && !window.location.pathname.includes('/eeg-reports') && !window.location.pathname.includes('/settings')
        if (shouldAutoRedirect && onDashboard) {
          dismissNotification()
          router.push(`/report/${normalized.id}`)
        } else {
          showNotification({
            reportId: normalized.id,
            filename: file.name,
            status: 'completed',
            timestamp: Date.now(),
          })
        }
      } else {
        // Async path — backend is processing in background
        const normalized = normalizeReport({
          id: reportId,
          filename: file.name,
          status: 'processing',
          storage_path: null,
          created_at: new Date().toISOString(),
          summary: result.summary || 'Your EEG is being analysed in the background.',
          report_json: null,
        })
        onAnalysisComplete(normalized)
        setUploadProgress(null)
        updateState({ s: 'processing', file, msg: 'Your EEG is being analysed. You can safely close this page — we\'ll email you the report when it\'s ready.', reportId })

        // Show processing notification
        showNotification({
          reportId,
          filename: file.name,
          status: 'processing',
          timestamp: Date.now(),
        })

        // Start polling to detect completion
        startCompletionPolling(reportId, file)
      }
    } catch (analysisError: any) {
      console.error('[UploadZone] Analysis error:', analysisError)
      setUploadProgress(null)

      // The backend may have created the report but crashed.
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: latestReport } = await supabase
            .from('reports')
            .select('id, filename, status, summary, result_label, event_count, confidence_score, risk_level, quality_grade, duration_minutes, report_json, created_at')
            .eq('user_id', user.id)
            .eq('filename', file.name)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (latestReport && (latestReport.status === 'completed' || latestReport.status === 'processing')) {
            const normalized = normalizeReport(latestReport)
            onAnalysisComplete(normalized)
            if (latestReport.status === 'processing') {
              updateState({ s: 'processing', file, msg: 'Analysis is running in the background.', reportId: normalized.id })
              startCompletionPolling(normalized.id, file)
            } else {
              showNotification({
                reportId: normalized.id,
                filename: file.name,
                status: 'completed',
                timestamp: Date.now(),
              })
            }
            return
          }
        }
      } catch {}

      updateState({ s: 'error', file, msg: analysisError.message || 'Analysis failed before the report could be generated.' })
    }
  }

  const dragging = state.s === 'drag'

  return (
    <section>
      <div
        id="upload-drop-zone"
        className="relative overflow-hidden rounded-[28px] border px-6 py-8 transition-all duration-150 md:px-8 md:py-10"
        style={{
          minHeight: 280,
          borderStyle: 'dashed',
          borderColor: dragging ? '#00F0FF' : 'rgba(0,240,255,0.18)',
          background: dragging ? 'rgba(0,240,255,0.06)' : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
          boxShadow: dragging ? '0 0 0 1px rgba(0,240,255,0.28), 0 0 24px rgba(0,240,255,0.2)' : 'inset 0 0 30px rgba(0,240,255,0.03)',
          cursor: state.s === 'idle' || state.s === 'drag' ? 'pointer' : 'default',
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          dragCount.current += 1
          setState({ s: 'drag' })
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          dragCount.current -= 1
          if (dragCount.current <= 0) setState({ s: 'idle' })
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          dragCount.current = 0
          const file = event.dataTransfer.files[0]
          if (file) pickFile(file)
          else setState({ s: 'idle' })
        }}
        onClick={() => {
          if (state.s === 'idle' || state.s === 'drag') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          accept=".edf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) pickFile(file)
          }}
        />

        {(state.s === 'idle' || state.s === 'drag') && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-3xl border"
              style={{ borderColor: 'rgba(0,240,255,0.18)', background: 'rgba(255,255,255,0.03)' }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="mt-6 text-2xl font-semibold" style={{ color: dragging ? 'var(--accent-primary)' : 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
              {dragging ? 'Release your EDF file here' : 'Drop your EDF file here'}
            </h3>
            <p className="mt-2 text-base" style={{ color: 'var(--text-secondary)' }}>
              or click to browse
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="rounded-full border px-3 py-1" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>.edf</span>
              <span>Up to {MAX_FILE_SIZE_MB} MB — uploads go directly to secure cloud storage.</span>
            </div>
          </div>
        )}

        {state.s === 'ready' && (
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                Ready to analyse
              </div>
              <div className="mt-3 text-2xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {state.file.name}
              </div>
              <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {formatSize(state.file.size)} | EDF recording detected
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  reset()
                }}
                className="rounded-xl border px-4 py-3 text-sm font-medium text-[#E8E8F0]"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
              >
                Choose another file
              </button>
              <button
                id="btn-analyse"
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  void analyse()
                }}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-[#0A0A0F]"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-warning))', boxShadow: '0 0 16px rgba(0,240,255,0.18)' }}
              >
                Start Analysis
              </button>
            </div>
          </div>
        )}

        {(state.s === 'uploading' || state.s === 'processing') && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#00F0FF transparent transparent transparent' }} />
            <div className="mt-5 text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
              {state.s === 'processing' ? 'Analysing your EEG report' : 'Uploading your EEG file'}
            </div>
            <div className="mt-2 max-w-md text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
              {state.msg}
            </div>

            {uploadProgress !== null ? (
              <div className="mt-5 w-full max-w-md px-2">
                <div className="mb-1.5 flex justify-between text-xs text-[#8888A0]">
                  <span>{state.s === 'processing' ? 'Upload complete — analysing in background' : 'Uploading EDF to secure storage...'}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#1A1A28]">
                  <div className="h-full rounded-full bg-[#00F0FF] transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : state.s === 'processing' ? (
              <div className="mt-5 w-full max-w-md px-2">
                <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#1A1A28]">
                  <div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #00F0FF, rgba(255,184,0,0.8))', animation: 'progressIndeterminate 1.8s ease-in-out infinite', width: '50%' }} />
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                cancelUpload()
              }}
              className="mt-5 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all hover:bg-[rgba(255,51,102,0.08)]"
              style={{ borderColor: 'rgba(255,51,102,0.25)', color: '#FF3366' }}
            >
              Cancel
            </button>
          </div>
        )}

        {state.s === 'complete' && (
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-success)' }}>
                Report ready
              </div>
              <div className="mt-3 text-2xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                {state.file.name}
              </div>
              <div className="mt-2 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                {state.msg}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  router.push(`/report/${state.reportId}`)
                }}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-[#0A0A0F]"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-warning))', boxShadow: '0 0 16px rgba(0,240,255,0.18)' }}
              >
                View Report
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  reset()
                }}
                className="rounded-xl border px-4 py-3 text-sm font-medium text-[#E8E8F0]"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
              >
                Upload another EDF
              </button>
            </div>
          </div>
        )}

        {state.s === 'error' && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="text-xl font-semibold" style={{ color: 'var(--accent-danger)', fontFamily: "'Outfit', sans-serif" }}>
              Analysis failed
            </div>
            <div className="mt-2 max-w-md text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
              {state.msg}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  resetUploadState()
                  if (inputRef.current) inputRef.current.value = ''
                  window.setTimeout(() => inputRef.current?.click(), 50)
                }}
                className="whitespace-nowrap rounded border border-[#00F0FF]/40 px-3 py-1.5 text-xs text-[#00F0FF] transition-colors hover:bg-[#00F0FF]/10"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  reset()
                }}
                className="rounded-xl border px-4 py-3 text-sm font-medium text-[#E8E8F0]"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

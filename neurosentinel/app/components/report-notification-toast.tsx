'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeReportStatus } from '@/lib/neurosentinel/types'
import { useReportNotification } from './report-notification-provider'

export function ReportNotificationToast() {
  const { notification, showNotification, dismissNotification } = useReportNotification()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pathname = usePathname()

  // Determine if user is currently on the main dashboard upload page
  const isOnDashboard = pathname === '/dashboard'

  // Poll for completion when notification is in "processing" or "uploading" state
  useEffect(() => {
    const isPollingState = notification?.status === 'processing' || notification?.status === 'uploading'

    if (!notification || !isPollingState) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    const supabase = createClient()
    pollRef.current = setInterval(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // If we have a reportId, query by ID. Otherwise query latest report by filename.
        let report: { id: string; status: string } | null = null

        if (notification.reportId) {
          const { data } = await supabase
            .from('reports')
            .select('id, status')
            .eq('id', notification.reportId)
            .eq('user_id', user.id)
            .maybeSingle()
          report = data
        } else if (notification.filename) {
          // During 'uploading' state we don't have a reportId yet — poll by filename
          const { data } = await supabase
            .from('reports')
            .select('id, status')
            .eq('user_id', user.id)
            .eq('filename', notification.filename)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          report = data
        }

        if (!report) return
        const status = normalizeReportStatus(report.status)

        if (status === 'completed') {
          showNotification({
            reportId: report.id,
            filename: notification.filename,
            status: 'completed',
            timestamp: Date.now(),
          })
        } else if (status === 'failed') {
          showNotification({
            reportId: report.id,
            filename: notification.filename,
            status: 'failed',
            timestamp: Date.now(),
          })
        } else if (status === 'processing' && notification.status === 'uploading') {
          // Transition from uploading → processing with real reportId
          showNotification({
            reportId: report.id,
            filename: notification.filename,
            status: 'processing',
            timestamp: Date.now(),
          })
        }
      } catch (err) {
        console.error('[Toast] Polling error:', err)
      }
    }, 5000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [notification, showNotification])

  if (!notification) return null

  // Never show any toast on the main dashboard — the UploadZone handles all
  // progress/status UI there. All pages OTHER than /dashboard will receive toasts.
  if (isOnDashboard) return null

  const isSuccess = notification.status === 'completed'
  const isFailed = notification.status === 'failed'
  const isInProgress = notification.status === 'uploading' || notification.status === 'processing'

  const accentColor = isSuccess ? '#00FF88' : isFailed ? '#FF3366' : '#00F0FF'
  const statusLabel = isSuccess
    ? 'Report Ready'
    : isFailed
      ? 'Analysis Failed'
      : notification.status === 'uploading'
        ? 'Uploading EEG...'
        : 'Analysing EEG...'

  return (
    <div
      className="fixed right-5 top-5 z-[9999] flex flex-col gap-2 rounded-2xl border px-4 py-3 shadow-2xl"
      style={{
        background: 'rgba(10,10,15,0.96)',
        backdropFilter: 'blur(24px)',
        borderColor: `${accentColor}30`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 20px ${accentColor}12`,
        minWidth: 280,
        animation: 'slideInRight 0.4s ease',
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${isInProgress ? 'animate-pulse' : ''}`}
          style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}70` }}
        />

        {/* Status + filename */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: accentColor }}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[10px]" style={{ color: '#8888A0' }}>
            {notification.filename}
          </div>
        </div>

        {/* Dismiss X */}
        <button
          type="button"
          onClick={dismissNotification}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm transition-colors hover:bg-[rgba(255,255,255,0.08)]"
          style={{ color: '#8888A0' }}
        >
          ×
        </button>
      </div>

      {/* Background processing reassurance */}
      {isInProgress ? (
        <div className="text-[10px] leading-4" style={{ color: '#8888A0' }}>
          {notification.status === 'uploading'
            ? 'Your EEG is being uploaded. You can navigate freely — we\'ll notify you when analysis is complete.'
            : 'Your EEG is being analysed. You can navigate freely — we\'ll notify you when it\'s ready.'}
        </div>
      ) : null}

      {/* Progress bar for in-progress states */}
      {isInProgress ? (
        <div className="w-full overflow-hidden rounded-full" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${accentColor}, rgba(255,184,0,0.8))`,
              animation: 'progressIndeterminate 1.8s ease-in-out infinite',
              width: '50%',
            }}
          />
        </div>
      ) : null}

      {/* Action buttons for completed state */}
      {isSuccess && notification.reportId ? (
        <div className="flex items-center gap-2 pt-0.5">
          <Link
            href={`/report/${notification.reportId}`}
            onClick={dismissNotification}
            className="flex-1 rounded-lg px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-90"
            style={{ background: accentColor, color: '#0A0A0F' }}
          >
            View Report
          </Link>
          <button
            type="button"
            onClick={dismissNotification}
            className="rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#8888A0' }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Dismiss button for failed state */}
      {isFailed ? (
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={dismissNotification}
            className="flex-1 rounded-lg border px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{ borderColor: 'rgba(255,51,102,0.25)', color: '#FF3366' }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}

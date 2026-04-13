'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type ReportNotification = {
  reportId: string
  filename: string
  status: 'uploading' | 'processing' | 'completed' | 'failed'
  timestamp: number
}

type NotificationCtx = {
  notification: ReportNotification | null
  showNotification: (n: ReportNotification) => void
  dismissNotification: () => void
}

const ReportNotificationContext = createContext<NotificationCtx>({
  notification: null,
  showNotification: () => {},
  dismissNotification: () => {},
})

export function useReportNotification() {
  return useContext(ReportNotificationContext)
}

export function ReportNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notification, setNotification] = useState<ReportNotification | null>(null)

  const showNotification = useCallback((n: ReportNotification) => {
    setNotification(n)
  }, [])

  const dismissNotification = useCallback(() => {
    setNotification(null)
  }, [])

  return (
    <ReportNotificationContext.Provider value={{ notification, showNotification, dismissNotification }}>
      {children}
    </ReportNotificationContext.Provider>
  )
}

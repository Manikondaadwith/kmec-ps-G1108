'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createOptimisticScoutMessage,
  type ReportRecord,
  type ScoutContextPayload,
  type ScoutMessage,
  type ScoutPageContext,
} from '@/lib/neurosentinel/types'

type ConversationState = {
  messages: ScoutMessage[]
  loading: boolean
  error: string | null
  loaded: boolean
  hasUnread: boolean
}

type FloatingConversationRequest = {
  page: ScoutPageContext
  role?: ScoutContextPayload['role']
  reportId?: string | null
  currentReport?: ReportRecord | null
  initialMessage: string
  token: string
}

type ContextValue = {
  conversations: Record<string, ConversationState>
  ensureConversation: (page: ScoutPageContext, reportId: string | null | undefined, initialMessage: string) => Promise<void>
  sendMessage: (options: {
    page: ScoutPageContext
    role?: ScoutContextPayload['role']
    reportId?: string | null
    currentReport?: ReportRecord | null
    initialMessage: string
    content: string
    silent?: boolean
  }) => Promise<void>
  stopMessage: (page: ScoutPageContext, reportId: string | null | undefined) => void
  markRead: (page: ScoutPageContext, reportId: string | null | undefined) => void
  floatingConversation: FloatingConversationRequest | null
  presentFloatingConversation: (options: Omit<FloatingConversationRequest, 'token'>) => void
}

const ScoutContext = createContext<ContextValue | null>(null)

function getConversationKey() {
  return 'global_scout'
}

function getSeedMessages(page: ScoutPageContext, reportId: string | null | undefined, initialMessage: string) {
  const trimmed = initialMessage.trim()
  return trimmed ? [createOptimisticScoutMessage('assistant', trimmed, reportId, page)] : []
}

function serializeReport(report: ReportRecord | null | undefined) {
  if (!report) return null

  return {
    id: report.id,
    filename: report.filename,
    status: report.status,
    summary: report.summary,
    result_label: report.result_label,
    event_count: report.event_count,
    confidence_score: report.confidence_score,
    risk_level: report.risk_level,
    quality_grade: report.quality_grade,
    duration_minutes: report.duration_minutes,
    report_json: report.report_json,
    created_at: report.created_at,
  }
}

export function ScoutProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Record<string, ConversationState>>({})
  const [floatingConversation, setFloatingConversation] = useState<FloatingConversationRequest | null>(null)
  const loadingRef = useRef<Record<string, boolean>>({})
  const abortControllersRef = useRef<Record<string, AbortController | null>>({})
  const sessionIdRef = useRef<string | null>(null)

  // ── Clear all conversations on sign-out / sign-in ──
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null
      const prevSessionId = sessionIdRef.current

      if (event === 'SIGNED_OUT' || !newUserId) {
        // User signed out — purge everything
        sessionIdRef.current = null
        setConversations({})
        setFloatingConversation(null)
        loadingRef.current = {}
        Object.values(abortControllersRef.current).forEach((c) => c?.abort())
        abortControllersRef.current = {}
        return
      }

      // Different user signed in, or fresh sign-in after being signed out
      if (newUserId && newUserId !== prevSessionId) {
        sessionIdRef.current = newUserId
        setConversations({})
        setFloatingConversation(null)
        loadingRef.current = {}
        Object.values(abortControllersRef.current).forEach((c) => c?.abort())
        abortControllersRef.current = {}
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const ensureConversation = useCallback(async (page: ScoutPageContext, reportId: string | null | undefined, initialMessage: string) => {
    const key = getConversationKey()
    if (loadingRef.current[key]) return
    if (conversations[key]?.loaded) return

    loadingRef.current[key] = true

    // Session-specific: don't load previous chat history from DB.
    // Start every session fresh with just the initial greeting.
    setConversations((current) => ({
      ...current,
      [key]: {
        messages: getSeedMessages(page, reportId, initialMessage),
        loading: false,
        error: null,
        loaded: true,
        hasUnread: false,
      },
    }))

    loadingRef.current[key] = false
  }, [conversations])

  const sendMessage = useCallback<ContextValue['sendMessage']>(async ({ page, role = null, reportId = null, currentReport = null, initialMessage, content, silent = false }) => {
    const trimmed = content.trim()
    if (!trimmed) return

    const key = getConversationKey()
    await ensureConversation(page, reportId, initialMessage)

    // When silent=true (auto-summarize), don't show the user message in the chat
    if (!silent) {
      setConversations((current) => {
        const existing = current[key] ?? {
          messages: getSeedMessages(page, reportId, initialMessage),
          loading: false,
          error: null,
          loaded: true,
          hasUnread: false,
        }
        return {
          ...current,
          [key]: {
            ...existing,
            messages: [...existing.messages, createOptimisticScoutMessage('user', trimmed, reportId, page)],
            loading: true,
            error: null,
            loaded: true,
          },
        }
      })
    } else {
      // Still set loading state but don't add user message
      setConversations((current) => {
        const existing = current[key] ?? {
          messages: getSeedMessages(page, reportId, initialMessage),
          loading: false,
          error: null,
          loaded: true,
          hasUnread: false,
        }
        return {
          ...current,
          [key]: { ...existing, loading: true, error: null, loaded: true },
        }
      })
    }

    try {
      const latestState = conversations[key]
      const optimisticMessages = [
        ...(latestState?.messages ?? getSeedMessages(page, reportId, initialMessage)),
        createOptimisticScoutMessage('user', trimmed, reportId, page),
      ]

      abortControllersRef.current[key]?.abort()
      const controller = new AbortController()
      abortControllersRef.current[key] = controller

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: optimisticMessages.map((message) => ({ role: message.role, content: message.content })),
          context: {
            page,
            role,
            report_id: reportId,
            current_report: serializeReport(currentReport),
          },
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'SCOUT could not respond right now.')
      }

      setConversations((current) => {
        const existing = current[key]
        const assistantMessage = createOptimisticScoutMessage(
          'assistant',
          typeof payload.message === 'string' && payload.message.trim() ? payload.message : 'I do not have a reliable answer yet.',
          reportId,
          page
        )
        return {
          ...current,
          [key]: {
            ...(existing ?? { messages: optimisticMessages, loading: false, error: null, loaded: true, hasUnread: false }),
            messages: [...(existing?.messages ?? optimisticMessages), assistantMessage],
            loading: false,
            error: null,
            loaded: true,
            hasUnread: true, // New message arrived
          },
        }
      })
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError'
      setConversations((current) => ({
        ...current,
        [key]: {
          ...(current[key] ?? { messages: [], loading: false, error: null, loaded: true, hasUnread: false }),
          messages: [
            ...((current[key] ?? { messages: [] }).messages || []),
            createOptimisticScoutMessage(
              'assistant',
              isAbort ? 'Stopped.' : error?.message || 'SCOUT could not respond right now. Try again.',
              reportId,
              page,
              !isAbort
            ),
          ],
          loading: false,
          error: null,
          loaded: true,
          hasUnread: !isAbort, // Only mark as unread if it wasn't an intentional stop
        },
      }))
    } finally {
      abortControllersRef.current[key] = null
    }
  }, [conversations, ensureConversation])

  const stopMessage = useCallback((page: ScoutPageContext, reportId: string | null | undefined) => {
    const key = getConversationKey()
    abortControllersRef.current[key]?.abort()
  }, [])

  const markRead = useCallback((page: ScoutPageContext, reportId: string | null | undefined) => {
    const key = getConversationKey()
    setConversations((current) => {
      const existing = current[key]
      if (!existing || !existing.hasUnread) return current
      return {
        ...current,
        [key]: { ...existing, hasUnread: false },
      }
    })
  }, [])

  const value = useMemo<ContextValue>(
    () => ({
      conversations,
      ensureConversation,
      sendMessage,
      stopMessage,
      markRead,
      floatingConversation,
      presentFloatingConversation: (options) => {
        setFloatingConversation({
          ...options,
          token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        })
      },
    }),
    [conversations, ensureConversation, floatingConversation, sendMessage, stopMessage, markRead]
  )

  return <ScoutContext.Provider value={value}>{children}</ScoutContext.Provider>
}

export function useScoutFloatingConversation() {
  const context = useContext(ScoutContext)

  if (!context) {
    throw new Error('useScoutFloatingConversation must be used inside ScoutProvider.')
  }

  return {
    floatingConversation: context.floatingConversation,
    presentFloatingConversation: context.presentFloatingConversation,
  }
}

export function useScoutConversation({
  page,
  role = null,
  reportId = null,
  currentReport = null,
  initialMessage,
}: {
  page: ScoutPageContext
  role?: ScoutContextPayload['role']
  reportId?: string | null
  currentReport?: ReportRecord | null
  initialMessage: string
}) {
  const context = useContext(ScoutContext)

  if (!context) {
    throw new Error('useScoutConversation must be used inside ScoutProvider.')
  }

  const key = getConversationKey()
  const state = context.conversations[key] ?? {
    messages: getSeedMessages(page, reportId, initialMessage),
    loading: false,
    error: null,
    loaded: false,
    hasUnread: false,
  }

  useEffect(() => {
    void context.ensureConversation(page, reportId, initialMessage)
  }, [context, initialMessage, page, reportId])

  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    hasUnread: state.hasUnread,
    sendMessage: (content: string, silent?: boolean) => context.sendMessage({ page, role, reportId, currentReport, initialMessage, content, silent }),
    stopMessage: () => context.stopMessage(page, reportId),
    markRead: () => context.markRead(page, reportId),
  }
}

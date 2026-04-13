'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ScoutAvatar } from './scout-avatar'
import { ScoutConversation } from './scout-conversation'
import { ensureUserProfile } from '@/lib/user-profile'
import { useScoutFloatingConversation } from './scout-provider'
import {
  SCOUT_FULL_NAME,
  getQuickPrompts,
  getScoutInitialMessage,
  normalizeScoutRole,
  type ScoutPageContext,
  type ScoutRole,
} from '@/lib/scout-guide'
import type { ReportRecord } from '@/lib/neurosentinel/types'

const STORAGE_KEY = 'ns-scout-floating-layout'
const MIN_WIDTH = 280
const MIN_HEIGHT = 320
const MAX_WIDTH = 600

type FloatingLayout = {
  left: number
  top: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getDefaultLayout(): FloatingLayout {
  if (typeof window === 'undefined') {
    return { left: 0, top: 0, width: 380, height: 520 }
  }

  const width = 380
  const height = Math.min(520, Math.floor(window.innerHeight * 0.8))
  return {
    left: window.innerWidth - width - 24,
    top: window.innerHeight - height - 108,
    width,
    height,
  }
}

function normalizeLayout(layout: FloatingLayout): FloatingLayout {
  if (typeof window === 'undefined') return layout

  const maxHeight = Math.floor(window.innerHeight * 0.8)
  const width = clamp(layout.width, MIN_WIDTH, MAX_WIDTH)
  const height = clamp(layout.height, MIN_HEIGHT, maxHeight)
  const left = clamp(layout.left, 12, Math.max(12, window.innerWidth - width - 12))
  const top = clamp(layout.top, 12, Math.max(12, window.innerHeight - height - 12))

  return { left, top, width, height }
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

export function ScoutFloating() {
  const pathname = usePathname()
  const supabase = createClient()
  const { floatingConversation } = useScoutFloatingConversation()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [role, setRole] = useState<ScoutRole>(null)
  const [layout, setLayout] = useState<FloatingLayout>(() => getDefaultLayout())
  const [session, setSession] = useState<{
    page: ScoutPageContext
    role?: ScoutRole
    reportId?: string | null
    currentReport?: ReportRecord | null
    initialMessage: string
  } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null)
  const userIdRef = useRef<string | null>(null)

  const hidden = pathname === '/' || pathname === '/login' || pathname === '/onboarding' || pathname.startsWith('/report/')

  const pageContext = useMemo<ScoutPageContext>(() => {
    if (pathname === '/dashboard/settings') return 'settings'
    if (pathname.startsWith('/dashboard')) return 'dashboard'
    return 'general'
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as FloatingLayout
      setLayout(normalizeLayout(parsed))
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLayout(layout)))
  }, [layout])

  useEffect(() => {
    if (hidden) return

    async function loadRole() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user || (pageContext !== 'dashboard' && pageContext !== 'settings')) {
          setRole(null)
          return
        }

        const profile = await ensureUserProfile(supabase, user)
        setRole(normalizeScoutRole(profile.role))
      } catch (error) {
        console.error('[ScoutFloating] Failed to load role:', error)
        setRole(null)
      }
    }

    void loadRole()
  }, [hidden, pageContext, supabase])

  useEffect(() => {
    if (!floatingConversation) return

    setSession({
      page: floatingConversation.page,
      role: floatingConversation.role ?? null,
      reportId: floatingConversation.reportId ?? null,
      currentReport: floatingConversation.currentReport ?? null,
      initialMessage: floatingConversation.initialMessage,
    })
    setOpen(true)
    setMinimized(false)
  }, [floatingConversation])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null
      if (!nextUserId || (userIdRef.current && userIdRef.current !== nextUserId)) {
        setSession(null)
        setOpen(false)
        setMinimized(false)
        setRole(null)
      }
      userIdRef.current = nextUserId
    })

    void supabase.auth.getUser().then(({ data: { user } }) => {
      userIdRef.current = user?.id ?? null
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    const handleResize = () => setLayout((current) => normalizeLayout(current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handlePointerUp = () => {
      resizeRef.current = null
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeRef.current) return

      const maxHeight = Math.floor(window.innerHeight * 0.8)
      const nextWidth = clamp(resizeRef.current.width + (event.clientX - resizeRef.current.startX), MIN_WIDTH, MAX_WIDTH)
      const nextHeight = clamp(resizeRef.current.height + (event.clientY - resizeRef.current.startY), MIN_HEIGHT, maxHeight)
      setLayout((current) => normalizeLayout({ ...current, width: nextWidth, height: nextHeight }))
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const offsetX = event.clientX - layout.left
    const offsetY = event.clientY - layout.top

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setLayout((current) =>
        normalizeLayout({
          ...current,
          left: moveEvent.clientX - offsetX,
          top: moveEvent.clientY - offsetY,
        })
      )
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    if (!touch) return

    const offsetX = touch.clientX - layout.left
    const offsetY = touch.clientY - layout.top

    const handleTouchMove = (touchEvent: TouchEvent) => {
      const nextTouch = touchEvent.touches[0]
      if (!nextTouch) return
      touchEvent.preventDefault()
      setLayout((current) =>
        normalizeLayout({
          ...current,
          left: nextTouch.clientX - offsetX,
          top: nextTouch.clientY - offsetY,
        })
      )
    }

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
  }

  const activeSession = session ?? {
    page: pageContext,
    role,
    reportId: null,
    currentReport: null,
    initialMessage: getScoutInitialMessage(role, pageContext),
  }

  const quickPrompts = getQuickPrompts(activeSession.page)

  if (hidden) return null

  return (
    <>
      {!open || minimized ? (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <button
            type="button"
            onClick={() => {
              setSession((current) => current ?? activeSession)
              setOpen(true)
              setMinimized(false)
            }}
            className="relative rounded-full scout-idle"
            aria-label={`Open ${SCOUT_FULL_NAME}`}
          >
            <ScoutAvatar size={58} pulse />
          </button>
        </div>
      ) : null}

      {open && !minimized ? (
        <div
          className="fixed z-[9998] flex flex-col overflow-hidden rounded-[24px] border"
          style={{
            left: layout.left,
            top: layout.top,
            width: layout.width,
            height: layout.height,
            background: 'linear-gradient(180deg, rgba(14,16,24,0.98), rgba(8,10,15,0.98))',
            borderColor: 'rgba(0,240,255,0.16)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
          }}
        >
          <div
            className="sticky top-0 z-30 shrink-0 select-none flex cursor-move items-center justify-between border-b px-4 py-3 backdrop-blur"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(18,18,26,0.92)' }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                Floating Assistant
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Drag to move. Use the corner grip to resize.
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="rounded p-1.5 transition-colors hover:bg-white/10"
                aria-label="Minimize"
                title="Minimize"
                style={{ color: 'var(--text-secondary)' }}
              >
                <MinusIcon />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setMinimized(false)
                }}
                className="rounded p-1.5 transition-colors hover:bg-white/10"
                aria-label="Close"
                title="Close"
                style={{ color: 'var(--text-secondary)' }}
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <ScoutConversation
              page={activeSession.page}
              role={activeSession.role ?? null}
              reportId={activeSession.reportId ?? null}
              currentReport={activeSession.currentReport ?? null}
              initialMessage={activeSession.initialMessage}
              quickPrompts={quickPrompts}
              title={SCOUT_FULL_NAME}
              subtitle={
                activeSession.reportId
                  ? 'Report Assistant'
                  : activeSession.page === 'dashboard'
                    ? 'Dashboard Assistant'
                    : activeSession.page === 'settings'
                      ? 'Settings Assistant'
                      : 'Assistant'
              }
              placeholder="Ask SCOUT..."
            />
          </div>

          <button
            type="button"
            aria-label="Resize SCOUT window"
            className="absolute bottom-1 right-1 z-30 h-5 w-5 cursor-se-resize rounded"
            onPointerDown={(event) => {
              event.stopPropagation()
              resizeRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                width: layout.width,
                height: layout.height,
              }
            }}
            style={{
              background:
                'linear-gradient(135deg, transparent 0 35%, rgba(0,240,255,0.24) 35% 55%, transparent 55% 100%)',
            }}
          />
        </div>
      ) : null}
    </>
  )
}

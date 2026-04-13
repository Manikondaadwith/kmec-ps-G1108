'use client'

import { useEffect, useRef, useState } from 'react'
import { ScoutConversation } from './scout-conversation'
import { SCOUT_FULL_NAME, getQuickPrompts, type ScoutPageContext, type ScoutRole } from '@/lib/scout-guide'
import type { ReportRecord } from '@/lib/neurosentinel/types'

type ScoutPanelProps = {
  page: ScoutPageContext
  role?: ScoutRole
  initialMessage: string
  report?: ReportRecord | null
  collapsible?: boolean
  defaultCollapsed?: boolean
  width?: number
  autoPrompt?: { content: string; visible: boolean } | null
  resizable?: boolean
}

const MIN_HEIGHT = 480
const MAX_HEIGHT_VH = 0.85

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function ScoutPanel({
  page,
  role = null,
  initialMessage,
  report = null,
  collapsible = false,
  defaultCollapsed = false,
  width = 320,
  autoPrompt = null,
  resizable = false,
}: ScoutPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const autoPromptRef = useRef<string | null>(null)
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null)

  // Auto-expand when a new report prompt is queued.
  useEffect(() => {
    const promptKey = autoPrompt?.content.trim() ? `${page}:${report?.id ?? 'none'}:${autoPrompt.content}` : null
    if (promptKey && autoPromptRef.current !== promptKey) {
      autoPromptRef.current = promptKey
      setCollapsed(false)
    }
  }, [autoPrompt, page, report?.id])

  // Resize handling
  useEffect(() => {
    if (!resizable) return

    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeRef.current) return
      const maxH = Math.floor(window.innerHeight * MAX_HEIGHT_VH)
      const delta = event.clientY - resizeRef.current.startY
      const nextH = clamp(resizeRef.current.startHeight + delta, MIN_HEIGHT, maxH)
      setPanelHeight(nextH)
    }

    const handlePointerUp = () => {
      resizeRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizable])

  if (collapsed && collapsible) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="group flex h-full w-9 shrink-0 items-center justify-center rounded-2xl border"
        style={{
          background: 'rgba(10,10,15,0.92)',
          borderColor: 'rgba(0,240,255,0.18)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--accent-primary)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          SCOUT
        </span>
      </button>
    )
  }

  const computedHeight = panelHeight ?? (resizable ? Math.min(640, Math.floor(typeof window !== 'undefined' ? window.innerHeight * 0.75 : 640)) : undefined)

  return (
    <aside
      className="relative flex flex-col rounded-3xl border"
      style={{
        width,
        height: computedHeight,
        minHeight: resizable ? MIN_HEIGHT : 560,
        background: 'linear-gradient(180deg, rgba(10,10,15,0.96), rgba(16,18,26,0.94))',
        borderColor: 'rgba(0,240,255,0.12)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.38)',
      }}
    >
      <ScoutConversation
        page={page}
        role={role}
        reportId={report?.id ?? null}
        currentReport={report}
        initialMessage={initialMessage}
        quickPrompts={getQuickPrompts(page)}
        title={SCOUT_FULL_NAME}
        subtitle="Inline Report Explainer"
        placeholder="Ask SCOUT about this report..."
        autoPrompt={autoPrompt}
      />

      {collapsible ? (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="w-full rounded-xl border px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--text-muted)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            Collapse
          </button>
        </div>
      ) : null}

      {/* Resize grip */}
      {resizable ? (
        <button
          type="button"
          aria-label="Resize SCOUT panel"
          className="absolute bottom-1 right-1 z-30 h-5 w-5 cursor-s-resize rounded"
          onPointerDown={(event) => {
            event.stopPropagation()
            const container = (event.target as HTMLElement).closest('aside')
            resizeRef.current = {
              startY: event.clientY,
              startHeight: container?.getBoundingClientRect().height ?? computedHeight ?? 640,
            }
          }}
          style={{
            background:
              'linear-gradient(135deg, transparent 0 35%, rgba(0,240,255,0.24) 35% 55%, transparent 55% 100%)',
          }}
        />
      ) : null}
    </aside>
  )
}

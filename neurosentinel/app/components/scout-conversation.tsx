'use client'

import { useEffect, useRef, useState } from 'react'
import { ScoutAvatar } from './scout-avatar'
import { useScoutConversation } from './scout-provider'
import { type ReportRecord, type ScoutPageContext, type ScoutRole } from '@/lib/neurosentinel/types'

function cleanMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, (match) => match)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type ScoutConversationProps = {
  page: ScoutPageContext
  role?: ScoutRole
  reportId?: string | null
  currentReport?: ReportRecord | null
  initialMessage: string
  quickPrompts: string[]
  title: string
  subtitle: string
  placeholder?: string
  autoPrompt?: { content: string; visible: boolean } | null
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

export function ScoutConversation({
  page,
  role = null,
  reportId = null,
  currentReport = null,
  initialMessage,
  quickPrompts,
  title,
  subtitle,
  placeholder = 'Ask SCOUT...',
  autoPrompt = null,
}: ScoutConversationProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const { messages, loading, error, sendMessage, stopMessage } = useScoutConversation({
    page,
    role,
    reportId,
    currentReport,
    initialMessage,
  })

  // Stable ref for sendMessage — avoids the effect cleanup canceling pending auto-prompts
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-send summary request — bulletproof approach using interval
  const didAutoSend = useRef<string | null>(null)

  useEffect(() => {
    if (!autoPrompt?.content) return

    const key = reportId ?? currentReport?.id ?? 'none'
    if (didAutoSend.current === key) return

    // Poll until loading is false, then fire
    const interval = window.setInterval(() => {
      // Check loading via ref to avoid stale closure
      if (didAutoSend.current === key) {
        window.clearInterval(interval)
        return
      }
      // sendMessageRef.current gives us the latest sendMessage
      didAutoSend.current = key
      window.clearInterval(interval)
      sendMessageRef.current(autoPrompt.content, false)
    }, 800)

    return () => window.clearInterval(interval)
  }, [autoPrompt?.content, reportId, currentReport?.id])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-20 shrink-0 border-b px-4 py-4 backdrop-blur" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(14,16,24,0.9)' }}>
        <div className="flex items-center gap-3">
          <ScoutAvatar size={40} compact pulse={loading} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
              {title}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
              {subtitle}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendMessage(prompt)}
              disabled={loading}
              className="rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] transition-all disabled:opacity-50"
              style={{ background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.14)', color: 'var(--text-secondary)' }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex flex-col gap-1 ${message.role === 'assistant' ? 'items-start' : 'items-end'}`}>
            {message.role === 'assistant' ? (
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                SCOUT
              </span>
            ) : null}
            <div
              className="max-w-full whitespace-pre-line rounded-2xl px-3.5 py-3 text-xs leading-6"
              style={
                message.role === 'assistant' && !message.isError
                  ? {
                      background: 'rgba(0,240,255,0.07)',
                      border: '1px solid rgba(0,240,255,0.12)',
                      color: 'var(--text-primary)',
                      borderBottomLeftRadius: 6,
                    }
                  : message.isError
                    ? {
                        background: 'rgba(255,51,102,0.08)',
                        border: '1px solid rgba(255,51,102,0.22)',
                        color: 'var(--accent-danger)',
                        borderBottomLeftRadius: 6,
                      }
                    : {
                        background: 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(255,184,0,0.16))',
                        border: '1px solid rgba(0,240,255,0.2)',
                        color: '#F9FBFF',
                        borderBottomRightRadius: 6,
                      }
              }
            >
              {message.role === 'assistant' ? cleanMarkdown(message.content) : message.content}
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex items-start">
            <div className="flex items-center gap-1 rounded-2xl px-3.5 py-3" style={{ background: 'rgba(0,240,255,0.07)', border: '1px solid rgba(0,240,255,0.12)' }}>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--accent-primary)', animation: `pulseGlow 1.2s ease-in-out ${index * 0.15}s infinite` }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border px-3.5 py-3 text-xs leading-6" style={{ borderColor: 'rgba(255,51,102,0.22)', background: 'rgba(255,51,102,0.08)', color: 'var(--accent-danger)' }}>
            {error}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage(input)
          setInput('')
        }}
        className="shrink-0 border-t px-4 pb-4 pt-3"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(14,16,24,0.92)' }}
      >
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={loading ? 'SCOUT is thinking...' : placeholder}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent-primary)' }}
            disabled={loading}
          />
          {loading ? (
            <button
              type="button"
              onClick={stopMessage}
              className="flex h-8 w-8 items-center justify-center rounded-xl transition-all hover:bg-[#FF3366]/10"
              style={{ color: 'var(--accent-danger)' }}
              title="Stop response"
              aria-label="Stop response"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-xl transition-all disabled:opacity-40"
              style={{ background: 'var(--accent-primary)', color: '#0A0A0F' }}
              title="Send"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

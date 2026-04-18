import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBackendBaseUrl } from '@/lib/backend'

export const runtime = 'nodejs'

/**
 * Proxy route for cancelling a running EEG analysis job.
 * Receives `reportId` and forwards the request to the FastAPI backend.
 */
export async function POST() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!user || !session?.access_token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const backendResponse = await fetch(
      `${getBackendBaseUrl()}/api/v1/job/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    )

    const backendPayload = await backendResponse.json().catch(() => null)

    if (!backendResponse.ok) {
      return NextResponse.json(
        { error: backendPayload?.detail || 'Failed to cancel the analysis.' },
        { status: backendResponse.status }
      )
    }

    return NextResponse.json(backendPayload)
  } catch (error: any) {
    console.error('[api/cancel] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Unable to process cancellation right now.' },
      { status: 500 }
    )
  }
}

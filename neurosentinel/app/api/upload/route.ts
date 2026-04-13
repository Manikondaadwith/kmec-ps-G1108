import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBackendBaseUrl } from '@/lib/backend'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!user || !session?.access_token) {
      return NextResponse.json({ error: 'You need to be signed in to upload EEG files.' }, { status: 401 })
    }

    const backendResponse = await fetch(`${getBackendBaseUrl()}/api/v1/analyze`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': request.headers.get('content-type') || 'multipart/form-data',
      },
      body: request.body,
      cache: 'no-store',
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    const backendPayload = await backendResponse.json().catch(() => null)

    if (!backendResponse.ok) {
      const message = backendPayload?.detail || backendPayload?.error || 'The backend rejected this analysis request.'
      return NextResponse.json({ error: message }, { status: backendResponse.status })
    }

    return NextResponse.json(backendPayload)
  } catch (error: any) {
    console.error('[api/upload] Error:', error)
    return NextResponse.json({ error: error?.message || 'Unable to process this EEG upload right now.' }, { status: 500 })
  }
}

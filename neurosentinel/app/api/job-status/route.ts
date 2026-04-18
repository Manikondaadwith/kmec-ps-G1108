import { NextResponse } from 'next/server'
import { fetchBackend } from '@/lib/backend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const backendResponse = await fetchBackend('/api/v1/job/status', {
      method: 'GET',
    })

    const payload = await backendResponse.json().catch(() => null)

    if (!backendResponse.ok) {
      return NextResponse.json(
        { error: payload?.detail || 'Unable to fetch job status.' },
        { status: backendResponse.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error('[api/job-status] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Unable to fetch job status right now.' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { sendSignupOtp, userExistsForSignup } from '@/lib/signup-otp-store'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const exists = await userExistsForSignup(email)
    if (exists) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists. Please sign in.',
          code: 'ACCOUNT_EXISTS',
          redirectTo: '/login?message=An%20account%20with%20this%20email%20already%20exists.%20Please%20sign%20in.',
        },
        { status: 409 }
      )
    }

    const verificationToken = await sendSignupOtp(email)
    return NextResponse.json({ ok: true, verificationToken })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send verification code.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

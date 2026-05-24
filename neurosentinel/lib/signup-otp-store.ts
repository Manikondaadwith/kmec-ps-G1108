import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const OTP_TTL_MS = 10 * 60 * 1000
const OTP_LENGTH = 6

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function getOtpSecret() {
  const secret = process.env.OTP_SIGNING_SECRET
  if (!secret) {
    throw new Error('OTP_SIGNING_SECRET env var is not set. Cannot sign or verify OTP tokens.')
  }
  return secret
}

function hashOtp(email: string, otp: string) {
  return crypto.createHmac('sha256', getOtpSecret()).update(`${normalizeEmail(email)}:${otp}`).digest('hex')
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', getOtpSecret()).update(payload).digest('base64url')
}

function encodePayload(payload: { email: string; otpHash: string; expiresAt: number }) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodePayload(token: string) {
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    throw new Error('Invalid verification token.')
  }

  const expectedSignature = signPayload(encodedPayload)
  if (signature !== expectedSignature) {
    throw new Error('Invalid verification token.')
  }

  const rawPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
  return JSON.parse(rawPayload) as { email: string; otpHash: string; expiresAt: number }
}

function createTransport() {
  const user = process.env.GMAIL_USER || 'manikondaadwith6@gmail.com'
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!pass) {
    throw new Error('Missing GMAIL_APP_PASSWORD in .env.local.')
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  })
}

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function userExistsForSignup(email: string) {
  const admin = getAdminClient()
  const normalizedEmail = normalizeEmail(email)
  const { data, error } = await admin.from('users').select('id').eq('email', normalizedEmail).maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data?.id)
}

export function generateOtp() {
  const min = 10 ** (OTP_LENGTH - 1)
  const max = 10 ** OTP_LENGTH - 1
  return `${crypto.randomInt(min, max + 1)}`
}

export async function sendSignupOtp(email: string) {
  const normalizedEmail = normalizeEmail(email)
  const otp = generateOtp()
  const expiresAt = Date.now() + OTP_TTL_MS

  const transporter = createTransport()
  const from = process.env.GMAIL_USER || 'manikondaadwith6@gmail.com'

  await transporter.sendMail({
    from: `"NeuroSentinel AI" <${from}>`,
    to: normalizedEmail,
    subject: 'Your NeuroSentinel AI verification code',
    text: `Your NeuroSentinel AI verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#0A0A0F;color:#E8F7FF;padding:24px">
        <h2 style="margin:0 0 12px;color:#00F0FF">NeuroSentinel AI</h2>
        <p style="margin:0 0 16px;color:#B8C7D1">Use this verification code to finish creating your account.</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 20px;border-radius:14px;background:#111827;display:inline-block;color:#FFFFFF">
          ${otp}
        </div>
        <p style="margin:16px 0 0;color:#8FA4B3">This code expires in 10 minutes.</p>
      </div>
    `,
  })

  const encodedPayload = encodePayload({
    email: normalizedEmail,
    otpHash: hashOtp(normalizedEmail, otp),
    expiresAt,
  })

  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

export function verifySignupOtp(email: string, otp: string, verificationToken: string) {
  const normalizedEmail = normalizeEmail(email)
  const payload = decodePayload(verificationToken)

  if (payload.email !== normalizedEmail) {
    throw new Error('This verification code does not match the current email.')
  }

  if (payload.expiresAt < Date.now()) {
    throw new Error('This verification code has expired. Please request a new one.')
  }

  if (payload.otpHash !== hashOtp(normalizedEmail, otp)) {
    throw new Error('Invalid verification code.')
  }
}

export async function createVerifiedSignup(email: string, password: string) {
  const admin = getAdminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email: normalizeEmail(email),
    password,
    email_confirm: true,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Unable to create account.')
  }

  const { error: profileError } = await admin
    .from('users')
    .upsert(
      {
        id: data.user.id,
        email: normalizeEmail(email),
        role: 'user',
        onboarding_complete: false,
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    throw new Error(profileError.message)
  }
}
export async function sendResetPasswordOtp(email: string) {
  const normalizedEmail = normalizeEmail(email)
  const otp = generateOtp()
  const expiresAt = Date.now() + OTP_TTL_MS

  const transporter = createTransport()
  const from = process.env.GMAIL_USER || 'manikondaadwith6@gmail.com'

  await transporter.sendMail({
    from: `"NeuroSentinel AI" <${from}>`,
    to: normalizedEmail,
    subject: 'Your NeuroSentinel AI password reset code',
    text: `Your NeuroSentinel AI password reset code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#0A0A0F;color:#E8F7FF;padding:24px">
        <h2 style="margin:0 0 12px;color:#00F0FF">NeuroSentinel AI</h2>
        <p style="margin:0 0 16px;color:#B8C7D1">You requested to reset your password. Use the verification code below to proceed.</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 20px;border-radius:14px;background:#111827;display:inline-block;color:#FFFFFF">
          ${otp}
        </div>
        <p style="margin:16px 0 0;color:#8FA4B3">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `,
  })

  const encodedPayload = encodePayload({
    email: normalizedEmail,
    otpHash: hashOtp(normalizedEmail, otp),
    expiresAt,
  })

  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

export async function confirmPasswordReset(email: string, otp: string, verificationToken: string, newPassword: string) {
  const normalizedEmail = normalizeEmail(email)
  const payload = decodePayload(verificationToken)

  if (payload.email !== normalizedEmail) {
    throw new Error('This verification code does not match the current email.')
  }

  if (payload.expiresAt < Date.now()) {
    throw new Error('This verification code has expired. Please request a new one.')
  }

  if (payload.otpHash !== hashOtp(normalizedEmail, otp)) {
    throw new Error('Invalid verification code.')
  }

  const admin = getAdminClient()
  
  // 1. Find user ID from public.users (shared ID with auth.users)
  const { data: userData, error: userError } = await admin
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (userError || !userData) {
    throw new Error('Unable to find user account.')
  }

  // 2. Update password via admin auth
  const { error: updateError } = await admin.auth.admin.updateUserById(userData.id, {
    password: newPassword,
  })

  if (updateError) {
    throw new Error(updateError.message)
  }
}

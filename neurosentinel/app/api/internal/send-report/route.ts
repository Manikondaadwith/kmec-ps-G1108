import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

const CANONICAL_APP_URL = 'https://neuro-sentinel-ai-6vfv.vercel.app'

function normalizeEmailHtml(rawHtml: string) {
  return rawHtml.replace(/href=(["'])(https?:\/\/[^"'<>]+)\1/gi, (match, quote, url) => {
    const normalized = String(url).trim()
    if (
      normalized.includes('neuro-sentinel-ai-6vfv.vercel.app') ||
      normalized.includes('neurosentinel.vercel.app') ||
      normalized.includes('/dashboard')
    ) {
      return `href=${quote}${CANONICAL_APP_URL}${quote}`
    }

    return match
  })
}

/**
 * INTERNAL API ROUTE
 * used to relay analysis reports from the Hugging Face backend (which has SMTP blocked)
 * to the Vercel environment (which allows SMTP).
 */

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_API_SECRET || 'neurosentinel-internal-key-2026'
  const authHeader = req.headers.get('x-internal-secret')

  if (authHeader !== secret) {
    return NextResponse.json({ error: 'Unauthorized relay request' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { to_email, subject, html, pdf_base64, filename } = body

    if (!to_email || !subject || !html) {
      return NextResponse.json({ error: 'Missing required mail fields' }, { status: 400 })
    }

    const normalizedHtml = normalizeEmailHtml(String(html))

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || 'manikondaadwith6@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    const attachments = []
    if (pdf_base64) {
      attachments.push({
        filename: filename || 'NeuroSentinel_Report.pdf',
        content: pdf_base64,
        encoding: 'base64',
      })
    }

    await transporter.sendMail({
      from: `"NeuroSentinel AI" <${process.env.GMAIL_USER || 'manikondaadwith6@gmail.com'}>`,
      to: to_email,
      subject,
      html: normalizedHtml,
      attachments,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Email relay failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

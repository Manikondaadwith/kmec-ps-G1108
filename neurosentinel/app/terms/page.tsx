import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Use | NeuroSentinel AI',
}

const sections = [
  {
    title: 'Purpose of the Platform',
    body:
      'NeuroSentinel AI provides EEG analysis workflows, structured seizure-detection reporting, and in-product guidance through SCOUT. It is designed to support review workflows, not to replace professional medical judgment.',
  },
  {
    title: 'Medical Disclaimer',
    body:
      'NeuroSentinel AI does not diagnose medical conditions, prescribe treatment, or provide emergency advice. All outputs must be reviewed by a qualified clinician before being used in care decisions.',
  },
  {
    title: 'User Responsibilities',
    body:
      'You are responsible for using the platform lawfully, uploading data you are authorized to process, safeguarding patient privacy, and verifying outputs before relying on them in any clinical, research, or personal context.',
  },
  {
    title: 'Acceptable Use',
    body:
      'You may not use NeuroSentinel AI to upload malicious files, attempt unauthorized access, reverse engineer protected systems, or process data in violation of applicable privacy, medical, or research regulations.',
  },
  {
    title: 'Data Handling',
    body:
      'Uploaded EEG files, report summaries, and chat context may be stored to deliver product functionality, maintain report history, and improve continuity inside your account. Sensitive data should only be uploaded when you are authorized to do so.',
  },
  {
    title: 'No Warranty',
    body:
      'NeuroSentinel AI is provided on an as-available basis. We do not guarantee uninterrupted availability, perfect model performance, or fitness for any particular diagnostic, research, or operational purpose.',
  },
  {
    title: 'Limitation of Liability',
    body:
      'To the maximum extent permitted by law, NeuroSentinel AI and its operators are not liable for indirect, consequential, or clinical decision outcomes arising from the use or misuse of the platform or its outputs.',
  },
  {
    title: 'Account Termination',
    body:
      'We may suspend or terminate access if the platform is used unlawfully, unsafely, or in breach of these terms. You may also request deletion of your account and associated data through the account controls provided in Settings.',
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-[var(--bg-primary)] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[32px] border p-8 md:p-10" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--accent-primary)' }}>
                NeuroSentinel AI
              </div>
              <h1 className="mt-3 text-3xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                Terms of Use
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                These terms govern access to NeuroSentinel AI, including EEG uploads, report generation, and SCOUT assistance.
              </p>
            </div>

            <Link
              href="/"
              className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]"
              style={{ borderColor: 'rgba(0,240,255,0.18)', color: 'var(--accent-primary)' }}
            >
              Back
            </Link>
          </div>

          <div className="mt-8 space-y-5">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-[24px] border px-5 py-5"
                style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
              >
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                  {section.title}
                </h2>
                <p className="mt-2 text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

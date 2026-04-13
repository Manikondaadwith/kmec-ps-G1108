import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | NeuroSentinel AI',
}

const sections = [
  {
    title: 'Information We Process',
    body:
      'NeuroSentinel AI may process account information, uploaded EEG files, report outputs, chat history with SCOUT, and technical logs needed to operate the platform securely and reliably.',
  },
  {
    title: 'How Data Is Used',
    body:
      'We use uploaded and account-linked data to authenticate users, store reports, provide report history, power contextual SCOUT responses, and support ongoing product operations.',
  },
  {
    title: 'Clinical and Sensitive Data',
    body:
      'EEG files and report content may contain sensitive health information. You should only upload data when you have an appropriate legal basis and the right to process that information.',
  },
  {
    title: 'Storage and Retention',
    body:
      'Data may be stored in authenticated databases and storage systems required for NeuroSentinel AI features. Retention may continue until the data is deleted by the user or removed in accordance with product policies.',
  },
  {
    title: 'Security',
    body:
      'We use access-controlled services and authenticated sessions to protect account data. No security system is absolute, and users remain responsible for credential security and lawful handling of sensitive data.',
  },
  {
    title: 'Sharing',
    body:
      'We do not share your data except as needed to operate the platform, comply with law, protect rights or safety, or fulfill service-provider obligations required for hosting, storage, or processing.',
  },
  {
    title: 'Your Controls',
    body:
      'You can review profile details, change your password, and request permanent account deletion from Settings. Deleting your account removes associated reports, chats, and the linked authentication record.',
  },
  {
    title: 'Not for Emergency Use',
    body:
      'NeuroSentinel AI is not an emergency service and should not be used to obtain urgent medical care, emergency triage, or treatment decisions without qualified professional oversight.',
  },
]

export default function PrivacyPage() {
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
                Privacy Policy
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                This policy explains how NeuroSentinel AI handles account data, EEG uploads, reports, and SCOUT conversation context.
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

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
    <main className="min-h-dvh bg-[#F8FAFC] px-6 py-20 pb-20" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <div className="mx-auto max-w-[800px]">
        
        {/* Card */}
        <div 
          className="relative overflow-hidden rounded-[16px] bg-[#FFFFFF] p-8 md:p-12"
          style={{
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.03), 0 8px 16px rgba(0,0,0,0.02)'
          }}
        >
          {/* Back button */}
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to app
          </Link>

          {/* Header */}
          <div className="mb-8">
            <span className="text-[11.5px] font-bold tracking-[0.1em] uppercase text-[#0EA5A4]">
              NeuroSentinel AI
            </span>
            <h1 className="mt-3 text-[32px] md:text-[36px] font-bold tracking-tight text-[#0F172A] leading-tight">
              Privacy Policy
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
              This policy explains how NeuroSentinel AI handles account data, EEG uploads, reports, and SCOUT conversation context.
            </p>
          </div>

          <div style={{ height: '1px', background: '#E2E8F0', marginBottom: '40px' }} />

          {/* Sections */}
          <div className="space-y-12">
            {sections.map((section) => (
              <section key={section.title} className="relative pl-5" style={{ borderLeft: '3px solid #E2E8F0' }}>
                <h2 className="text-[19px] font-semibold text-[#1E293B]">
                  {section.title}
                </h2>
                <p className="mt-3 text-[15px] leading-[1.7] text-[#475569]">
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          <div className="mt-12 mb-6" style={{ height: '1px', background: '#E2E8F0' }} />

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[12.5px] text-slate-400 font-medium tracking-wide">
            <span>Last updated: April 15, 2026</span>
            <span>Contact: support@neurosentinel.ai</span>
          </div>
        </div>
      </div>
    </main>
  )
}


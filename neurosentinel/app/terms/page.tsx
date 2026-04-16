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
    <main className="min-h-dvh px-6 py-20 pb-20" style={{ background: 'linear-gradient(135deg, #F8FAFC, #E2E8F0)', fontFamily: "'Outfit', sans-serif" }}>
      <div className="mx-auto max-w-[800px]">
        
        {/* Card */}
        <div 
          className="relative overflow-hidden rounded-[16px] p-8 md:p-12"
          style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,0,0,0.05)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
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
              Terms of Use
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: '#64748B' }}>
              This document governs your use of NeuroSentinel AI for EEG analysis, reporting, and AI assistance.
            </p>
          </div>

          <div style={{ height: '1px', background: '#E2E8F0', marginBottom: '40px' }} />

          {/* Sections */}
          <div className="space-y-12">
            {sections.map((section) => (
              <section key={section.title} className="relative pl-5" style={{ borderLeft: '3px solid #E2E8F0' }}>
                <h2 className="text-[19px] font-semibold" style={{ color: '#0F172A' }}>
                  {section.title}
                </h2>
                <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: '#334155' }}>
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


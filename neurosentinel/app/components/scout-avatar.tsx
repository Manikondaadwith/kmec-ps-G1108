'use client'

export function ScoutAvatar({
  size = 44,
  pulse = false,
  compact = false,
}: {
  size?: number
  pulse?: boolean
  compact?: boolean
}) {
  const bubbleColor = compact ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'

  return (
    <div
      className="relative flex items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, rgba(0,240,255,0.18), rgba(255,184,0,0.14))',
        border: '1px solid rgba(0,240,255,0.35)',
        boxShadow: pulse ? '0 0 20px rgba(0,240,255,0.18)' : '0 0 10px rgba(0,240,255,0.12)',
      }}
    >
      {pulse ? (
        <span
          className="absolute inset-0 rounded-2xl"
          style={{
            border: '1px solid rgba(0,240,255,0.24)',
            animation: 'ping-slow 2.6s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />
      ) : null}

      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path
          d="M10 11.5C10 8.46243 12.4624 6 15.5 6H32.5C35.5376 6 38 8.46243 38 11.5V24.5C38 27.5376 35.5376 30 32.5 30H22L14 36V30.0045C11.7613 29.7775 10 27.8899 10 25.5V11.5Z"
          fill={bubbleColor}
          stroke="var(--accent-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="19" cy="18" r="2.2" fill="var(--accent-primary)" />
        <circle cx="29" cy="18" r="2.2" fill="var(--accent-primary)" />
        <path
          d="M18 23.5C19.6 26.2 22 27.5 24 27.5C26 27.5 28.4 26.2 30 23.5"
          stroke="#FFB800"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

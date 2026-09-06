# NeuroSentinel AI — Internal Technical Guide
## Chapter 3: Frontend Architecture, UI Design & Deployment

**Purpose:** Internal reference document for conference/journal paper and institutional memory.  
**Last updated:** September 2026 (Sessions 21+)  
**Authors:** Manikonda Adwith — KMEC, Hyderabad — G1108

---

## 1. Frontend Stack

| Component | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Hosting | Vercel (free tier) |
| Styling | Vanilla CSS (clinical white theme) + Google Fonts |
| Auth | Supabase Auth (email/password + OTP) |
| Global State | React Context (`ScoutProvider`, `AnalysisProvider`) |
| Charts | Recharts (probability timeline, band power chart) |
| File Upload | react-dropzone |
| Icons | lucide-react |
| PDF | pdf-lib (frontend overlay) + ReportLab (backend generation) |

### 1.1 Font Stack

Loaded via Google Fonts in `app/layout.tsx`:

- **Outfit** (400–800): Branding, headings, logo text
- **Inter** (300–700): Body text, navigation, clinical copy
- **JetBrains Mono** (400–600): Metrics, codes, data values

---

## 2. Application Routing

All routes are in `neurosentinel/app/` using Next.js 14 App Router:

| Route | Type | Purpose |
|---|---|---|
| `/` | Public | Landing page (redirects to `/login` or `/dashboard`) |
| `/login` | Public | Login + Signup combined page |
| `/onboarding` | Protected | SCOUT-led first-run experience (role + name collection) |
| `/dashboard` | Protected | Analysis Station — upload zone + recent reports |
| `/dashboard/eeg-reports` | Protected | Full analysis history with filters + comparison |
| `/dashboard/eeg-reports/compare` | Protected | Side-by-side report comparison + SCOUT summary |
| `/dashboard/settings` | Protected | Profile, role preference, password, account management |
| `/dashboard/patient-records` | Protected | Redirects to `/dashboard/eeg-reports` |
| `/report/[id]` | Protected | Full clinical report viewer (tabs: clinical, signals, raw) |
| `/terms` | Public | Terms of Use |
| `/privacy` | Public | Privacy Policy |

### 2.1 Middleware & Auth Guard

The middleware does a **raw cookie check only** (no network calls) to avoid cold-start latency and circular redirect loops with expired cookies. Protected routes check Supabase auth in the layout server component and redirect to `/` if no session.

### 2.2 Route Protection Flow

```
Request → Middleware (raw cookie check)
  │
  ├── No session cookie → redirect to /
  └── Cookie present → allow
         │
         └── Layout Server Component (DashboardLayout)
               │
               ├── supabase.auth.getUser()
               │     └── Not authenticated → redirect('/')
               └── ensureUserProfile()
                     └── onboarding_complete=false → redirect('/onboarding')
```

---

## 3. Component Architecture

### 3.1 File Structure (`app/`)

```
app/
├── layout.tsx                         # Root layout — ScoutProvider, ReportNotificationProvider, ScoutFloating
├── globals.css                        # Global CSS reset and base tokens
├── page.tsx                           # Landing page
├── login/page.tsx                     # Combined login + signup
├── onboarding/page.tsx                # SCOUT-led onboarding flow
├── dashboard/
│   ├── layout.tsx                     # Server layout — auth check, sidebar, AnalysisProvider
│   ├── page.tsx                       # Analysis Station (upload + recent reports)
│   ├── dashboard.css                  # Clinical CSS design system (CSS variables)
│   ├── eeg-reports/
│   │   ├── page.tsx                   # Analysis History (filters, sort, comparison select)
│   │   ├── layout.tsx                 # EEG reports sub-layout
│   │   └── compare/page.tsx           # Side-by-side comparison + SCOUT
│   ├── settings/
│   │   ├── page.tsx                   # Server shell
│   │   └── settings-client.tsx        # Client — name edit, role, password, delete account
│   └── _components/
│       ├── sidebar.tsx                # Navigation sidebar (desktop + mobile drawer)
│       ├── upload-zone.tsx            # Drag-and-drop EDF upload
│       ├── analysis-results.tsx       # Result display after processing
│       ├── processing-pipeline-card.tsx # Live processing status card
│       ├── reliability-badge.tsx      # Pill-style High/Moderate/Low badge
│       ├── status-badge.tsx           # completed/processing/failed badge
│       ├── skeleton.tsx               # Shimmer skeleton loaders
│       ├── name-prompt.tsx            # Post-onboarding name collection prompt
│       └── scout-tour.tsx             # Guided clinical tour component
├── report/
│   ├── [id]/page.tsx                  # Full clinical report viewer
│   └── _components/
│       ├── clinical-metrics.tsx       # Key metrics strip (confidence, risk, quality, events)
│       ├── probability-timeline.tsx   # Recharts seizure probability timeline
│       ├── brain-heatmap.tsx          # SVG brain heatmap (10-20 electrode positions)
│       ├── event-cards.tsx            # Individual seizure event detail cards
│       ├── data-quality-panel.tsx     # Signal quality breakdown
│       └── band-power-chart.tsx       # Recharts EEG band power bar chart
└── components/
    ├── scout-provider.tsx             # Global ScoutContext (sessionStorage persistence)
    ├── scout-conversation.tsx         # Full chat UI (messages, input, quickPrompts)
    ├── scout-floating.tsx             # Floating launcher button (bottom-right corner)
    ├── scout-panel.tsx                # Panel wrapper (slide-in overlay)
    ├── scout-avatar.tsx               # SCOUT avatar icon component
    ├── report-notification-provider.tsx  # In-app toast for completed reports
    └── report-notification-toast.tsx  # Toast component
```

### 3.2 Global Context Providers (Root Layout)

```tsx
// app/layout.tsx
<ScoutProvider>
  <ReportNotificationProvider>
    {children}
    <ScoutFloating />   ← rendered at root, visible on all pages
  </ReportNotificationProvider>
</ScoutProvider>
```

### 3.3 Dashboard Context Providers

```tsx
// app/dashboard/layout.tsx
<AnalysisProvider>
  <div className="clinical-dashboard-layout">
    <Sidebar userEmail={user.email} />
    <div className="clinical-main-content">
      {children}
    </div>
  </div>
</AnalysisProvider>
```

`AnalysisProvider` holds centralized upload/processing state shared between the upload zone, sidebar status indicator, and analysis results panel. Eliminates prop-drilling across the dashboard.

---

## 4. Key Pages — Internal Logic

### 4.1 Dashboard Page (`/dashboard`)

**State managed by `useAnalysis()` context:**

| State | Type | Purpose |
|---|---|---|
| `currentReport` | ReportRecord \| null | Most recent completed report |
| `activeJobId` | string \| null | In-flight job identifier |
| `activeFilename` | string \| null | Filename of uploading EDF |
| `jobStatus` | string | processing / completed / failed |
| `uploadProgress` | number | 0–100 upload percentage |
| `isProcessing` | boolean | True while backend analysis runs |

**Job polling logic:**
- `setInterval(3000ms)` polls `/api/job-status`
- On `status === 'completed'`: fetches report from Supabase, sets `currentReport`, clears interval
- On `status === 'failed'`: sets `jobStatus = 'failed'`, clears interval
- Backend offline (502/503): sets `backendOffline` state → UI shows a recovery card
- Interval cleared on component unmount and on completion

**SCOUT context registration:**
```typescript
setPageContext({
  page: 'dashboard',
  role: userRole,
  reportId: currentReport?.id ?? null,
  currentReport,
  pageData: { stats, recentReportsCount }
})
```

### 4.2 EEG Reports Page (`/dashboard/eeg-reports`)

**Key features:**
- Full Supabase query: all user reports ordered by `created_at DESC`
- Client-side filtering (`useMemo`): search by filename/ID, status filter (all/completed/processing/failed), result filter (all/seizure/normal/uncertain), multi-field sort
- **Comparison selection:** Toggle up to 2 reports → "Compare Reports" button appears → navigates to `/dashboard/eeg-reports/compare?a={id}&b={id}`
- **PDF download:** Fetches from `/api/reports/{id}/pdf` → creates blob URL → triggers `<a>` download

### 4.3 Compare Page (`/dashboard/eeg-reports/compare`)

- Reads `?a=` and `?b=` query params
- Fetches both reports from Supabase
- Renders side-by-side metrics table
- Builds a structured `buildComparisonPrompt(a, b, role)` and passes as `autoPrompt` to `ScoutConversation`
- Uses unique `stateKey = \`compare-${[a,b].sort().join('-')}\`` so each pair has independent chat history

**Comparison metrics shown:**
- Result label, risk level, confidence %, duration, event count
- Signal quality grade
- Domain shift score (if available in report_json)
- Created-at timestamps

### 4.4 Report Detail Page (`/report/[id]`)

Three-tab layout:

| Tab | Content |
|---|---|
| Clinical | ClinicalMetrics strip, EventCards, DataQualityPanel |
| Signals | ProbabilityTimeline, BrainHeatmap, BandPowerChart |
| Raw | Raw report JSON viewer (for researchers) |

**ProbabilityTimeline (Recharts):**
- Renders seizure probability (0–1) over time in seconds
- Uses `report_json.probabilities` array
- Seizure events overlaid as shaded regions (`ReferenceArea`)
- Annotations show event onset/offset with confidence labels

**BrainHeatmap:**
- SVG-based rendering of standard 10-20 electrode positions
- Channel importance scores from `report_json.explainability.top_channels`
- Colour scale: low importance (light grey) → high importance (deep teal)

**BandPowerChart (Recharts):**
- Bar chart: Delta, Theta, Alpha, Beta, Gamma
- Per-channel or averaged, from `report_json.signal_quality`

**PDF download handler:**
```typescript
const res = await fetch(`/api/reports/${report.id}/pdf`)
const blob = await res.blob()
// Creates blob URL → opens in new tab (not forced download)
```

**Report polling:**
- If report status is `processing` or `pending` on load, polls Supabase every 3s until complete

**SCOUT panel:**
- Fixed-width right panel, toggled via a teal button at bottom-right
- Uses `ScoutConversation` with `page='report'`, `reportId`, `currentReport`, `pageData=reportJson`
- Quick prompts: "Summarize findings", "Explain confidence", "What should I do next?"

---

## 5. Sidebar & Navigation

### 5.1 Navigation Items

| Label | Route | Icon |
|---|---|---|
| Analysis Station | `/dashboard` | Dashboard grid |
| Analysis History | `/dashboard/eeg-reports` | File document |
| Settings & Security | `/dashboard/settings` | Gear |
| SCOUT Assistant | (opens floating panel) | SCOUT avatar + pulse dot |

### 5.2 Mobile Responsive Drawer (Post-April)

The sidebar gained full mobile support after April 2026:

- **Mobile Header Bar:** Visible only on ≤768px. Shows hamburger button, NeuroSentinel AI logo, and role pill
- **Drawer overlay:** Sidebar slides in from left (`transform: translateX(-100%)` → `translateX(0)`) when `mobileOpen = true`
- **Backdrop:** Semi-transparent overlay closes sidebar on tap
- **Nav link click:** Also closes sidebar (`onClick={() => setMobileOpen(false)}`)
- **CSS breakpoint:** `@media (max-width: 768px)` hides desktop sidebar, shows mobile header bar

### 5.3 Sidebar Footer

- Active analysis indicator (pulsing dot + filename when `isProcessing`)
- SCOUT status item (shows "SCOUT Active" dot when panel open)
- Help & Support button → opens support modal
- User email display
- Sign Out button (clears sessionStorage, calls `supabase.auth.signOut()`, redirects to `/login`)

---

## 6. Design System (CSS)

### 6.1 CSS Variables (from `dashboard.css`)

```css
:root {
  /* Core palette */
  --bg-base:              #FFFFFF;
  --bg-subtle:            #F8FAFC;
  --bg-card:              #FFFFFF;
  --border-default:       rgba(0, 0, 0, 0.08);
  --border-strong:        rgba(0, 0, 0, 0.14);

  /* Text */
  --text-heading:         #0F172A;
  --text-body:            #334155;
  --text-muted:           #64748B;
  --text-faint:           #94A3B8;

  /* Clinical teal accent */
  --accent-primary:       #0E7490;   /* clinical teal */
  --accent-primary-light: rgba(14, 116, 144, 0.08);
  --accent-hover:         #0891B2;

  /* Status colours */
  --status-success:       #059669;
  --status-warning:       #D97706;
  --status-danger:        #DC2626;

  /* Typography */
  --font-sans:            'Inter', system-ui, sans-serif;
  --font-brand:           'Outfit', sans-serif;
  --font-mono:            'JetBrains Mono', monospace;
}
```

### 6.2 Component Classes

Key utility classes defined in `dashboard.css`:

| Class | Purpose |
|---|---|
| `.clinical-dashboard-layout` | Root flex layout (sidebar + main) |
| `.clinical-sidebar` | Fixed left sidebar, 240px wide |
| `.clinical-main-content` | Scrollable main area |
| `.clinical-header` | Sticky page header bar |
| `.clinical-page-content` | Content area with padding |
| `.clinical-card` | White card with border + shadow |
| `.clinical-nav-item` | Navigation link with active state |
| `.clinical-dot` | Pulsing status indicator dot |
| `.skeleton-shimmer` | Animated shimmer skeleton placeholder |

### 6.3 Login/Onboarding Pages

Both use a **premium glassmorphism aesthetic**:
- Soft radial gradient background (emerald + blue ambient glows)
- Ultra-subtle neural waveform SVG pattern at 2.5% opacity
- Blurred blob elements for depth
- Frosted glass card (`backdrop-filter: blur(24px)`)
- White card with `ring-1 ring-slate-200` border

---

## 7. Auth & Onboarding Flow

### 7.1 Login / Signup Page

Single page handles both flows:
- **Tab switching:** Login / Sign Up tabs within same card
- **Login:** `supabase.auth.signInWithPassword()` → redirect to `/dashboard`
- **Signup:** Sends OTP to email via `/api/auth/send-otp` → transitions to OTP entry screen → `/api/auth/complete-signup` creates Supabase user + `public.users` profile
- **Existing account guard:** Before sending OTP, checks `auth.users` — if email exists, redirects to login directly (prevents OTP page flash for returning users)
- **Help & Support button:** Floating button on login page (added post-April)
- **Password toggle:** Show/hide eye icon on password fields

### 7.2 OTP System

- **6-digit OTP** with 10-minute expiry
- **Stateless verification:** HMAC-SHA256 signed token (no server-side session store required)
- **4-tier email dispatch** (described in Chapter 2)
- `/api/auth/complete-signup`: verifies token, creates Supabase Auth user, inserts `public.users` row with `onboarding_complete = false`

### 7.3 Onboarding Page

SCOUT-led conversational first-run experience:

1. SCOUT greeting: "Hi, I'm SCOUT — Seizure Clinical Operations & Understanding Tool."
2. Name collection: Text input → name saved to `public.users.full_name`
3. Role selection: Three cards — Clinician / Researcher / Patient
4. Tour option: "Take a quick tour" / "Skip, let me explore"
5. On completion: `onboarding_complete = true` → redirect to `/dashboard`

The conversation is **simulated** (no live LLM call) — responses are scripted with `setTimeout` delays to create a natural typing feel.

### 7.4 Name Personalization (Post-April)

After onboarding, users can edit their name in:
- **Settings page** — editable name field, saved to `public.users.full_name`
- **NamePrompt component** — shown on dashboard if `onboarding_complete = true` but `full_name` is null (catches users who skipped the name step)

SCOUT and report emails use the saved name:
- SCOUT: Greets by name on first message, then uses name occasionally every ~5 replies (not every message — avoids feeling robotic)
- Emails: Subject line and greeting use `full_name` if available

---

## 8. Settings Page

### 8.1 Features

- **Full name edit:** Inline editable field, saved to Supabase
- **Role preference:** Clinician / Researcher / Patient selector (resets SCOUT tone)
- **Password change:** Current password + new password + confirm, validated client-side
- **Account deletion:** Confirmation dialog → calls `/api/account/delete` → signs out + clears sessionStorage

### 8.2 Settings Layout

Two-column layout on desktop, stacked on mobile:
- Left column: Profile card (avatar initials, email, role badge)
- Right column: Edit forms (name, role, password)

---

## 9. Report Notification System

`ReportNotificationProvider` + `ReportNotificationToast`:
- Listens to Supabase realtime subscription on `reports` table
- When a report transitions from `processing → completed`, shows an in-app toast: "✓ Analysis Complete — {filename}"
- Toast has "View Report" link navigating to `/report/{id}`
- Auto-dismisses after 8 seconds

---

## 10. API Routes (Next.js)

| Route | Method | Purpose |
|---|---|---|
| `/api/upload` | POST | Lightweight proxy — forwards `{file_url, filename}` to HF backend |
| `/api/job-status` | GET | Proxy to HF backend `/api/v1/job/status` |
| `/api/cancel` | POST | Proxy to HF backend `/api/v1/job/cancel` |
| `/api/chat` | POST | Proxy to HF backend `/api/v1/scout/chat` |
| `/api/chat/history` | GET | Fetch SCOUT chat history from `chat_messages` Supabase table |
| `/api/reports/[id]/pdf` | GET | Fetches PDF from Supabase Storage `report-pdfs/{user_id}/{id}.pdf` |
| `/api/backend-url` | GET | Returns backend URL (used by client-side components) |
| `/api/auth/send-otp` | POST | Sends signup/login OTP via 4-tier email chain |
| `/api/auth/complete-signup` | POST | Verifies OTP token, creates Supabase user |
| `/api/auth/reset-password/request` | POST | Sends password-reset link |
| `/api/auth/reset-password/confirm` | POST | Confirms password reset |
| `/api/account/change-password` | POST | Authenticated password change |
| `/api/account/delete` | POST | Deletes account and all reports |
| `/api/internal/send-report` | POST | Report email relay (called by HF backend, protected by X-Internal-Secret) |

### 10.1 Backend Communication

`lib/backend.ts` provides:

```typescript
// Resolves backend URL from env
getBackendBaseUrl()  // NEUROSENTINEL_BACKEND_URL or NEXT_PUBLIC_API_URL

// Auth-aware fetch with 60s timeout
fetchBackend(path, init)
  // Injects: Authorization: Bearer <supabase_token>
  // Cache: no-store
  // AbortController timeout: 60s
```

---

## 11. TypeScript Types (`lib/neurosentinel/types.ts`)

### 11.1 Core Types

```typescript
interface ReportRecord {
  id: string
  user_id: string
  filename: string | null
  status: string
  summary: string | null
  result_label: string | null    // "Seizure Detected" | "Suspicious Activity" | "No Seizure"
  event_count: number | null
  confidence_score: number | null
  quality_grade: string | null
  risk_level: string | null
  duration_minutes: number | null
  created_at: string
  report_json: ReportJson | null
  error_message: string | null
}

interface ReportJson {
  meta: { recording_id, generated_at, duration_min, tool, disclaimer }
  signal_quality: { grade, score, missing_channels }
  summary: { total_events, overall_risk, trend, early_warning, se_flag }
  events: ReportEvent[]
  explainability: { top_channels, top_regions, channel_importances }
  recommendations: string[]
  diagnostic_state: "DETECTED" | "SUSPICIOUS" | "CLEAR"
  suppressed_candidates: SuppressedCandidates | null
  result_label: string
  probabilities?: number[]     // Raw probability array (one per window)
}
```

### 11.2 Reliability Derivation

```typescript
function getReliability(confidence, duration, signalQuality): 'High' | 'Moderate' | 'Low' {
  const norm = confidence <= 1 ? confidence : confidence / 100
  if (norm < 0.30 || signalQuality === 'poor' || duration < 10) return 'Low'
  if (norm < 0.80 || duration < 20) return 'Moderate'
  return 'High'
}
```

### 11.3 Report Normalization

`normalizeReport()` handles raw Supabase rows:
- Parses `report_json` if stored as string
- Normalizes `confidence_score` (handles 0–1 or 0–100 range)
- Maps legacy `status` values to canonical `processing | completed | failed | pending`

---

## 12. Deployment Stack

```
┌─────────────────┐        ┌──────────────────┐       ┌─────────────────┐
│     Vercel       │        │   Hugging Face    │       │    Supabase      │
│   (Frontend)     │──────▶│     Spaces        │──────▶│   (Database)     │
│   Next.js 14     │        │  FastAPI+PyTorch  │       │   PostgreSQL      │
│    Free tier      │        │  Docker container │       │  Auth + Storage   │
│                  │        │    Free tier       │       │    Free tier      │
└─────────────────┘        └──────────────────┘       └─────────────────┘
         │                          │
         │                          ▼
         │                 ┌──────────────┐
         │                 │   LLM APIs   │
         │                 │  Gemini      │
         └────────────────▶│  Groq        │
                           │  HF Inference│
                           └──────────────┘
```

### 12.1 Vercel Configuration

| Setting | Value |
|---|---|
| Framework | Next.js 14 |
| Node options | `--max-old-space-size=4096` |
| Max function duration | 60s (API routes) |
| Environment | Production (`main` branch auto-deploy) |

### 12.2 Hugging Face Spaces Configuration

| Setting | Value |
|---|---|
| Runtime | Docker |
| Hardware | CPU Basic (2 vCPU, 16 GB RAM — free tier) |
| SDK | docker |
| Port | 7860 |
| Startup | `uvicorn app.main:app --host 0.0.0.0 --port 7860` |
| Keep-alive | GitHub Actions cron pings `/health` every 30 min |

### 12.3 GitHub Actions Keep-Alive

HF Spaces free tier pauses after 48h of inactivity. A GitHub Actions cron workflow (`/.github/workflows/keepalive.yml`) pings `GET /health` every 30 minutes to prevent cold-start on user requests.

### 12.4 Frontend Environment Variables (Vercel)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (API routes only) |
| `NEUROSENTINEL_BACKEND_URL` | HF Spaces backend URL |
| `INTERNAL_API_SECRET` | Shared secret with backend |
| `SMTP_HOST/PORT/USER/PASSWORD` | Gmail SMTP for email relay |
| `RESEND_API_KEY` | Resend email API |
| `OTP_SIGNING_SECRET` | HMAC secret for OTP tokens |
| `NODE_OPTIONS` | `--max-old-space-size=4096` |

---

## 13. Post-April UI & UX Changes (Session 21+)

All changes below were made after the April 21, 2026 guide. No model weights or inference logic were changed.

### 13.1 Logo Integration

- **logo.jpeg** added to `neurosentinel/public/`
- Used as favicon, Apple touch icon, and inline image across: login page, dashboard sidebar, onboarding page, report page header
- Logo displayed as `object-contain` inside a white rounded container with `ring-1 ring-slate-200`
- Logo also embedded in generated PDFs (base64 PNG, aligned next to title)

### 13.2 Mobile Responsive Design

Full mobile responsiveness added to all dashboard pages:

- Sidebar converts to a slide-in drawer on ≤768px
- Mobile header bar with hamburger menu, logo, and role pill
- Dashboard grid columns collapse from 3-column to 1-column
- Upload zone stacks vertically
- Report tabs scroll horizontally on narrow screens
- Fixed horizontal overflow root-cause eliminated (explicit `max-width: 100%` on all containers)

### 13.3 Skeleton Loaders & Loading States

`skeleton.tsx` provides shimmer animation placeholders:
- Used on dashboard while fetching recent reports
- Used on report page while report data loads
- CSS keyframe animation: `@keyframes shimmer { from: bg-pos -200%; to: bg-pos 200% }`

### 13.4 UX State Machine (Analysis Flow)

Centralized `AnalysisContext` eliminated race conditions in the upload/analysis flow:

| State | UI |
|---|---|
| idle | Upload zone visible, ready |
| uploading | Progress bar, filename display |
| processing | ProcessingPipelineCard with live stage indicators |
| completed | AnalysisResults with confidence/risk/events |
| failed | Error card with retry option |
| backend_offline | Warning card: "Backend is warming up, please wait…" |

### 13.5 Report Comparison View

Added in post-April sessions:

- Select up to 2 reports on the Analysis History page using checkboxes
- "Compare Reports" button navigates to `/dashboard/eeg-reports/compare?a={id1}&b={id2}`
- Side-by-side table comparison of all key metrics
- SCOUT generates an automatic comparison summary (role-aware, structured)
- Unique `stateKey` per pair prevents cross-contamination of chat histories
- **Clinical Guided Tour** updated to include a comparison step

### 13.6 Help & Support

`HelpSupportModal` and `HelpSupportButton` components:
- Modal contains contact form, FAQ, and direct email link
- Accessible on login page (floating button) and in sidebar footer
- Added post-April to reduce friction for users needing assistance

### 13.7 Terms & Privacy Pages

Full comprehensive Terms of Use (`/terms`) and Privacy Policy (`/privacy`) pages:
- Written in accessible plain English
- Covers: data collection, EEG data handling, AI disclaimer, user rights, contact
- Linked from login page footer
- Physical address listed: **Champapet, Hyderabad 500079**

### 13.8 Probability Timeline Redesign

Post-April redesign:
- Event annotations (onset/offset markers) redesigned for clarity
- Shaded seizure regions use teal fill with 20% opacity
- Confidence label shown at peak probability point
- Tooltip: shows exact probability value and timestamp on hover

### 13.9 Scrollbar Polish

Custom scrollbar style applied globally:
- Width: 4px
- Track: transparent
- Thumb: subtle dark-mode-style gradient (`rgba(51,65,85,0.3)` → `rgba(15,23,42,0.2)`)
- Replaces the original bright cyan scrollbar that was aesthetically inconsistent

---

**Continues in:** [Chapter 4 — Session History, Lessons & Paper Reference](./guide_part4_sessions_lessons_paper.md)

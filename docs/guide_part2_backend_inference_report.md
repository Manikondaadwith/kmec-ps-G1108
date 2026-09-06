# NeuroSentinel AI — Internal Technical Guide
## Chapter 2: Backend Architecture, Inference Pipeline, Report Generation, SCOUT & Email

**Purpose:** Internal reference document for conference/journal paper and institutional memory.  
**Last updated:** September 2026 (Sessions 21+)  
**Authors:** Manikonda Adwith — KMEC, Hyderabad — G1108

---

## 1. Backend Architecture

### 1.1 Stack

| Component | Technology |
|---|---|
| Framework | FastAPI (Python) |
| Hosting | Hugging Face Spaces (Docker, free tier) |
| Model Runtime | PyTorch (CPU only — no GPU on free tier) |
| Concurrency | `threading.Thread` (daemon) + `threading.Lock` |
| Auth | Supabase JWT verification |
| Memory Management | cgroup v2/v1 reading + `psutil` fallback |

### 1.2 Repository Layout

The repository has **two parallel backend directories**:

| Path | Purpose |
|---|---|
| `/app/` | Root-level directory for local development and testing |
| `/neurosentinel-backend/app/` | Containerized deployment package — this is what runs on Hugging Face Spaces |

Both directories share the **exact same module structure**:

```
app/
├── main.py                          # FastAPI application factory
├── config.py                        # Global config (env vars, production metrics)
├── api/
│   ├── deps.py                      # Supabase auth dependency injection
│   └── schemas.py                   # Pydantic request/response schemas
├── pipeline/
│   ├── config.py                    # Pipeline-specific constants
│   ├── model.py                     # MultiRepEEGModel definition
│   ├── preprocessing.py             # Full preprocessing pipeline
│   ├── inference.py                 # Inference + post-processing (consolidated)
│   ├── explainability.py            # Channel importance + brain heatmap
│   └── reporting.py                 # Clinical report builder (diagnostic state machine)
└── services/
    ├── analysis_service.py          # Pipeline orchestration
    ├── email.py                     # Multi-provider email with 3-way state logic
    ├── pdf.py                       # ReportLab PDF generation (~1348 lines)
    ├── supabase.py                  # SupabaseService with resilient schema fallback
    └── scout/
        ├── service.py               # SCOUT AI assistant (~1481 lines)
        ├── providers.py             # LLM provider fallback chain
        └── product_guide.py         # Built-in clinical knowledge base
```

> [!NOTE]
> `neurosentinel-backend/` also contains a `tests/` folder with 4 test modules: `test_chunked_inference.py`, `test_domain_shift.py`, `test_full_pipeline_mocked.py`, and `test_reporting.py`.

### 1.3 Application Factory (`main.py`)

`create_app()` builds the FastAPI instance with:

- **Lifespan manager** — initializes `BackendState`, marks any leftover `processing` jobs as `failed` on startup (stale job recovery)
- **Strict inference lock** — `threading.Lock()` ensures only ONE analysis runs at any time (protects 2 GB RAM ceiling on free tier)
- **Lazy model loading** — model loads on first inference request, not at startup (reduces cold-start time)
- **CORS** — allows all origins (Vercel frontend)

### 1.4 API Endpoints

| Endpoint | Method | Auth Required | Purpose |
|---|---|---|---|
| `/health` | GET | No | Service status, memory, model readiness |
| `/api/v1/model/info` | GET | No | Model version, parameters, declared metrics |
| `/api/v1/job/status` | GET | Bearer | Current job status, elapsed time, memory |
| `/api/v1/job/cancel` | POST | Bearer | Cancel running analysis |
| `/api/v1/analyze` | POST | Bearer | Direct EDF upload → analysis |
| `/api/v1/analyze-url` | POST | Bearer | Supabase Storage URL → analysis |
| `/api/v1/scout/chat` | POST | Bearer | SCOUT AI conversation |
| `/api/v1/internal/send-otp-email` | POST | X-Internal-Secret | OTP email relay from HF backend |
| `/api/v1/debug/config` | GET | No | Debug deployment configuration flags |

### 1.5 Threading Model

```
HTTP Request
    │
    ▼
/api/v1/analyze-url
    │
    ├── Validate auth (Supabase JWT)
    ├── Stream .edf to /tmp/ (8 KB chunks)
    ├── Create report record (status=processing)
    ├── Acquire _inference_lock (or return 409 if busy)
    └── Spawn daemon thread → _run_analysis_sync()
         │
         ├── preprocess_edf_to_data()
         ├── infer_from_data_chunked()    ← guarded every 50 windows
         ├── assess_recording_quality()
         ├── compute_channel_importance()
         ├── generate_brain_heatmap()
         ├── build_clinical_report()      ← diagnostic state machine
         ├── generate_report_pdf()        ← non-fatal
         ├── send_report_notification()   ← non-fatal
         └── Update DB: report_json, status, summary, metrics
```

### 1.6 Guard Function

Called at every chunk and every batch boundary during inference. Checks:

1. **Cancel** — user requested abort via `/api/v1/job/cancel`
2. **Timeout** — elapsed time exceeds `JOB_TIMEOUT_SECONDS = 3600` (1 hour)
3. **Memory** — reads from cgroup v2 (`/sys/fs/cgroup/memory.stat`) or cgroup v1 (`memory.usage_in_bytes`), falls back to `psutil.Process().memory_info().rss`. Logs warning and triggers `gc.collect()` if RSS > 450 MB

### 1.7 Upload Architecture (Proxy Pattern)

The frontend does **NOT** route large `.edf` files through Vercel (which has a 4 MB body limit on serverless functions). Instead:

```
Browser
  │
  ├─→ Upload .edf directly to Supabase Storage (bucket: edf-uploads)
  │         ↑ Bypasses Vercel entirely
  │
  └─→ POST /api/upload (Next.js)
        Body: { file_url, filename }  ← lightweight JSON only
          │
          └─→ Forward to HF Backend: POST /api/v1/analyze-url
                Backend downloads .edf from Supabase Storage URL
```

This avoids Vercel serverless body size limits and keeps the upload path clean.

---

## 2. Inference Pipeline (Production)

### 2.1 Two Inference Paths

| Function | Use Case | Input |
|---|---|---|
| `infer_from_data_chunked()` | Large files, production | Continuous `(22, n_samples)` array |
| `analyze_preprocessed_windows()` | Legacy/testing | Pre-windowed `(n_windows, 22, 1024)` |

### 2.2 Chunked Inference (Primary Path)

Designed specifically for Hugging Face Spaces free-tier constraints:

| Parameter | Value | Reason |
|---|---|---|
| max_windows_per_chunk | 50 | ~4 MB per chunk at float32 |
| batch_size (adaptive) | 1–4 | Based on total windows |
| Guard checks | Every chunk + every batch | Memory/cancel/timeout safety |

**Adaptive batch sizing (`_resolve_chunk_batch_size`):**

| Total Windows | Batch Size |
|---|---|
| ≥ 1500 | 1 |
| ≥ 800 | 2 |
| ≥ 300 | 2 |
| < 300 | 4 |

### 2.3 Memory Discipline

- Windows extracted using stride tricks (view, not copy)
- Each chunk's tensors `del`-ed immediately after inference
- `gc.collect()` called after every chunk boundary
- Representative window (highest seizure probability) tracked for explainability without caching all tensors
- Quality samples capped at 10 windows

### 2.4 Model Weight Loading

- Weights stored in Supabase Storage bucket `ml-models`
- Downloaded once via streaming HTTP to `/tmp/multirep_best_model_v4.pt`
- Thread-safe singleton loading via `_model_lock`
- Loaded to CPU (no GPU on Hugging Face Spaces free tier)
- Model hosted publicly: `manikondaadwith/neurosentinel-v4` on HuggingFace Model Hub

### 2.5 Production Configuration

| Setting | Value | Reason |
|---|---|---|
| analysis_batch_size | 4 (adaptive) | Ultra-low for HF Spaces RAM |
| scout_max_history | 20 messages | Limits LLM context window |
| scout_report_limit | 8 reports | Max recent reports for SCOUT |
| backend_timeout_seconds | 60 | HTTP request timeout (frontend) |
| JOB_TIMEOUT_SECONDS | 3600 | Max inference runtime |
| MAX_UPLOAD_BYTES | 1 GB | Maximum .edf file size |
| MEMORY_THRESHOLD_MB | 450 | gc.collect() trigger threshold |

---

## 3. Report Generation (Session 20 — V4.0.1)

**Source:** `app/pipeline/reporting.py` (~605 lines)

### 3.1 Diagnostic State Machine

The canonical 3-state truth model (implemented in Session 20):

```python
if enriched_events:
    diagnostic_state = "DETECTED"    # Confirmed seizure events
elif raw_prob_max > 0.5 or seizure_ratio > 0.05:
    diagnostic_state = "SUSPICIOUS"  # Model detected patterns; PP filtered them
else:
    diagnostic_state = "CLEAR"        # No seizure activity
```

This is the **single source of truth** propagated to all downstream layers: SCOUT, email, PDF, recommendations, UI cards.

### 3.2 Clinical Report JSON Structure

`build_clinical_report()` produces nested JSON with:

```json
{
  "meta": {
    "recording_id": "...",
    "generated_at": "ISO-8601",
    "duration_min": 45.2,
    "tool": "NeuroSentinel AI V4.0.1",
    "disclaimer": "..."
  },
  "signal_quality": {
    "grade": "High",
    "score": 0.87,
    "missing_channels": []
  },
  "summary": {
    "total_events": 3,
    "overall_risk": "High",
    "trend": "Worsening",
    "early_warning": false,
    "se_flag": false
  },
  "events": [
    {
      "onset": 124.0,
      "offset": 142.0,
      "duration": 18.0,
      "confidence": 0.94,
      "severity": "High",
      "risk": "Critical"
    }
  ],
  "explainability": {
    "top_channels": ["FP1-F7", "FP2-F8"],
    "top_regions": ["Left Temporal", "Right Temporal"]
  },
  "recommendations": ["..."],
  "diagnostic_state": "DETECTED",
  "suppressed_candidates": null,
  "result_label": "Seizure Detected"
}
```

For `SUSPICIOUS` state: `result_label = "Suspicious Activity"`, `suppressed_candidates` contains `n_windows_above_threshold`, `max_probability`, `seizure_ratio`, `pattern_alert_level`, `filter_criteria`, `reason`.

### 3.3 Clinical Heuristics

- **Recording Quality:** Mean quality score based on SNR (dB), line noise ratio, and flatline fraction
- **Seizure Type Characterization:** Rule-based classification:
  - Focal Impaired Awareness (short duration, isolated channels)
  - Focal Motor (asymmetric channel spread)
  - Generalized Clonic, Generalized Tonic-Clonic (bilateral spread)
  - Unclassified (default)
- **Early Warning flag:** Probability ramp detected across 3 windows preceding event onset
- **Status Epilepticus flag:** Single event ≥ 300 seconds OR cumulative seizure burden ≥ 50% in any 10-minute window

### 3.4 Suspicious Risk Derivation

`_derive_suspicious_risk()` scores evidence burden 0–10:

| Factor | Max Points | Formula |
|---|---|---|
| Window count | 3.0 | `min(n / 20, 1.0) × 3` |
| Peak probability | 3.0 | `raw_max × 3` |
| Seizure ratio | 2.0 | `min(ratio × 30, 1.0) × 2` |
| Poor quality penalty | –1.5 | Applied if quality == "poor" |
| High domain shift (≥0.7) | –1.0 | Applied if output_shift HIGH |
| Moderate domain shift (≥0.4) | –0.5 | Applied if output_shift MODERATE |

| Score | Risk Level | Alert Level |
|---|---|---|
| ≥ 5.0 | Medium | Elevated |
| ≥ 2.0 | Medium | Low |
| < 2.0 | Low | Low |

### 3.5 Recommendations Engine

`_build_recommendations()` accepts `diagnostic_state` and generates role-appropriate recommendations:

- Status epilepticus: urgent neurologist review within 24h
- Critical/High risk: escalate immediately
- **SUSPICIOUS state:** Neurologist review to evaluate clinical significance; consider extended or repeat EEG monitoring
- Early warning: close patient monitoring
- Multiple events: evaluate for seizure clustering
- Always: correlate with clinical observation

---

## 4. Explainability

**Source:** `app/pipeline/explainability.py`

### 4.1 Channel Importance (Perturbation Method)

Perturbation-based approach (saves 80–150 MB vs gradient methods):

1. Get baseline seizure probability from representative window
2. For each of 22 channels: zero out, re-run inference, measure probability drop
3. Importance = `max(0, baseline_prob - perturbed_prob)`
4. Normalize: `importance / sum(importance)` → sums to 1.0

### 4.2 Attention Maps

`extract_attention_maps()` patches Transformer `MultiheadAttention.forward`. Extracts CLS-to-token attention weights from the last encoder layer.

### 4.3 Brain Heatmap

`generate_brain_heatmap()`:
- Maps 22-channel importances to standard 10-20 electrode positions
- Region scores = mean of constituent channel importances
- Returns a `{region: score}` dict used by the `BrainHeatmap` React component

---

## 5. PDF Generation (ReportLab)

**Source:** `app/services/pdf.py` (~1348 lines)

### 5.1 Technology

ReportLab canvas API, Letter-size pages (8.5" × 11"), clinical teal color palette with NeuroSentinel branding.

### 5.2 PDF Sections

| Section | Content |
|---|---|
| Cover / Header | NeuroSentinel AI logo (base64-embedded), report metadata, recording ID |
| S0 | Report Information (patient, date, file, clinician) |
| S1 | Signal Quality (grade, score, missing channels, visual quality bar) |
| S2 | Executive Summary (result label, risk, confidence, duration, event count) |
| S3 | SCOUT Narrative (role-aware text summary from SCOUT) |
| S4 | Events Table — state-aware (DETECTED: event table; SUSPICIOUS: candidate count + max prob; CLEAR: clean bill) |
| S5 | Channel Attribution (top channels ranked by perturbation importance) |
| S6 | Recommendations — state-aware (DETECTED: urgent/share; SUSPICIOUS: extended EEG; CLEAR: continue monitoring) |
| S7 | Pipeline Metadata (model version, post-processing config, domain shift score) |
| Footer | Clinical disclaimer on every page |

### 5.3 Post-April Updates to PDF

After April 21, 2026:

- **Charts added:** Probability Timeline chart and Band Power chart are now rendered using Matplotlib and embedded as base64 PNG images in the PDF
- **Logo aligned:** NeuroSentinel AI logo (logo.jpeg) is now embedded adjacent to the branding header
- **Teal clinical theme:** Header and section bars use clinical teal (#0EA5A4) instead of blue
- **Download button:** "Open Report PDF" opens in a new browser tab (not forced download) to avoid popup blockers
- **PDF lib change:** The PDF is generated by the **Python backend** (ReportLab), proxied via `/api/reports/[id]/pdf` (Next.js route) which fetches from Supabase Storage `report-pdfs` bucket path `{user_id}/{report_id}.pdf`

### 5.4 Role-Aware Report Tone

| Role | Tone | Content Focus |
|---|---|---|
| Patient | Warm, paragraph-based | What happened, what to do next, health tips |
| Clinician | Metric-dense, structured | Lateralization, onset hypothesis, SE protocol |
| Researcher | Technical, methodological | Pipeline params, probability distribution, domain shift |

---

## 6. SCOUT AI Assistant

**Source:** `app/services/scout/service.py` (~1481 lines)

### 6.1 What SCOUT Is

**SCOUT** = **Seizure Clinical Operations and Understanding Tool**. Role-aware, context-aware AI assistant embedded in every page of the NeuroSentinel frontend. Unlike a generic LLM chat, SCOUT has:

- Full access to the current report's JSON
- Up to 8 recent reports for trend comparison
- User role and preferences from Supabase
- Page context (dashboard stats, active uploads)
- Built-in clinical knowledge base (no external dependency)
- Architectural privacy guardrails (cannot leak infrastructure details)

### 6.2 LLM Provider Fallback Chain

| Priority | Provider | Model | Trigger |
|---|---|---|---|
| 1 | Google Gemini | `gemini-2.5-flash` | Primary |
| 2 | Groq | `llama-3.3-70b-versatile` | If Gemini fails/times out |
| 3 | Hugging Face | `Llama-3.2-3B-Instruct` | Last resort |
| 4 | Deterministic | Built-in rule-based generator | If all LLMs fail |

### 6.3 Role-Aware Tone

| Role | Tone Rules |
|---|---|
| Clinician | Precise, clinical, metric-dense. Structured output. Short follow-ups. |
| Researcher | Technical, methodological. Narrative with embedded metrics. |
| Patient | Warm, calm, conversational. Paragraphs **only** — never numbered lists, never bullet points. |

### 6.4 Context Assembly

For each chat request, SCOUT assembles:

1. System prompt: role, tone rules, guardrails, diagnostic state grounding
2. Report context: full `report_json` parsed into structured details
3. Recent reports: up to 8 prior reports for trend comparison
4. User profile: email, name, preferences
5. Page data: dashboard stats, active uploads
6. Product guide snippets: relevant help content
7. Session history: last 20 messages

### 6.5 Diagnostic-State-Aware Summaries (Session 20)

Patient summary branches on `diagnostic_state`:

| State | Patient Opening Summary |
|---|---|
| DETECTED | "I detected N seizure-like event(s)... at [onset times]..." |
| SUSPICIOUS | "I found suspicious patterns — N segment(s) flagged but did not meet strict confirmation criteria..." |
| CLEAR | "I did not detect any seizure activity... brainwave activity appears within normal ranges..." |

### 6.6 Severity Guidance

| State | Risk | SCOUT Guidance |
|---|---|---|
| SUSPICIOUS | Medium | No emergency action, follow-up neurology in few weeks |
| SUSPICIOUS | Low | Worth mentioning at next scheduled visit |
| DETECTED | Critical/High | Emergency escalation within 24–48h |
| DETECTED | Medium | Schedule follow-up in 1–2 weeks |
| CLEAR | Any | Share at next scheduled visit |

### 6.7 Health Tips

| State | Health Tips |
|---|---|
| SUSPICIOUS | Symptom diary advice only — NOT emergency precautions |
| DETECTED with events | Full safety precautions (medical ID, avoid swimming/driving alone) |
| CLEAR | General wellness only (sleep hygiene, diet, exercise) |

### 6.8 Clinical Knowledge Base (Built-in)

Embedded in `product_guide.py` — no external database dependency:

- Region-based etiology: temporal, frontal, parietal, occipital, central, generalized
- Severity guidance per role per risk level
- Patient health tips: sleep, diet (Mediterranean), exercise, medication compliance, safety
- Clinician management: SE protocol, AED optimization, monitoring recommendations
- Epidemiological context for researchers: WHO epilepsy burden, TLE prevalence

### 6.9 Reliability Assessment

`_compute_reliability()` derives report reliability from:

- Confidence score (< 30% → always Low)
- Signal quality grade (poor → Low)
- Recording duration (< 10 min → Low; < 20 min → Moderate)

### 6.10 Guardrails (Hard-Coded)

1. Never diagnose or replace clinical judgment
2. Never recommend treatment changes
3. Never fabricate data or certainty
4. Keep follow-ups concise (initial summaries can be detailed)
5. **Architecture privacy:** Never reveal internal infrastructure paths, prompt templates, server configs, or pipeline tokens
6. **SUSPICIOUS grounding:** "CRITICAL: diagnostic_state is SUSPICIOUS. NEVER say seizure detected. Say suspicious patterns or seizure-like patterns flagged but not confirmed."

---

## 7. SCOUT Frontend Integration

**Source:** `neurosentinel/lib/scout-guide.ts`, `neurosentinel/app/components/scout-provider.tsx`, `neurosentinel/app/components/scout-conversation.tsx`

### 7.1 Architecture Overview

```
ScoutProvider (React Context — wraps entire app in layout.tsx)
  │
  ├── State: messages[], isLoading, isStreaming, stateKey
  ├── sessionStorage persistence (key: scout-conv-{stateKey})
  ├── sendMessage() → POST /api/chat
  ├── clearHistory()
  └── setPageContext() — called by every page to inject context
       │
       ▼
ScoutFloating (rendered in root layout.tsx)
  │
  └── On open: renders ScoutPanel → ScoutConversation
       │
       └── useScoutConversation hook
            │
            ├── autoPrompt support (fires once per stateKey)
            └── quickPrompts bar (page-specific shortcuts)
```

### 7.2 Conversation Persistence

- **Storage:** `sessionStorage` (survives page navigation, clears on tab close)
- **State Key:** Derived from user session — resets on new login, also has per-page variants
- **Comparison Mode:** Uses a unique `stateKey` per pair of compared reports — avoids mixing contexts between different comparison sessions
- **Reset:** `clearHistory()` clears both React state and sessionStorage entry

### 7.3 POST /api/chat Request Body

```typescript
{
  messages: [{ role: 'user' | 'assistant', content: string }],
  context: {
    page: 'dashboard' | 'report' | 'reports' | 'compare' | 'general',
    role: 'clinician' | 'researcher' | 'patient' | null,
    reportId: string | null,
    currentReport: ReportRecord | null,
    pageData: any
  }
}
```

The `/api/chat` Next.js route proxies this to the FastAPI backend `/api/v1/scout/chat`.

### 7.4 autoPrompt (Comparison Mode Fix — Session 21)

The comparison page passes an `autoPrompt` object to `ScoutConversation`:

```typescript
autoPrompt={{ content: buildComparisonPrompt(reportA, reportB, role), visible: false }}
```

The `useScoutConversation` hook fires `sendMessage(autoPrompt.content)` exactly **once** per `stateKey`, guarded by:

1. Both reports fully loaded (non-null)
2. No existing messages for this stateKey (prevents double-fire on re-render)
3. `useEffect` dependency array includes `[stateKey, reportsReady]` — not a blind timer

> [!NOTE]
> **Session 21 fix:** The original implementation used a blind `setTimeout(600ms)` which caused race conditions — the auto-send fired before the report data was ready, resulting in an empty SCOUT summary. The fix uses a `state-aware useEffect` that checks `reportsReady` state before sending. This eliminated comparison SCOUT failures.

### 7.5 ScoutConversation Component Props

```typescript
interface ScoutConversationProps {
  page: 'dashboard' | 'report' | 'reports' | 'general'
  role: ScoutRole
  reportId?: string | null
  currentReport?: ReportRecord | null
  pageData?: any
  stateKey?: string
  initialMessage?: string
  quickPrompts?: string[]
  autoPrompt?: { content: string; visible: boolean }
}
```

---

## 8. Email System

**Source:** `app/services/email.py` (backend), `neurosentinel/app/api/internal/send-report/route.ts` (frontend relay)

### 8.1 Provider Priority Chain (Backend)

| Priority | Provider | Config |
|---|---|---|
| 1 | Resend API | `RESEND_API_KEY` |
| 2 | Relay Proxy (Vercel) | `RELAY_API_URL` + `INTERNAL_API_SECRET` |
| 3 | SMTP (Gmail) | `SMTP_HOST/PORT/USER/PASSWORD` |

### 8.2 Why Resend (Not SMTP from Backend)

SMTP ports 465/587 are **blocked on Hugging Face Spaces** free tier due to network restrictions. Resend API uses HTTPS — works from any host. SMTP is used as a tertiary fallback via the Vercel relay proxy.

### 8.3 OTP Email Provider Chain (Frontend)

The signup/login OTP flow uses a separate 4-tier dispatch from the Vercel edge (`lib/signup-otp-store.ts`):

| Tier | Provider | Notes |
|---|---|---|
| 1 | Direct Gmail SMTP via `nodemailer` from Vercel | Primary (works if port 587 open from Vercel) |
| 2 | Brevo API (`api.brevo.com`) | Free SMTP API, no domain required |
| 3 | Resend API (`api.resend.com`) | HTTPS-based |
| 4 | HF Backend relay (`/api/v1/internal/send-otp-email`) | Final fallback |

### 8.4 OTP Security

- **Stateless verification:** HMAC-SHA256 tokens encoding `{email, otpHash, expiresAt}` signed with `OTP_SIGNING_SECRET`
- **Existing account check:** Validates against both `public.users` and `auth.users` via Supabase admin client before sending OTP (prevents sync errors)
- **Timeout chain:** SMTP 15s → fetch 55s → Vercel function 60s max duration

### 8.5 Report Email Content

HTML emails with NeuroSentinel branding (clinical white theme):

- Report link: `https://neuro-sentinel-ai-6vfv.vercel.app/report/{id}`
- Result summary, risk level, confidence, quality
- Clinical disclaimer
- **CAN-SPAM compliance** (added post-April):
  - `List-Unsubscribe` headers
  - Plain-text fallback
  - Physical address footer: **Champapet, Hyderabad 500079**

### 8.6 Email Subject Lines (State-Aware — Session 20)

| State | Subject Line |
|---|---|
| DETECTED | `Seizure Activity Detected in {filename}` |
| SUSPICIOUS | `Suspicious Patterns Found in {filename}` |
| CLEAR | `No Seizure Activity Detected in {filename}` |

### 8.7 Why Email Deliverability Required These Changes

The original implementation (SMTP only) was flagged as spam by Gmail and Yahoo filters because:

1. **No SPF/DKIM/DMARC** — the `smtp.gmail.com` relay meant emails came from Google's IP but claimed to be from NeuroSentinel's domain
2. **Spammy content** — medical words ("seizure", "detected") in subject lines without proper authentication signal
3. **No physical address** — CAN-SPAM requires a postal address in commercial emails
4. **No unsubscribe mechanism** — required by modern email standards

**Fixes applied:**

- Switched primary send path to Resend API (which handles SPF/DKIM automatically on their sending domain)
- Added `List-Unsubscribe` headers (both `mailto:` and HTTPS methods)
- Added physical address footer
- Added plain-text fallback (spam filters penalize HTML-only emails)
- Added `X-Mailer`, `Precedence: bulk` headers

---

## 9. Supabase Integration

### 9.1 Database Tables

| Table | Key Columns | Purpose |
|---|---|---|
| `users` | `id, email, role, onboarding_complete, preferences, full_name` | User profiles |
| `reports` | `id, user_id, filename, status, report_json, summary, result_label, event_count, confidence_score, quality_grade, risk_level, duration_minutes` | Analysis reports |
| `chat_messages` | `id, user_id, role, content, report_id, page_context, metadata` | SCOUT conversations |

### 9.2 Storage Buckets

| Bucket | Content |
|---|---|
| `ml-models` | Production model weights (`multirep_best_model_v4.pt`) |
| `report-pdfs` | Generated PDF reports (`{user_id}/{report_id}.pdf`) |
| `edf-uploads` | Temporary EDF files uploaded by browser |

### 9.3 Auth Flow

1. Frontend uses Supabase Auth (email/password + OTP for signup)
2. Access token sent as `Authorization: Bearer <token>` header
3. Backend verifies via `GET /auth/v1/user` with service key
4. Returns `AuthenticatedUser(id, email)`

### 9.4 Resilient Schema Pattern

`SupabaseService` uses try/except fallback:

1. First attempt: full column set (extended schema with all optional columns)
2. Fallback: base columns only (`id, user_id, filename, status, report_json`)

This prevents crashes if extended columns haven't been added yet in a new environment.

### 9.5 Row-Level Security (RLS)

RLS is enabled on the `reports` table. Users can only read/write their own reports (`user_id = auth.uid()`). The `chat_messages` table similarly scopes to `user_id`.

---

## 10. Backend Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (bypasses RLS) |
| `GEMINI_API_KEY` | ⚡ | Primary LLM for SCOUT |
| `GROQ_API_KEY` | ⚡ | Fallback LLM for SCOUT |
| `RESEND_API_KEY` | 📧 | Email notifications |
| `SMTP_HOST/PORT/USER/PASSWORD` | 📧 | Fallback email |
| `APP_URL` | 🔗 | Frontend URL for email links |
| `INTERNAL_API_SECRET` | 🔒 | Shared secret for OTP relay |
| `MODEL_PATH` | Optional | Local model path override |

---

**Continues in:** [Chapter 3 — Frontend Architecture & UI](./guide_part3_frontend_ui.md)

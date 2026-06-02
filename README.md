<![CDATA[<div align="center">

<img src="logo.jpeg" alt="NeuroSentinel AI Logo" width="120" height="120" style="border-radius:16px"/>

# NeuroSentinel AI

**Clinical-grade automated EEG seizure detection — from raw `.edf` to structured clinical report.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://neurosentinel.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Hugging%20Face%20Spaces-yellow?logo=huggingface)](https://huggingface.co/spaces/manikondaadwith/neurosentinel-backend)
[![Model](https://img.shields.io/badge/Model-MultiRepEEGModel%20V4-blue)](docs/technical_guide.md)
[![Accuracy](https://img.shields.io/badge/Accuracy-99.55%25-brightgreen)]()
[![Macro F1](https://img.shields.io/badge/Macro%20F1-0.979-brightgreen)]()
[![Params](https://img.shields.io/badge/Params-409K-lightgrey)]()
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

</div>

---

## Overview

NeuroSentinel AI is an end-to-end clinical decision support system for automated seizure detection from scalp EEG recordings. Upload an `.edf` file, get a structured report — complete with an AI-powered assistant (SCOUT), explainability heatmaps, a band-power chart, and a downloadable PDF — in minutes.

> **Disclaimer:** NeuroSentinel AI is a decision support tool only. It does not diagnose, prescribe, or replace clinical judgment. The system is not FDA approved.

---

## Key Metrics

| Metric | Value |
|---|---|
| Window-level Accuracy | **99.55%** |
| Macro F1 (primary) | **0.979** |
| ROC-AUC | **0.980** |
| PR-AUC | **0.9474** |
| Event Sensitivity (CHB-MIT test) | **73.3%** (22/30 seizures) |
| Event FP/hour | **0.98** |
| Detection Latency | **3.5 s** (median) |
| Zero-shot Siena Sensitivity | **80.0%** |
| Model Parameters | **409,154** |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  NeuroSentinel AI                    │
├────────────────────┬─────────────────────────────────┤
│   Frontend (Next.js│14)         Backend (FastAPI)     │
│   Vercel           │            Hugging Face Spaces   │
│                    │                                  │
│  Landing Page      │  /api/v1/analyze                 │
│  Auth (Supabase)   │  EEG Preprocessing               │
│  Upload → Job poll │  MultiRepEEGModel V4             │
│  Report Viewer     │  Post-processing (ADP)           │
│  SCOUT Chat UI     │  Explainability (GradCAM)        │
│  PDF download      │  SCOUT AI (Gemini)               │
│  Email reports     │  PDF generation                  │
└────────────────────┴─────────────────────────────────┘
              ↕ Supabase (Auth + DB + Storage)
```

See [docs/system_architecture.png](docs/system_architecture.png) for the full diagram.

---

## Repository Structure

```
kmec-ps-G1108/
├── neurosentinel/          # Next.js 14 frontend → deployed on Vercel
│   ├── app/                # App Router pages, API routes, components
│   ├── lib/                # Supabase clients, types, utilities
│   └── .env.example        # Required environment variables (template)
│
├── neurosentinel-backend/  # FastAPI backend → deployed on Hugging Face Spaces
│   ├── app/
│   │   ├── pipeline/       # Preprocessing, model, inference, reporting
│   │   ├── services/       # Analysis, PDF, email, SCOUT AI
│   │   └── api/            # Request/response schemas
│   ├── tests/              # Pytest test suite
│   ├── Dockerfile          # HF Spaces container
│   └── pyproject.toml      # Python dependencies
│
├── docs/
│   ├── technical_guide.md  # Deep-dive: ML pipeline, model, metrics, deployment
│   ├── system_architecture.png
│   └── supabase_schema.sql # Database schema
│
├── NeuroSentinel_AI_production.ipynb  # Training & evaluation notebook
└── logo.jpeg
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18, npm ≥ 9
- Python ≥ 3.11
- A [Supabase](https://supabase.com) project
- A [Google Gemini](https://ai.google.dev) API key (for SCOUT)

---

### Frontend — Next.js (Vercel)

```bash
cd neurosentinel

# 1. Install dependencies
npm install

# 2. Copy env template and fill in your values
cp .env.example .env.local

# 3. Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Environment variables** — see [neurosentinel/.env.example](neurosentinel/.env.example) for the full list:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `GOOGLE_GEMINI_API_KEY` | Gemini API key for SCOUT |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Gmail credentials for email reports |
| `NEUROSENTINEL_BACKEND_URL` | URL of the deployed FastAPI backend |
| `OTP_SIGNING_SECRET` | 32-char secret for OTP signing |

---

### Backend — FastAPI (Hugging Face Spaces / Docker)

```bash
cd neurosentinel-backend

# 1. Create a virtual environment
python -m venv .venv && source .venv/bin/activate

# 2. Install dependencies
pip install -e ".[dev]"

# 3. Copy env and fill in values
cp ../.env.example .env   # only backend-relevant vars are needed

# 4. Run the server
uvicorn app.main:app --reload --port 7860
```

**Docker (matches HF Spaces exactly):**

```bash
cd neurosentinel-backend
docker build -t neurosentinel-backend .
docker run -p 7860:7860 --env-file .env neurosentinel-backend
```

---

### Database — Supabase

Apply the schema to your Supabase project:

```bash
# From the Supabase dashboard SQL editor, run:
docs/supabase_schema.sql
```

---

## Deployment

| Service | Target | Config |
|---|---|---|
| **Frontend** | [Vercel](https://vercel.com) | Root dir: `neurosentinel/`, set env vars in dashboard |
| **Backend** | [Hugging Face Spaces](https://huggingface.co/spaces) | Docker SDK, `Dockerfile` in `neurosentinel-backend/` |
| **Database** | [Supabase](https://supabase.com) | Apply `docs/supabase_schema.sql` |
| **Model weights** | Supabase Storage (`ml-models` bucket) | Uploaded separately — not stored in git |

A GitHub Actions workflow (`.github/workflows/hf-keep-awake.yml`) pings the HF Space every 24 hours to prevent cold-start sleep.

---

## ML Model

**MultiRepEEGModel V4** — a 3-branch fusion architecture with 409K parameters:

- **Branch 1:** Raw EEG → EEGNet CNN + Transformer (CLS token)
- **Branch 2:** Spectrogram → STFT CNN
- **Branch 3:** Band Power → MLP (delta / theta / alpha / beta / gamma)

Trained on CHB-MIT Scalp EEG (patient-level splits, no leakage). Evaluated zero-shot on Siena Scalp EEG.

> For full model documentation, training config, post-processing pipeline, and metric breakdowns → **[docs/technical_guide.md](docs/technical_guide.md)**

---

## Testing

```bash
cd neurosentinel-backend
pytest tests/ -v
```

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and run `pytest`
3. Open a pull request against `main`

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

Built by **Team G1108** · KMEC Problem Statement · 2026

</div>
]]>

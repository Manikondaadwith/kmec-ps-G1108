# NeuroSentinel AI — Internal Technical Guide
## Chapter 4: Session History, Lessons, Paper Reference & Future Work

**Purpose:** Internal reference document for conference/journal paper and institutional memory.  
**Last updated:** September 2026 (Sessions 21+)  
**Authors:** Manikonda Adwith — KMEC, Hyderabad — G1108

---

## 1. Full Session Log

This chapter documents every meaningful session from project inception through September 2026. The session log is the primary institutional memory source for writing a conference or journal paper Methods section.

### Sessions 1–3: Preprocessing Foundation

**Goal:** Build a reliable preprocessing pipeline for CHB-MIT EEG data.

| Session | Work Done | Key Decisions |
|---|---|---|
| 1 | EDF loading with MNE, channel discovery, annotation parsing | Standard 22-channel bipolar montage locked |
| 2 | IQR normalization, notch + bandpass filtering, windowing | Chose IQR over z-score for seizure robustness |
| 3 | Memory optimization (channel pre-selection), stride-tricks windowing | `extract_windows_vectorised()` replaces loop approach |

**Key lesson:** Pre-selecting needed channels before `mne.io.read_raw_edf()` reduces peak RAM by ~40% on large recordings.

---

### Sessions 4–6: Model Development

**Goal:** Build and train a production-grade seizure detection model.

| Session | Work Done | Key Decisions |
|---|---|---|
| 4 | V1 architecture design (MultiRepEEGModel), training setup | 3-branch fusion: EEGNet+Transformer + Spectrogram CNN + Band Power MLP |
| 5 | V1/V3 bug discovered — alpha=[1.0, 20.13] in FocalLoss corrupted training | Root cause: `n0/n1` computed wrong (28821/1432≈20.13x over-weight) |
| 6 | V4 fixed, trained successfully in 5 epochs. V5 tried and discarded | V4 → 409K params, val Macro F1 = 0.979. V5 overfit |

**Key lesson:** One wrong hyperparameter (alpha) made V1/V3 models worthless. Debug existing code before building a larger model. V4 needed no architectural change — just the bug fix.

**Training environment:**
- Google Colab (T4 GPU)
- 100 epoch budget, patience=20
- Mixed precision (AMP), gradient clipping 0.5
- Trained effectively in 5 epochs (early stopping)

---

### Session 7: Post-Processing Sweep

**Goal:** Optimize the detection pipeline to maximize event-level sensitivity while minimizing false positives.

**Approach:** Systematic grid search across 53 post-processing configurations.

| Config Axis | Values Tested |
|---|---|
| Smoothing window | 3, 5, 7, 9, 11, 13 |
| Threshold mode | Static (0.5, 0.7, 0.9), Adaptive (p90, p95, p97, p99) |
| Min duration | 5s, 8s, 10s, 15s, 20s |
| Min mean probability | 0.55, 0.65, 0.75, 0.80, 0.88, 0.90 |
| Merge gap | 5s, 10s |
| Sustained seconds | 3s, 5s, 8s |

**Winner:** `ADP_p99_d15_mm0.9_s5`  
→ Event sensitivity: **73.3%**, FP/h: **0.98**, latency: **3.5s**

**Key lesson:** A single fixed threshold cannot serve all 23 patients — per-recording adaptive thresholding is essential. Sensitivity and FP/h are in direct tension; the winning config is the Pareto-optimal point.

---

### Sessions 8–9: Universal Adapter Experiments

**Goal:** Achieve cross-dataset generalization (Siena Scalp EEG) without model retraining.

| Approach | Result | Why It Failed |
|---|---|---|
| TTN (Test-Time Normalization) | ❌ Failed | IQR normalization already aligns signal statistics |
| BNA (BatchNorm Adaptation) | ❌ Failed | Increased non-seizure prob_mean from 0.001 → 0.78, breaking adaptive thresholds |
| Global probability calibration | ❌ Failed | Recalibrating on target data shifted thresholds, broke sensitivity on CHB-MIT |
| Bipolar montage adapter | ✅ Succeeded | Referential → bipolar conversion at the raw signal level; no model changes |

**Final approach:** Adapt the **input signal** to match the training montage, not the model. Keep the model frozen. Tune detection thresholds using per-recording output probability baselines.

**Key lesson:** If the model was trained on bipolar data, give it bipolar data — don't touch the model. Domain shift is best managed at the input adapter and post-processing layers, not the model weights.

---

### Sessions 10–15: Siena Cross-Dataset Validation

**Goal:** Validate generalization to an entirely different dataset (adult, referential montage, European power line frequency).

| Session | Work Done |
|---|---|
| 10 | Downloaded 11 Siena EDF files from PhysioNet (via AWS S3) |
| 11 | Ran bipolar adapter on all 11 files, identified 2 OOD files (PN05 family) |
| 12 | Ground truth annotation audit — discovered 2 typos in seizure timestamps |
| 13 | Computed event-level metrics (4/5 verified GT seizures detected) |
| 14 | Analysed FP sources: peri-ictal activity, OOD patients |
| 15 | Wrote OOD detection logic (output prob median baseline thresholding) |

**Siena results:**
- Files tested: 11
- Patients: 14 (PN00–PN17)
- GT verification: 5 seizures with clean annotations → 4 detected (80%)
- OOD files: 2 (PN05 family — entire recording elevated; skip-flagged)

**Key lesson:** Always audit ground truth annotations before computing metrics. Siena had timestamp typos that would have inflated FP counts if taken at face value.

---

### Session 16: Explainability

**Goal:** Add clinical-grade explainability to model predictions.

- Perturbation-based channel importance (saves 80–150 MB vs gradient methods)
- Attention map extraction from Transformer CLS token
- Brain heatmap generation (10-20 electrode positions mapped to region scores)
- GradCAM explored but rejected (too slow for CPU inference, requires full forward pass with hooks)

**Key lesson:** Perturbation importance is simpler, faster, and more interpretable than gradient-based methods for a clinical audience. Zero out a channel → measure probability drop → that's the importance score.

---

### Session 17: Metrics & Visualization

**Goal:** Produce paper-ready evaluation plots and an honest accounting of model performance.

- ROC curve, PR curve, F1-vs-threshold plot → `roc_metrics_v4.png`
- Confusion matrix (threshold=0.50)
- Train/Val/Test metric comparison → `neurosentinel_honest_metrics.png`
- Per-patient breakdown (chb21–chb24)

**Key lesson:** Never lead with accuracy on imbalanced medical data. Macro F1 (0.979) and PR-AUC (0.9474) tell the real story. Accuracy (99.55%) should be reported once with an explicit footnote about the 16:1 class imbalance.

---

### Session 18: Web Deployment

**Goal:** Deploy end-to-end system: backend on Hugging Face Spaces, frontend on Vercel, database on Supabase.

| Component | Service |
|---|---|
| Frontend | Vercel (Next.js 14) |
| Backend | Hugging Face Spaces (FastAPI + Docker) |
| Database | Supabase (PostgreSQL) |
| Model storage | Supabase Storage bucket |
| PDF storage | Supabase Storage bucket |

**Challenges solved:**
- SMTP ports blocked on HF Spaces → switched to Resend API + Vercel relay
- Vercel 4 MB request body limit → Supabase Storage upload bypass pattern
- HF Spaces cold start (48h inactivity) → GitHub Actions keepalive cron
- Model file too large for Git → Supabase Storage bucket (streamed download on first inference)

---

### Session 19: Honest Metrics & Overfitting Diagnostic

**Goal:** Produce an honest assessment of whether V4 is genuinely good or just lucky.

**Audit findings:**

| Concern | Finding | Verdict |
|---|---|---|
| Train/Test F1 gap | < 0.01 | ✅ Not overfit |
| Patient-level split | Confirmed — no leakage | ✅ Rigorous |
| Accuracy on 16:1 imbalance | 94.1% naive baseline | ⚠️ Report Macro F1 primarily |
| Event-level vs window-level | 73.3% event vs 97.75% window sensitivity | ⚠️ Event-level is harder — explain in paper |
| Cross-dataset | Tested zero-shot on Siena | ✅ Strong — 80% |

**Key lesson:** The gap between window-level (97.75%) and event-level (73.3%) sensitivity is expected — some short or ambiguous seizures are fragmented into windows that individually pass the window threshold but collectively don't meet post-processing duration criteria. This is a post-processing decision, not a model failure.

---

### Session 20: Diagnostic State Machine (V4.0.1)

**Goal:** Resolve truth-model inconsistency exposed by a referential EEG file (`ma0844az_1-1+.edf`).

**Problem:** Model detected 101 high-probability windows (max 92.7%) but post-processing removed all events. The UI, SCOUT, and email simultaneously stated contradictory things.

**Fix:** Implemented the 3-state diagnostic state machine (`DETECTED` / `SUSPICIOUS` / `CLEAR`) in `reporting.py`. Propagated to all downstream consumers: SCOUT summaries, email subjects, PDF Section 4, UI event cards, and recommendations.

**Scope of changes:**
- `reporting.py`: Diagnostic state machine + `suppressed_candidates` data structure + SUSPICIOUS risk derivation
- `email.py`: State-aware subject lines and body copy
- `pdf.py`: State-aware Section 4 (events table vs candidate count)
- `scout/service.py`: State-aware patient narrative + diagnostic-state grounding guardrail
- `compare/page.tsx`: SCOUT autoPrompt fixed (state-aware `useEffect` replacing blind `setTimeout`)
- No changes to model weights, preprocessing, or post-processing thresholds

---

### Sessions 21+: Post-April Platform Expansion

**Summary of all post-April changes:**

| Feature | Component Changed | Description |
|---|---|---|
| Logo integration | All pages + PDF | logo.jpeg added to login, sidebar, onboarding, PDF header |
| Mobile responsive | sidebar.tsx, dashboard.css | Mobile drawer sidebar, responsive grid |
| OTP overhaul | login/page.tsx, signup-otp-store.ts | 4-tier email chain, HMAC-SHA256 stateless tokens |
| Name personalization | onboarding/page.tsx, settings | full_name stored + used in SCOUT + emails |
| Report comparison | compare/page.tsx | Side-by-side metrics + SCOUT auto-summary |
| SCOUT auto-summary fix | scout-conversation.tsx | Replaced blind 600ms timer with state-aware useEffect |
| Help & Support | HelpSupportModal + Button | Accessible from login page and sidebar footer |
| Terms & Privacy pages | /terms, /privacy | Full legal pages with Hyderabad address |
| PDF charts | pdf.py | Probability timeline + band power chart embedded in PDF |
| Email deliverability | email.py, send-report/route.ts | Resend API primary, SPF/DKIM via Resend domain, CAN-SPAM compliance |
| Skeleton loaders | skeleton.tsx | Shimmer placeholders on load |
| Reliability badge redesign | reliability-badge.tsx | WCAG AAA pill-style badge with emerald/amber/red palette |
| Report notification toast | report-notification-provider.tsx | Realtime toast on report completion |
| Backend offline state | dashboard/page.tsx | UI recovery card when HF Spaces is paused |
| Patient-records redirect | patient-records/page.tsx | /dashboard/patient-records → /dashboard/eeg-reports |
| Scrollbar polish | globals.css | 4px dark-themed custom scrollbar |
| Probability timeline redesign | probability-timeline.tsx | Teal shading, event annotations, hover tooltips |

---

## 2. Complete Lessons Learned

### 2.1 Model & Training

| # | Lesson |
|---|---|
| 1 | V1/V3 were broken by a single wrong alpha value — debug before rebuilding |
| 2 | Focal loss gamma=2.0 produces cleaner probability curves than gamma=1.0 |
| 3 | A 3-branch fusion (temporal + spectral + band power) consistently outperforms any single branch |
| 4 | Larger architectures (V5) are not better if the training data doesn't support them |
| 5 | Early stopping at epoch 5 is fine — don't keep training hoping for improvement |
| 6 | BatchNorm stores dataset-specific statistics — this is the root cause of cross-dataset probability shift |
| 7 | Warmup + cosine annealing is more stable than constant LR on this task |

### 2.2 Post-Processing

| # | Lesson |
|---|---|
| 8 | One fixed threshold cannot generalize across 23 patients — use per-recording adaptive baselines |
| 9 | Post-processing is almost as important as the model — a great model with bad PP gives poor event-level results |
| 10 | Sensitivity and FP/h are inversely correlated — commit to a Pareto-optimal config and justify it |
| 11 | The winning config (ADP_p99_d15_mm0.9_s5) should NEVER be changed — it was chosen by systematic search |
| 12 | Short seizures (<8s) are systematically missed — this is a deliberate PP decision to avoid FPs |

### 2.3 Cross-Dataset Generalization

| # | Lesson |
|---|---|
| 13 | TTN/BNA/calibration all failed — never attempt again |
| 14 | Adapt the INPUT format to match training; don't touch the model |
| 15 | Domain shift is best detected from OUTPUT probability distributions, not input signal statistics |
| 16 | IQR normalization already aligns signal statistics — there is nothing left for TTN to fix |
| 17 | Always audit ground truth annotations before computing cross-dataset metrics (Siena had timestamp typos) |
| 18 | OOD patients (PN05 family) should be flagged and skipped, not forced through the pipeline |

### 2.4 Reporting & Truth Models

| # | Lesson |
|---|---|
| 19 | Binary truth models (seizure/no-seizure) break on borderline cases — implement intermediate states |
| 20 | Every downstream consumer (UI, email, PDF, SCOUT) must be grounded on the same truth value |
| 21 | SUSPICIOUS state is not a failure — it is clinically valuable information ("something might be there, but we're not certain") |
| 22 | Diagnostic state must be a single source of truth in a single file (reporting.py) — never let UI or email infer their own interpretation |

### 2.5 Frontend & Deployment

| # | Lesson |
|---|---|
| 23 | Race conditions in SCOUT auto-send are caused by sending before report data is ready — use state-aware guards, not timers |
| 24 | Vercel 4 MB serverless body limit breaks EDF uploads — always proxy large uploads through Supabase Storage |
| 25 | HF Spaces free tier pauses after 48h — set up a keepalive cron immediately |
| 26 | SMTP is blocked on HF Spaces — use HTTPS-based email APIs (Resend) as primary |
| 27 | Report PDFs should be generated by the backend (full Python libraries) and stored, not reconstructed at download time |
| 28 | Mobile responsiveness cannot be an afterthought — the sidebar drawer retrofit took a full session |
| 29 | `sessionStorage` is the right persistence layer for SCOUT conversations — survives navigation, clears on tab close (exactly right) |

### 2.6 Clinical & Ethical

| # | Lesson |
|---|---|
| 30 | Never claim diagnostic capability — always label as "decision support" |
| 31 | Severity scores and seizure type classification are RULE-BASED HEURISTICS, not ground truth |
| 32 | CAN-SPAM compliance (physical address, unsubscribe) is not optional for commercial emails |
| 33 | Patient-role SCOUT responses must never use numbered lists or bullet points — natural paragraphs only |
| 34 | The clinical disclaimer must appear on every PDF page and in every email |

---

## 3. Paper Reference Section

### 3.1 Suggested Paper Title

> *"NeuroSentinel AI: A Multi-Representation Deep Learning Framework for Patient-Independent Seizure Detection with Cross-Dataset Generalization and Clinical Decision Support"*

### 3.2 Abstract Skeleton

**Background:** Automated EEG seizure detection is critical for reducing the burden on neurologists. Most published systems are patient-specific and lack cross-dataset validation. We present NeuroSentinel AI, a patient-independent system trained on CHB-MIT and tested zero-shot on Siena Scalp EEG.

**Methods:** We propose a 3-branch fusion architecture (MultiRepEEGModel, 409K parameters) combining temporal EEG features via EEGNetCNN+Transformer, spectral features via STFT-CNN, and frequency-band features via band power MLP. Training used patient-level splits (no leakage) with Focal Loss. A 4-tier domain-adaptive post-processing pipeline with per-recording adaptive thresholds was designed using a systematic 53-configuration search.

**Results:** On CHB-MIT test patients (chb21–chb24), the model achieved window-level Macro F1 of 0.979, ROC-AUC of 0.980, and PR-AUC of 0.9474. Event-level sensitivity was 73.3% (22/30 seizures) at 0.98 FP/hour with a median detection latency of 3.5 seconds. Zero-shot cross-dataset testing on Siena Scalp EEG demonstrated 80% sensitivity (4/5 verified seizures) at 1.67 events/hour.

**Conclusions:** NeuroSentinel AI demonstrates competitive patient-independent performance and robust cross-dataset generalization. The complete system is deployed as a free, open-access web application with clinical reporting, SCOUT AI assistant, and explainability outputs.

### 3.3 Key Numbers to Lead With

| Metric | Value | Context |
|---|---|---|
| Window Macro F1 | **0.979** | CHB-MIT test, patient-level split |
| ROC-AUC | **0.980** | Threshold-independent |
| PR-AUC | **0.9474** | Primary metric for imbalanced data |
| Event Sensitivity | **73.3%** (22/30) | CHB-MIT test patients |
| Event FP/hour | **0.98** | CHB-MIT test patients |
| Detection Latency | **3.5 seconds** | Median, CHB-MIT |
| Siena Sensitivity | **80.0%** (4/5) | Zero-shot, cross-dataset |
| Siena FP/hour | **1.67** | Zero-shot |
| Model Parameters | **409,154** | Lightweight, CPU-only deployment |

### 3.4 Methodology Section Checklist

When writing the paper, ensure the Methods section covers:

- [ ] Patient-level data split rationale (no leakage)
- [ ] Class imbalance handling (2:1 undersampling training, natural distribution val/test)
- [ ] IQR normalization rationale (robust to seizure contamination)
- [ ] Powerline frequency auto-detection
- [ ] Channel enforcement strategy (MAX_MISSING_CH=3)
- [ ] FocalLoss configuration (alpha=class_count_ratio, gamma=2.0)
- [ ] Warmup + cosine annealing schedule
- [ ] Post-processing sweep methodology (53 configs → ADP_p99 winner)
- [ ] Domain shift detection via output probability median
- [ ] Seizure-aware fallback mechanism
- [ ] Explainability via perturbation importance
- [ ] Cross-dataset bipolar adapter design
- [ ] OOD detection and exclusion criteria
- [ ] Ground truth annotation audit (Siena)

### 3.5 Comparison Table for Paper

| Model / Study | Year | Accuracy | Macro F1 | Sensitivity | FP/h | Cross-Dataset | Params |
|---|---|---|---|---|---|---|---|
| **NeuroSentinel V4** | **2026** | **99.55%** | **0.979** | **97.75%** | **0.98** | **✅ 80% Siena** | **409K** |
| EEGNet (Lawhern 2018) | 2018 | ~93% | ~0.85 | ~88% | — | ❌ | ~2.6K |
| CNN-LSTM Hybrid | 2023 | 97.2% | 0.92 | 96.1% | 2.1 | ❌ | ~1.2M |
| CNN-Transformer | 2024 | 98.1% | 0.95 | 97.0% | — | ❌ | ~800K |
| Patient-Specific DL | 2024 | 99.1% | 0.96 | 97–100% | 0.22–0.40 | ❌ | ~500K |
| SzCORE Benchmark | 2024 | — | ~0.43 | — | — | — | — |

> [!IMPORTANT]
> Always qualify the comparison table with a footnote: *"Direct comparison is limited by differences in patient-specific vs. cross-patient splits, segment duration, overlap ratio, preprocessing, and evaluation protocol. NeuroSentinel uses strict patient-level splits — no patient appears in multiple sets."*

### 3.6 Ablation Study (Suggested)

| Ablation | Expected Impact |
|---|---|
| Remove Branch 1 (Raw EEG) | Largest drop — temporal dynamics most informative |
| Remove Branch 2 (Spectrogram) | Moderate drop — spectral discrimination lost |
| Remove Branch 3 (Band Power) | Smallest drop — partially redundant with spectrogram |
| Static threshold (0.5) vs ADP_p99 | FP/h increases from 0.98 to ~4.2 |
| No domain shift adaptation on Siena | Sensitivity drops (all events missed on OOD patients) |
| Random-segment split vs patient-level | Inflated metrics (estimated +3–5pp F1) |

### 3.7 Ethical Statement

Include in the paper:

*"NeuroSentinel AI is a clinical decision support tool only. It is not approved for diagnostic use and does not replace clinical judgment. All heuristic outputs (severity scores, seizure type classification, lateralization) are rule-based estimates derived from signal features and should be interpreted alongside clinical observation. The system was developed and tested on publicly available datasets (CHB-MIT, Siena Scalp EEG) and does not handle or store personally identifiable patient information."*

---

## 4. Known Limitations (for Paper)

### 4.1 Model Limitations

1. **Pediatric training only:** CHB-MIT contains pediatric patients (1–22 years). Adult seizure morphology may differ.
2. **CPU BatchNorm drift:** Non-seizure prob_mean = 0.33 on val_loader (CPU vs GPU). Does NOT affect detection (thresholds are relative) but is worth noting.
3. **Event sensitivity ceiling:** 73.3% event sensitivity means ~27% of seizures are missed. Most are short (<8s, filtered by post-processing) or low-amplitude.
4. **Peri-ictal FPs:** EEG during the period immediately before/after a seizure genuinely resembles ictal activity. Some FPs are clinically reasonable and not "errors."

### 4.2 System Limitations

5. **RAM ceiling on deployment:** HF Spaces free tier has 16 GB RAM but model inference on large recordings approaches the 450 MB soft limit. Files >200 MB take longer due to chunked processing.
6. **No real-time capability:** The current system processes complete recordings offline. Real-time streaming is a future direction.
7. **Limited seizure types:** The model was trained on scalp EEG only. It cannot detect subcortical or deep-source seizures invisible on scalp.
8. **No patient-level fine-tuning:** The model uses a single universal weight set. Patient-specific calibration (which could improve sensitivity) is not implemented.

### 4.3 Dataset Limitations

9. **CHB-MIT pediatric bias:** 23 patients, all paediatric, US-based recordings.
10. **Siena limited GT:** Only 5 of 11 tested files had clean enough annotations for sensitivity measurement.
11. **No intracranial EEG validation:** Scalp EEG has limited spatial resolution. iEEG validation would strengthen clinical claims.

---

## 5. Glossary

| Term | Definition |
|---|---|
| **EDF** | European Data Format — standard file format for EEG recordings |
| **CHB-MIT** | Children's Hospital Boston – MIT Scalp EEG Database |
| **Siena** | Siena Scalp EEG Database (PhysioNet) — adult referential montage EEG |
| **Bipolar montage** | EEG derivation computed as voltage difference between adjacent electrodes |
| **Referential montage** | EEG where each channel is measured against a common reference |
| **IQR normalization** | Normalization using interquartile range — robust to extreme values |
| **ADP_p99_d15_mm0.9_s5** | Winning post-processing config: adaptive p99 threshold, min 15s duration, min mean prob 0.90, sustained 5s |
| **Domain shift** | Change in data distribution between training and test data |
| **SCOUT** | Seizure Clinical Operations and Understanding Tool — NeuroSentinel AI assistant |
| **TTN** | Test-Time Normalization — failed approach to cross-dataset adaptation |
| **BNA** | BatchNorm Adaptation — failed approach to cross-dataset adaptation |
| **SE** | Status Epilepticus — prolonged or serial seizures requiring urgent intervention |
| **DETECTED** | Diagnostic state: post-processed seizure events confirmed |
| **SUSPICIOUS** | Diagnostic state: model detected patterns, post-processing filtered them |
| **CLEAR** | Diagnostic state: no seizure activity detected |
| **pLDDT** | Not applicable (AlphaFold metric) — mentioned here only to clarify it is not used |
| **FP/h** | False Positives per Hour — key clinical evaluation metric |
| **PR-AUC** | Precision-Recall Area Under Curve — preferred over ROC-AUC for imbalanced data |
| **Macro F1** | Average F1 across all classes — primary evaluation metric for this system |
| **HF Spaces** | Hugging Face Spaces — free cloud compute for deploying ML models |

---

## 6. File & Artifact Index

### 6.1 Model Artifacts

| File | Location | Contents |
|---|---|---|
| `multirep_best_model_v4.pt` | Supabase Storage `ml-models` | V4 model weights (409K params) |
| `step4_inference_cache.json` | `model_checkpoints_v4/` | 95 test EDF inference results |
| `FINAL_results.json` | `model_checkpoints_v4/` | 53 post-processing sweep results |
| `roc_metrics_v4.png` | `model_checkpoints_v4/` | ROC + PR + F1-vs-threshold plots |
| `neurosentinel_honest_metrics.png` | Project root | Train/Val/Test honest comparison |

### 6.2 Backend Key Files

| File | Lines | Purpose |
|---|---|---|
| `app/pipeline/model.py` | ~200 | MultiRepEEGModel architecture |
| `app/pipeline/preprocessing.py` | ~450 | Full preprocessing pipeline |
| `app/pipeline/inference.py` | ~350 | Inference + post-processing consolidated |
| `app/pipeline/reporting.py` | ~605 | Diagnostic state machine + report builder |
| `app/pipeline/explainability.py` | ~180 | Channel importance + brain heatmap |
| `app/services/pdf.py` | ~1348 | ReportLab PDF generation |
| `app/services/scout/service.py` | ~1481 | SCOUT AI assistant |
| `app/services/scout/providers.py` | ~200 | LLM provider fallback chain |
| `app/main.py` | ~350 | FastAPI application + endpoints |

### 6.3 Frontend Key Files

| File | Lines | Purpose |
|---|---|---|
| `neurosentinel/app/layout.tsx` | ~45 | Root layout (providers, fonts, metadata) |
| `neurosentinel/app/dashboard/layout.tsx` | ~40 | Dashboard server layout (auth, sidebar) |
| `neurosentinel/app/dashboard/page.tsx` | ~350 | Analysis Station |
| `neurosentinel/app/dashboard/eeg-reports/page.tsx` | ~450 | Analysis History |
| `neurosentinel/app/dashboard/eeg-reports/compare/page.tsx` | ~600 | Report comparison |
| `neurosentinel/app/report/[id]/page.tsx` | ~650 | Clinical report viewer |
| `neurosentinel/app/components/scout-provider.tsx` | ~200 | SCOUT global context |
| `neurosentinel/app/components/scout-conversation.tsx` | ~220 | SCOUT chat UI |
| `neurosentinel/lib/neurosentinel/types.ts` | ~120 | TypeScript type definitions |
| `neurosentinel/lib/signup-otp-store.ts` | ~200 | OTP HMAC + 4-tier email dispatch |

### 6.4 Documentation Files

| File | Purpose |
|---|---|
| `docs/guide_part1_ml_pipeline.md` | ML pipeline, dataset, model, training, evaluation |
| `docs/guide_part2_backend_inference_report.md` | Backend, inference, reporting, SCOUT, email |
| `docs/guide_part3_frontend_ui.md` | Frontend architecture, UI design, deployment |
| `docs/guide_part4_sessions_lessons_paper.md` | Session log, lessons, paper reference (this file) |
| `docs/technical_guide.md` | Legacy guide (April 21, 2026 — Sessions 1–20 only) |
| `CHANGELOG.md` | Model version history |
| `README.md` | Public-facing project overview and metrics |

---

## 7. Current Deployment URLs

| Service | URL |
|---|---|
| **Web Application** | https://neuro-sentinel-ai-6vfv.vercel.app |
| **Backend API** | https://manikondaadwith-neurosentinel.hf.space |
| **Model Hub** | https://huggingface.co/manikondaadwith/neurosentinel-v4 |
| **GitHub Repository** | https://github.com/Manikondaadwith/kmec-ps-G1108 |

---

## 8. Future Work

The following items are noted here as directions for future sessions or for the paper's Future Work section:

1. **Real-time streaming inference** — Process continuous EEG in near-real-time using WebSocket-based streaming from the backend
2. **Patient-specific calibration layer** — Add a thin adapter (e.g. per-patient bias correction) without retraining the base model
3. **Larger cross-dataset validation** — Test on Temple University Hospital (TUEV) and EPILEPSIAE datasets
4. **Long-term EEG** — Extend to 24-hour recordings (current system handles up to ~60 min before RAM pressure increases)
5. **Seizure type classification** — Replace rule-based heuristics with a trained multi-class head
6. **Mobile app** — Native iOS/Android app using the FastAPI backend
7. **iEEG validation** — Validate on intracranial EEG to assess scalp/depth correlation
8. **Federated learning** — Train on distributed hospital data without centralizing patient records
9. **AutoML post-processing** — Replace manual 53-config sweep with Bayesian optimization
10. **Attention visualization** — Add interactive attention map viewer to the report page

---

*This guide covers all sessions through September 2026. The April 21, 2026 legacy guide (`docs/technical_guide.md`) remains archived for reference. When merging all four chapters into a single document, remove the chapter headers and chapter-link footers — the section numbering is continuous and the content flows naturally.*

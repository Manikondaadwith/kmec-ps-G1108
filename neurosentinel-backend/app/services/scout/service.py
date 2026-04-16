from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any

from app.config import Settings
from app.pipeline.config import SCOUT_FULL_NAME
from app.services.scout.product_guide import select_product_snippets
from app.services.scout.providers import (
    GeminiScoutProvider,
    GroqScoutProvider,
    HuggingFaceScoutProvider,
    ProviderUnavailableError,
    ScoutProvider,
)
from app.services.supabase import SupabaseService

logger = logging.getLogger(__name__)

AUTO_SUMMARY_PREFIX = "__SCOUT_AUTO_SUMMARY__"
TRUNCATION_MARKERS = (
    "too lengthy",
    "too long",
    "continue if you want",
    "continue and i can",
    "i couldn't send",
    "i could not send",
    "rest of the response",
    "token limit",
    "length limit",
)


@dataclass
class ScoutContext:
    user_id: str
    message: str
    page: str
    role: str | None
    report_id: str | None
    current_report: dict[str, Any] | None
    session_history: list[dict[str, str]] | None = None


def _normalize_role(role: str | None) -> str:
    if role in {"clinician", "researcher", "patient"}:
        return role
    return "clinician"


def _safe_report_summary(report: dict[str, Any] | None) -> str:
    if not report:
        return "No current report is open."
    summary = report.get("summary") or "No summary is available."
    result_label = report.get("result_label") or "unknown"
    risk_level = report.get("risk_level") or "unknown"
    confidence = report.get("confidence_score")
    confidence_text = f"{confidence:.1f}%" if isinstance(confidence, (int, float)) else "unknown"
    return f"Current report: {result_label}, risk {risk_level}, confidence {confidence_text}. Summary: {summary}"


def _format_pct(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.1f}%"
    return "unknown"


def _format_minutes(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.1f} min"
    return "unknown"


def _format_event_brief(event: dict[str, Any]) -> str:
    onset = event.get("onset_sec") or event.get("start_sec") or "?"
    duration = event.get("duration_sec") or "?"
    risk = event.get("risk_level") or "unknown"
    confidence = event.get("confidence_pct")
    if confidence is None:
        probability = event.get("mean_probability")
        confidence = round(float(probability) * 100, 1) if isinstance(probability, (int, float)) else "unknown"
    pattern = event.get("pattern") or event.get("pattern_type") or "unknown"
    return f"onset {onset}s, duration {duration}s, confidence {confidence}%, risk {risk}, pattern {pattern}"


def _collect_report_details(report: dict[str, Any]) -> dict[str, Any]:
    report_json = report.get("report_json") or {}
    report_json = report_json if isinstance(report_json, dict) else {}
    clinical_report = report_json.get("clinical_report") if isinstance(report_json.get("clinical_report"), dict) else {}
    summary = clinical_report.get("summary") if isinstance(clinical_report.get("summary"), dict) else {}
    quality = report_json.get("quality") if isinstance(report_json.get("quality"), dict) else {}
    signal_quality = clinical_report.get("signal_quality") if isinstance(clinical_report.get("signal_quality"), dict) else {}
    explainability = report_json.get("explainability") if isinstance(report_json.get("explainability"), dict) else {}
    model_outputs = report_json.get("model_outputs") if isinstance(report_json.get("model_outputs"), dict) else {}
    events = clinical_report.get("events") if isinstance(clinical_report.get("events"), list) else report_json.get("events", [])
    recommendations = clinical_report.get("recommendations") if isinstance(clinical_report.get("recommendations"), list) else []
    probability_summary = model_outputs.get("probability_summary") if isinstance(model_outputs.get("probability_summary"), dict) else {}
    top_channels = explainability.get("top_channels") if isinstance(explainability.get("top_channels"), list) else []
    top_regions = explainability.get("top_regions") if isinstance(explainability.get("top_regions"), list) else report_json.get("top_regions", [])

    return {
        "filename": report.get("filename") or report_json.get("file_name") or "this report",
        "result_label": report.get("result_label") or report_json.get("result_label") or "unknown",
        "risk_level": report.get("risk_level") or report_json.get("risk_level") or summary.get("overall_risk") or "unknown",
        "confidence_text": _format_pct(report.get("confidence_score")),
        "duration_text": _format_minutes(report.get("duration_minutes") or report_json.get("duration_minutes")),
        "quality_grade": report.get("quality_grade") or report_json.get("quality_grade") or signal_quality.get("grade") or quality.get("dominant_grade") or quality.get("grade") or "unknown",
        "quality_score": quality.get("mean_quality_score") or signal_quality.get("score") or report_json.get("quality_score") or "unknown",
        "event_count": report.get("event_count") or len(events) or report_json.get("event_count") or 0,
        "events": events if isinstance(events, list) else [],
        "trend": report_json.get("trend_summary") or summary.get("trend_summary") or report.get("summary") or "No trend summary available.",
        "early_warning": bool(report_json.get("early_warning") or summary.get("early_warning")),
        "se_flag": bool(report_json.get("se_flag") or summary.get("status_epilepticus")),
        "probability_summary": probability_summary,
        "events_per_hour": model_outputs.get("events_per_hour"),
        "domain_shift": model_outputs.get("shift_label") or report_json.get("domain_shift_label") or report_json.get("shift_label") or "not reported",
        "top_channels": top_channels if isinstance(top_channels, list) else [],
        "top_regions": top_regions if isinstance(top_regions, list) else [],
        "channel_summary": report_json.get("channel_importance_summary") or "not reported",
        "recommendations": recommendations if isinstance(recommendations, list) else [],
    }


# ═══════════════════════════════════════════════════════════════════
# Clinical knowledge base — causes, health tips, diet, lifestyle
# ═══════════════════════════════════════════════════════════════════

_REGION_ETIOLOGY: dict[str, str] = {
    "temporal": "Temporal lobe involvement is the most common origin of focal seizures. Common causes include mesial temporal sclerosis, hippocampal abnormalities, tumors, or vascular malformations. Temporal lobe epilepsy can cause auras, deja vu, or emotional shifts before a seizure.",
    "frontal": "Frontal lobe seizures often present with brief, nocturnal episodes and may include unusual motor movements. Common causes include cortical dysplasia, traumatic injury, or tumors. They can sometimes be mistaken for sleep disorders.",
    "parietal": "Parietal lobe involvement may cause sensory symptoms such as tingling, numbness, or spatial disorientation. Causes can include structural lesions, post-traumatic changes, or cortical dysplasia.",
    "occipital": "Occipital lobe seizures typically cause visual symptoms like flashing lights, visual loss, or eye movement changes. Common causes include cortical malformations, posterior cerebral artery infarctions, or migraine-related conditions.",
    "central": "Central region involvement suggests activity near the motor or sensory cortex. This can cause contralateral motor or sensory symptoms. Causes may include structural lesions, cortical dysplasia, or post-surgical changes.",
    "generalized": "Generalized patterns suggest widespread cortical involvement rather than a focal origin. Common causes include genetic/idiopathic generalized epilepsies, metabolic disturbances, or medication-related factors.",
}

_GENERAL_SEIZURE_CAUSES = (
    "Seizures can arise from many causes including genetic predisposition, head injuries, "
    "brain infections (meningitis, encephalitis), stroke, brain tumors, metabolic imbalances "
    "(low blood sugar, electrolyte disturbances), sleep deprivation, high fever, drug or "
    "alcohol withdrawal, and certain medications. In many cases, the exact cause is not "
    "immediately identifiable and requires further clinical investigation."
)


def _get_severity_guidance_patient(risk: str, event_count: int | Any, se_flag: bool) -> str:
    """Return warm, plain-language guidance based on severity for patients."""
    risk_lower = (risk or "").lower()

    if se_flag or risk_lower in ("critical", "high"):
        return (
            "Given the severity of these findings, it is very important that you contact your "
            "healthcare provider or neurologist as soon as possible — ideally within the next "
            "24 to 48 hours. Do not drive or operate heavy machinery until you have been "
            "evaluated. If you experience a prolonged seizure (lasting more than 5 minutes), "
            "repeated seizures without recovery, or difficulty breathing, call emergency "
            "services immediately. Keep someone informed about your condition and avoid being "
            "alone near water, heights, or open flames until you have medical guidance."
        )
    elif risk_lower in ("moderate", "medium"):
        return (
            "These findings suggest a moderate level of concern. You should schedule a follow-up "
            "appointment with your neurologist within the next one to two weeks to review these "
            "results in detail. In the meantime, prioritize getting adequate sleep, managing "
            "stress, and avoiding known triggers. Make sure someone close to you knows about "
            "your condition and what to do if a seizure occurs."
        )
    elif risk_lower == "low":
        return (
            "The findings suggest a low level of concern, which is reassuring. However, it is "
            "still a good idea to share this report with your doctor at your next scheduled "
            "visit. Continue maintaining healthy habits — regular sleep, stress management, "
            "and consistent medication (if prescribed) remain your best ongoing protections."
        )
    else:
        return (
            "Please share this report with your healthcare provider at your next appointment "
            "so they can review the results alongside your clinical history and determine "
            "whether any further evaluation is needed."
        )


def _get_health_tips_patient(risk: str, event_count: int | Any) -> str:
    """Comprehensive health, diet, and lifestyle tips for patients."""
    risk_lower = (risk or "").lower()
    has_events = isinstance(event_count, int) and event_count > 0

    tips = (
        "Here are some important health and lifestyle tips that can help manage your neurological well-being. "
        "Sleep is one of the most powerful factors — aim for 7 to 9 hours of consistent sleep each night and "
        "try to maintain a regular sleep schedule, as sleep deprivation is a well-known seizure trigger. "
        "Stress management is equally important; consider practices like deep breathing, meditation, gentle "
        "yoga, or regular walks in nature."
    )

    diet = (
        "When it comes to diet, focus on balanced, regular meals — skipping meals can lower blood sugar "
        "and increase seizure risk. Stay well hydrated throughout the day. Some studies suggest that a "
        "Mediterranean-style diet rich in vegetables, fruits, whole grains, lean proteins, and healthy fats "
        "(like olive oil and omega-3 fatty acids from fish) may support brain health. Limit excessive caffeine "
        "and avoid alcohol, as both can lower the seizure threshold. If you are on anti-seizure medication, "
        "be aware that grapefruit can interact with some medications — check with your pharmacist."
    )

    lifestyle = (
        "From a lifestyle perspective, regular moderate exercise such as walking, swimming, or cycling is "
        "beneficial for overall brain health and mood. Avoid extreme exhaustion and overheating. Keep a "
        "seizure diary to track any episodes, missed medications, sleep patterns, or unusual stress — this "
        "information is invaluable for your doctor when adjusting your treatment plan."
    )

    if has_events or risk_lower in ("critical", "high", "moderate", "medium"):
        safety = (
            "For safety, let family members or housemates know what to do during a seizure: keep the person "
            "safe from injury, do not put anything in their mouth, time the seizure, and call emergency services "
            "if it lasts longer than 5 minutes. Avoid swimming alone, and take showers rather than baths when possible. "
            "Consider wearing a medical ID bracelet that notes your condition."
        )
        return f"{tips}\n\n{diet}\n\n{lifestyle}\n\n{safety}"

    return f"{tips}\n\n{diet}\n\n{lifestyle}"


def _get_etiology_context(top_regions: list) -> str:
    """Derive likely etiology notes based on active brain regions."""
    if not top_regions:
        return _GENERAL_SEIZURE_CAUSES

    parts: list[str] = []
    seen_regions: set[str] = set()

    for item in top_regions[:4]:
        if isinstance(item, (list, tuple)):
            region_name = str(item[0]).lower()
        else:
            region_name = str(item).lower()

        for key, explanation in _REGION_ETIOLOGY.items():
            if key in region_name and key not in seen_regions:
                seen_regions.add(key)
                parts.append(explanation)

    if not parts:
        return _GENERAL_SEIZURE_CAUSES

    return " ".join(parts) + " " + _GENERAL_SEIZURE_CAUSES


def _get_severity_guidance_clinician(risk: str, event_count: int | Any, se_flag: bool) -> str:
    """Concise clinical management considerations for clinicians."""
    risk_lower = (risk or "").lower()

    if se_flag:
        return "Management: SE protocol — IV access, benzodiazepine loading, continuous EEG monitoring. Urgent neurology consult."
    if risk_lower in ("critical", "high"):
        return "Management: urgent neurology review within 24-48h. Consider AED optimization, extended EEG monitoring, MRI if not recent."
    if risk_lower in ("moderate", "medium"):
        return "Management: schedule neurology follow-up 1-2 weeks. Review AED compliance, sleep hygiene, trigger avoidance."
    if risk_lower == "low":
        return "Management: routine follow-up. Continue current regimen. Reinforce lifestyle factors — sleep, stress, medication adherence."
    return "Management: clinical correlation recommended."


def _get_etiology_clinician(top_regions: list) -> str:
    """Brief differential/etiology for clinicians based on regions."""
    if not top_regions:
        return "Etiology: consider structural, metabolic, genetic, or idiopathic causes. MRI + clinical correlation recommended."

    region_labels: list[str] = []
    for item in top_regions[:3]:
        if isinstance(item, (list, tuple)):
            region_labels.append(str(item[0]))
        else:
            region_labels.append(str(item))

    region_text = ", ".join(region_labels)
    differentials: list[str] = []

    combined = " ".join(r.lower() for r in region_labels)
    if "temporal" in combined:
        differentials.append("MTS/hippocampal sclerosis")
    if "frontal" in combined:
        differentials.append("cortical dysplasia/FLE")
    if "occipital" in combined:
        differentials.append("posterior cortical lesion")

    diff_text = ", ".join(differentials) if differentials else "structural/metabolic/genetic"
    return f"Etiology: prominent regions {region_text}. Differential: {diff_text}. MRI correlation advised."


def _get_researcher_context(top_regions: list, risk: str) -> str:
    """Epidemiological and clinical context for researchers."""
    risk_lower = (risk or "").lower()

    epi = (
        "Clinical context: epilepsy affects approximately 50 million people worldwide (WHO). "
        "Temporal lobe epilepsy is the most common form of focal epilepsy, accounting for ~60% of cases. "
        "Drug-resistant epilepsy occurs in ~30% of patients. "
    )

    if risk_lower in ("critical", "high"):
        epi += "High-risk findings correlate with increased morbidity and SUDEP risk, warranting aggressive management and monitoring protocols."
    elif risk_lower in ("moderate", "medium"):
        epi += "Moderate-risk profiles may indicate subclinical activity warranting longitudinal monitoring and AED optimization studies."
    else:
        epi += "Low-risk profiles are consistent with benign variants or well-controlled seizure disorders."

    return epi


# ═══════════════════════════════════════════════════════════════════
# Report summary builders
# ═══════════════════════════════════════════════════════════════════

def _build_report_reply(report: dict[str, Any], role: str) -> str:
    """Build a detailed, role-aware summary of a report.

    Patient  -> warm, multi-paragraph narrative; no numbered points.
    Clinician -> concise, metric-dense structured output.
    Researcher -> hybrid narrative with embedded metrics and methodology notes.
    """
    details = _collect_report_details(report)
    events = [event for event in details["events"] if isinstance(event, dict)]
    top_channels = details["top_channels"]
    top_regions = details["top_regions"]
    recommendations = details["recommendations"]
    probability_summary = details["probability_summary"]
    normalized_role = _normalize_role(role)

    if normalized_role == "patient":
        return _build_patient_summary(details, events, top_channels, top_regions, recommendations, probability_summary)
    elif normalized_role == "researcher":
        return _build_researcher_summary(details, events, top_channels, top_regions, recommendations, probability_summary)
    else:
        return _build_clinician_summary(details, events, top_channels, top_regions, recommendations, probability_summary)


def _build_patient_summary(
    details: dict[str, Any],
    events: list[dict[str, Any]],
    top_channels: list,
    top_regions: list,
    recommendations: list,
    probability_summary: dict,
) -> str:
    """Warm, paragraph-based narrative for patients — no numbered lists."""
    filename = details["filename"]
    result = details["result_label"]
    risk = details["risk_level"]
    confidence = details["confidence_text"]
    quality = details["quality_grade"]
    duration = details["duration_text"]
    event_count = details["event_count"]
    trend = details["trend"]

    paragraphs: list[str] = []

    # Opening
    if result.lower() == "seizure detected" or (isinstance(event_count, int) and event_count > 0):
        paragraphs.append(
            f"I have finished reviewing your EEG recording \"{filename}\". "
            f"The analysis has detected seizure-like activity in the recording. "
            f"Specifically, the system flagged {event_count} segment(s) that show patterns consistent with seizure events, "
            f"and the overall risk level has been assessed as {risk}. "
            f"The model's confidence in this finding is {confidence}."
        )
    else:
        paragraphs.append(
            f"I have finished reviewing your EEG recording \"{filename}\". "
            f"The good news is that the analysis did not detect any seizure activity in this recording. "
            f"The overall risk level is {risk} and the model's confidence in this assessment is {confidence}."
        )

    # Quality & duration
    paragraphs.append(
        f"The recording was {duration} long and the signal quality was graded as {quality}. "
        f"Good signal quality means the system had clear data to work with, which makes the results more reliable. "
        f"If the quality had been poor, the results would need to be interpreted more cautiously."
    )

    # Events detail
    if events:
        first = events[0]
        onset = first.get("onset_sec") or first.get("start_sec") or "unknown"
        dur = first.get("duration_sec") or "unknown"
        paragraphs.append(
            f"The most notable event was detected at around {onset} seconds into the recording and lasted approximately {dur} seconds. "
            + (f"There were {len(events) - 1} additional segment(s) that also showed unusual patterns. " if len(events) > 1 else "")
            + "These flagged segments represent areas where the brainwave patterns looked different from what would typically be expected during normal activity."
        )
    else:
        paragraphs.append(
            "No segments in the recording showed patterns that the system considers concerning. "
            "This means the brainwave activity throughout the entire recording appeared within normal expected ranges."
        )

    # Brain regions
    if top_regions:
        if isinstance(top_regions[0], (list, tuple)):
            region_names = [name for name, _ in top_regions[:3]]
        else:
            region_names = [str(r) for r in top_regions[:3]]
        region_text = ", ".join(region_names)
        paragraphs.append(
            f"The brain regions that showed the most activity during the recording were {region_text}. "
            "Think of this as a map showing where the system focused its attention most. "
            "This information can help your doctor understand which part of the brain might need closer monitoring."
        )

    # Likely causes
    paragraphs.append(
        "Understanding what might cause these patterns can be helpful. " + _get_etiology_context(top_regions)
    )

    # Trend & flags
    flag_parts: list[str] = []
    if details["se_flag"]:
        flag_parts.append("the system has raised a status epilepticus flag, which means it detected prolonged or rapidly recurring seizure-like activity that may need urgent attention")
    if details["early_warning"]:
        flag_parts.append("an early warning signal was detected, suggesting there may be patterns that precede seizure activity")

    if flag_parts:
        paragraphs.append(
            "There are some important flags to be aware of: " + ", and ".join(flag_parts) + ". "
            "Please make sure to discuss these flags with your healthcare provider as soon as possible."
        )

    # Overall trend
    if trend and trend.lower() != "no trend summary available.":
        paragraphs.append(f"Overall trend: {trend}")

    # Severity-based what-to-do guidance
    paragraphs.append(
        _get_severity_guidance_patient(risk, event_count, details["se_flag"])
    )

    # Health, diet, and lifestyle tips
    paragraphs.append(
        _get_health_tips_patient(risk, event_count)
    )

    # Recommendations & disclaimer
    if recommendations:
        rec_text = ". ".join(recommendations[:3])
        paragraphs.append(
            f"The clinical recommendations from this analysis include: {rec_text}. "
            "Remember, this report is generated by an AI system and is meant to support your doctor in making decisions — it is not a diagnosis on its own. "
            "Please share this report with your healthcare provider so they can review the findings alongside your clinical history."
        )
    else:
        paragraphs.append(
            "This report is generated by an AI system and is meant to support clinical decisions, not replace them. "
            "Please share it with your healthcare provider so they can review the findings in the context of your overall health."
        )

    return "\n\n".join(paragraphs)


def _build_clinician_summary(
    details: dict[str, Any],
    events: list[dict[str, Any]],
    top_channels: list,
    top_regions: list,
    recommendations: list,
    probability_summary: dict,
) -> str:
    """Concise, metric-dense structured summary for clinicians formatted for Markdown."""
    lines: list[str] = []

    lines.append(f"- **Report:** {details['filename']}")
    lines.append(f"- **Result:** {details['result_label']} | **Risk:** {details['risk_level']} | **Confidence:** {details['confidence_text']} | **Events:** {details['event_count']}")
    lines.append(f"- **Duration:** {details['duration_text']} | **Quality:** {details['quality_grade']} ({details['quality_score']}/1.0)")

    if probability_summary:
        lines.append(
            f"- **Probability:** mean {probability_summary.get('mean', '?')}, "
            f"median {probability_summary.get('median', '?')}, "
            f"p99 {probability_summary.get('p99', '?')}, "
            f"max {probability_summary.get('max', '?')}"
        )

    if events:
        lines.append(f"- **Primary event:** {_format_event_brief(events[0])}")
        if len(events) > 1:
            lines.append(f"- **Additional events:** {len(events) - 1} segment(s) flagged for review")
    else:
        lines.append("- **Event burden:** zero for the analyzed recording window")

    if top_channels:
        channel_text = ", ".join(f"{ch} ({sc:.3f})" for ch, sc in top_channels[:5])
        lines.append(f"- **Top channels:** {channel_text}")
    elif details["channel_summary"] and details["channel_summary"] != "not reported":
        lines.append(f"- **Channel summary:** {details['channel_summary']}")

    if top_regions:
        if isinstance(top_regions[0], (list, tuple)):
            region_text = ", ".join(f"{name} ({score:.3f})" for name, score in top_regions[:4])
        else:
            region_text = ", ".join(str(r) for r in top_regions[:4])
        lines.append(f"- **Active regions:** {region_text}")

    lines.append(f"- **Domain shift:** {details['domain_shift']}")

    flags: list[str] = []
    if details["se_flag"]:
        flags.append("SE flag raised")
    if details["early_warning"]:
        flags.append("early warning signal")
    if details["events_per_hour"] is not None:
        flags.append(f"events/hr: {details['events_per_hour']}")
    lines.append(f"- **Critical flags:** {', '.join(flags) if flags else 'none'}")

    if details["trend"] and details["trend"].lower() != "no trend summary available.":
        lines.append(f"- **Clinical summary:** {details['trend']}")

    # Etiology & differential
    lines.append(f"- **{_get_etiology_clinician(top_regions)}**")

    # Management guidance
    lines.append(f"- **{_get_severity_guidance_clinician(details['risk_level'], details['event_count'], details['se_flag'])}**")

    if recommendations:
        for i, rec in enumerate(recommendations[:3], 1):
            lines.append(f"- **Rec {i}:** {rec}")

    return "\n\n".join(lines)


def _build_researcher_summary(
    details: dict[str, Any],
    events: list[dict[str, Any]],
    top_channels: list,
    top_regions: list,
    recommendations: list,
    probability_summary: dict,
) -> str:
    """Hybrid narrative with embedded metrics for researchers."""
    paragraphs: list[str] = []

    # Overview paragraph with metrics
    paragraphs.append(
        f"Analysis of \"{details['filename']}\" is complete. "
        f"Result: {details['result_label']}, risk level {details['risk_level']}, "
        f"model confidence {details['confidence_text']}, "
        f"event count {details['event_count']}. "
        f"Recording duration was {details['duration_text']} with signal quality graded {details['quality_grade']} "
        f"(score {details['quality_score']}/1.0). Domain shift: {details['domain_shift']}."
    )

    # Probability & events
    if probability_summary:
        paragraphs.append(
            f"Probability distribution: mean {probability_summary.get('mean', '?')}, "
            f"median {probability_summary.get('median', '?')}, "
            f"p99 {probability_summary.get('p99', '?')}, "
            f"max {probability_summary.get('max', '?')}."
        )

    if events:
        event_lines = [f"Primary event: {_format_event_brief(events[0])}."]
        if len(events) > 1:
            event_lines.append(f"{len(events) - 1} additional segment(s) require cross-validation against raw traces.")
        paragraphs.append(" ".join(event_lines))
    else:
        paragraphs.append("No events survived post-processing filters. Event burden is zero for the analyzed window.")

    # Explainability
    explainability_parts: list[str] = []
    if top_channels:
        channel_text = ", ".join(f"{ch} ({sc:.3f})" for ch, sc in top_channels[:5])
        explainability_parts.append(f"Top channels by importance: {channel_text}.")
    if top_regions:
        if isinstance(top_regions[0], (list, tuple)):
            region_text = ", ".join(f"{name} ({score:.3f})" for name, score in top_regions[:4])
        else:
            region_text = ", ".join(str(r) for r in top_regions[:4])
        explainability_parts.append(f"Active regions: {region_text}.")
    if explainability_parts:
        paragraphs.append(" ".join(explainability_parts))

    # Flags
    flags: list[str] = []
    if details["se_flag"]:
        flags.append("status epilepticus flag")
    if details["early_warning"]:
        flags.append("early warning signal")
    if details["events_per_hour"] is not None:
        flags.append(f"events/hr: {details['events_per_hour']}")
    if flags:
        paragraphs.append(f"Critical flags: {', '.join(flags)}.")

    # Trend
    if details["trend"] and details["trend"].lower() != "no trend summary available.":
        paragraphs.append(f"Trend summary: {details['trend']}")

    # Epidemiological & clinical context for researchers
    paragraphs.append(_get_researcher_context(top_regions, details["risk_level"]))

    # Methodology note
    paragraphs.append(
        "Methodological note: all [HEURISTIC] labels are rule-based estimates, not ground-truth annotations. "
        "Cross-validate flagged segments against raw EEG traces before drawing conclusions. "
        "Model outputs are decision-support evidence and should not be treated as definitive clinical annotations."
    )

    if recommendations:
        rec_text = "; ".join(recommendations[:3])
        paragraphs.append(f"Recommendations: {rec_text}.")

    return "\n\n".join(paragraphs)


def _is_auto_summary_request(message: str) -> bool:
    return message.strip().startswith(AUTO_SUMMARY_PREFIX)


def _is_report_summary_intent(message: str, report: dict[str, Any] | None) -> bool:
    if not report:
        return False
    if _is_auto_summary_request(message):
        return True
    query = message.lower()
    summary_terms = [
        "summarize",
        "summarise",
        "summary",
        "walk through",
        "walk me through",
        "review this report",
        "review the report",
        "explain this report",
        "explain the report",
        "technical summary",
        "clinical summary",
    ]
    return any(term in query for term in summary_terms)


def _needs_response_normalization(message: str) -> bool:
    lowered = message.lower()
    return any(marker in lowered for marker in TRUNCATION_MARKERS)


def _deterministic_fallback(context: ScoutContext, user_profile: dict[str, Any] | None, recent_reports: list[dict[str, Any]], report: dict[str, Any] | None) -> str:
    query = context.message.lower()
    role = _normalize_role(context.role or (user_profile or {}).get("role"))
    if any(term in query for term in ["diagnose", "treat", "medication", "prescribe"]):
        return "I can explain NeuroSentinel results and product behavior, but I cannot diagnose, prescribe, or recommend treatment changes."
    if any(term in query for term in ["upload", "start", "tour", "dashboard"]):
        return "Start on the dashboard, upload an EDF file, and NeuroSentinel will create a pending report immediately while the backend analyzes the recording asynchronously."
    if any(term in query for term in ["memory", "remember", "history", "chat"]):
        return "SCOUT keeps chat messages for this session only. When you log out or start a new session, the conversation resets."
    if _is_report_summary_intent(context.message, report or context.current_report):
        return _build_report_reply((report or context.current_report), role)  # type: ignore[arg-type]

    recent_count = len(recent_reports)
    return (
        f"{SCOUT_FULL_NAME} is online in {role} mode. "
        f"I can help with onboarding, uploads, and report explanation. "
        f"You currently have {recent_count} recent report(s)."
    )


def _normalize_provider_message(
    message: str,
    context: ScoutContext,
    user_profile: dict[str, Any] | None,
    recent_reports: list[dict[str, Any]],
    report: dict[str, Any] | None,
) -> tuple[str, bool]:
    cleaned = message.strip()
    if cleaned and not _needs_response_normalization(cleaned):
        return cleaned, False

    if report:
        role = _normalize_role(context.role or (user_profile or {}).get("role"))
        return _build_report_reply(report, role), True

    return _deterministic_fallback(context, user_profile, recent_reports, report), True


class ScoutService:
    def __init__(self, settings: Settings, supabase_service: SupabaseService) -> None:
        self.settings = settings
        self.supabase_service = supabase_service
        providers: list[ScoutProvider] = []
        if settings.resolved_gemini_api_key:
            providers.append(GeminiScoutProvider(settings))
        if settings.groq_api_key:
            providers.append(GroqScoutProvider(settings))
        if settings.huggingface_api_key:
            providers.append(HuggingFaceScoutProvider(settings))
        self.providers = providers

    async def chat(self, context: ScoutContext) -> dict[str, Any]:
        user_profile = self.supabase_service.fetch_user_profile(context.user_id)
        if context.session_history:
            history = context.session_history
        else:
            history = self.supabase_service.fetch_recent_chat_messages(context.user_id, self.settings.scout_max_history)
        current_report = self.supabase_service.fetch_report(context.user_id, context.report_id) if context.report_id else None
        active_report = current_report or context.current_report
        recent_reports = self.supabase_service.fetch_recent_reports(context.user_id, self.settings.scout_report_limit)
        product_snippets = select_product_snippets(context.page, context.message)
        resolved_role = _normalize_role(context.role or (user_profile or {}).get("role"))

        tool_outputs = {
            "fetch_user_role_profile": user_profile,
            "fetch_last_20_chat_messages": history,
            "fetch_current_report": current_report,
            "fetch_recent_reports_list": recent_reports,
            "fetch_static_product_snippets": product_snippets,
        }

        if _is_report_summary_intent(context.message, active_report):
            return {
                "message": _build_report_reply(active_report, resolved_role),  # type: ignore[arg-type]
                "provider": "deterministic-report",
                "tools_used": list(tool_outputs.keys()),
                "fallback": False,
                "provider_failures": [],
            }

        system_prompt = self._build_system_prompt(context, user_profile, history, active_report, recent_reports, product_snippets)
        provider_failures: list[str] = []
        for provider in self.providers:
            try:
                logger.info("Attempting SCOUT provider: %s", provider.name)
                result = await provider.generate(system_prompt=system_prompt, user_message=context.message)
                normalized_message, normalized = _normalize_provider_message(
                    result.message,
                    context,
                    user_profile,
                    recent_reports,
                    active_report,
                )
                return {
                    "message": normalized_message,
                    "provider": result.provider if not normalized else "deterministic-fallback",
                    "tools_used": list(tool_outputs.keys()),
                    "fallback": normalized,
                    "provider_failures": provider_failures,
                }
            except ProviderUnavailableError as exc:
                logger.warning("SCOUT provider %s unavailable: %s", provider.name, exc)
                provider_failures.append(f"{provider.name}: {exc}")
                continue
            except Exception as exc:
                logger.warning("SCOUT provider %s failed: %s", provider.name, exc)
                provider_failures.append(f"{provider.name}: {exc}")
                continue

        return {
            "message": _deterministic_fallback(context, user_profile, recent_reports, active_report),
            "provider": "deterministic-fallback",
            "tools_used": list(tool_outputs.keys()),
            "fallback": True,
            "provider_failures": provider_failures,
        }

    def _build_system_prompt(
        self,
        context: ScoutContext,
        user_profile: dict[str, Any] | None,
        history: list[dict[str, Any]],
        current_report: dict[str, Any] | None,
        recent_reports: list[dict[str, Any]],
        product_snippets: list[dict[str, Any]],
    ) -> str:
        role = _normalize_role(context.role or (user_profile or {}).get("role"))
        role_instructions = {
            "clinician": (
                "Be clinical, structured, and metric-dense. Provide concise paragraph-style responses. Do not use bulleted lists or pipe-separated lines for regular responses unless explicitly requested. "
                "MANDATORY: Provide strict HEALTH INTERPRETATION (explain significance of findings) and ACTIONABLE GUIDANCE (suggest what to do next, e.g., 'consider video-EEG monitoring'). "
                "Focus purely on interpretation and next steps."
            ),
            "researcher": (
                "Be technical and methodological. Use a hybrid of narrative context and embedded metrics. Include confidence bounds, methodology cues, and domain shift notes. Balance readability with data density."
            ),
            "patient": (
                "Be warm, calm, and conversational. Write in flowing paragraphs — NEVER use numbered lists, bullet points, or structured metric dumps. Explain everything in plain language. "
                "MANDATORY: Provide clear HEALTH INTERPRETATION (explain in simple terms what the result means and possible reasons like abnormal electrical activity or seizure patterns). "
                "MANDATORY: Provide ACTIONABLE GUIDANCE (suggest what to do next and what kind of follow-up is needed, e.g., 'Consult your neurologist'). "
                "MANDATORY: Include health tips about medication adherence, sleep hygiene, stress management, and trigger avoidance. "
                "If past reports/trends are available, compare trends (e.g., 'Compared to your previous reports, activity appears stable')."
            ),
        }
        history_lines = [f"{message['role']}: {message['content']}" for message in history[-8:]]
        reports_summary = [
            f"{report.get('filename', 'Unknown file')} | {report.get('status', 'unknown')} | {report.get('result_label', 'unknown')} | risk={report.get('risk_level', 'unknown')}"
            for report in recent_reports[:5]
        ]
        snippet_text = [f"{snippet['title']}: {snippet['body']}" for snippet in product_snippets]

        report_context_lines: list[str] = []
        if current_report:
            details = _collect_report_details(current_report)
            report_context_lines.extend(
                [
                    _safe_report_summary(current_report),
                    f"Result: {details['result_label']}",
                    f"Risk: {details['risk_level']}",
                    f"Confidence: {details['confidence_text']}",
                    f"Duration: {details['duration_text']}",
                    f"Quality: {details['quality_grade']} ({details['quality_score']}/1.0)",
                    f"Trend: {details['trend']}",
                    f"Domain shift: {details['domain_shift']}",
                ]
            )
            if details["events"]:
                report_context_lines.append(f"Representative event: {_format_event_brief(details['events'][0])}.")
            if details["top_channels"]:
                channel_text = ", ".join(f"{channel} ({score:.3f})" for channel, score in details["top_channels"][:3])
                report_context_lines.append(f"Top channels: {channel_text}")
            elif details["channel_summary"]:
                report_context_lines.append(f"Channel summary: {details['channel_summary']}")
            if details["top_regions"]:
                if isinstance(details["top_regions"][0], (list, tuple)):
                    region_text = ", ".join(f"{name} ({score:.3f})" for name, score in details["top_regions"][:3])
                else:
                    region_text = ", ".join(str(region) for region in details["top_regions"][:3])
                report_context_lines.append(f"Top regions: {region_text}")
            if details["recommendations"]:
                report_context_lines.append(f"Primary recommendation: {details['recommendations'][0]}")
        else:
            report_context_lines.append("No current report is open.")

        # Role-specific formatting rules
        format_rules = {
            "patient": (
                "FORMATTING RULES FOR PATIENT MODE:\n"
                "- Write in warm, clear language. NEVER use numbered lists, bullet points, or structured data dumps.\n"
                "- Explain medical terms in simple words. Use analogies when helpful.\n"
                "- Keep a calm and reassuring tone throughout.\n"
                "- For normal chat, keep responses extremely precise and brief (1-3 sentences maximum)."
            ),
            "clinician": (
                "FORMATTING RULES FOR CLINICIAN MODE:\n"
                "- Write in a professional, concise, and highly clinical tone.\n"
                "- No excessive narrative — lead with core insights and data.\n"
                "- NEVER format responses using pipe characters (|). Write in natural sentences.\n"
                "- For normal chat, keep responses to 1-3 concise lines maximum."
            ),
            "researcher": (
                "FORMATTING RULES FOR RESEARCHER MODE:\n"
                "- Focus on technical details, raw metrics, and methodology.\n"
                "- Include confidence bounds and statistical measures.\n"
                "- NEVER format responses using pipe characters (|). Write in natural sentences.\n"
                "- For normal chat, keep responses to 1-3 concise lines maximum."
            ),
        }

        return "\n".join(
            [
                f"You are {SCOUT_FULL_NAME}, the bounded in-product assistant for NeuroSentinel AI.",
                "You help with onboarding, product help, and report explanation.",
                "Never diagnose, prescribe, or recommend treatment changes.",
                "If a value is missing from context, say it is unknown.",
                f"User role: {role}",
                f"Role instruction: {role_instructions[role]}",
                format_rules[role],
                f"CRITICAL: You MUST calibrate EVERY response for the '{role}' role. "
                f"{'Write in plain, calm, and brief language. Avoid jargon. No numbered lists or bullets ever.' if role == 'patient' else 'Use precise clinical terminology with structured metric-dense findings.' if role == 'clinician' else 'Use technical, methodological language with metrics and confidence bounds.'}",
                f"Current page: {context.page}",
                "GLOBAL RULE: Unless you are generating the initial comprehensive auto-summary of a new EEG report, YOUR RESPONSES MUST BE EXTREMELY CONCISE, PRECISE, AND STRAIGHT TO THE POINT. No filler words, no lengthy paragraphs.",
                "--- CURRENT REPORT ---",
                *report_context_lines,
                "--- RECENT REPORTS ---",
                *reports_summary,
                "--- CHAT HISTORY ---",
                *history_lines,
                "--- PRODUCT KNOWLEDGE ---",
                *snippet_text,
            ]
        )

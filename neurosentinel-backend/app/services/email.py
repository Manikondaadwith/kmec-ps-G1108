"""Email notification service for NeuroSentinel AI.

Sends EEG report completion notifications with the clinical PDF attached.
Supports Resend API (preferred), Vercel relay, or SMTP fallback.
"""
from __future__ import annotations

import base64
import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_APP_URL = "https://neuro-sentinel-ai-6vfv.vercel.app"
LOGO_URL = f"{DEFAULT_APP_URL}/logo.jpeg"

_SUBJECT_SEIZURE = "NeuroSentinel AI - Seizure Activity Detected in {filename}"
_SUBJECT_SUSPICIOUS = "NeuroSentinel AI - Suspicious Patterns Found in {filename}"
_SUBJECT_NO_SEIZURE = "NeuroSentinel AI - No Seizure Activity Detected in {filename}"
_SUBJECT_TIMEOUT = "NeuroSentinel AI - EEG Analysis Timed Out for {filename}"
_SUBJECT_FAILED = "NeuroSentinel AI - EEG Analysis Failed for {filename}"
_SUBJECT_ABORTED = "NeuroSentinel AI - EEG Analysis Aborted for {filename}"
_SUBJECT_SIZE = "NeuroSentinel AI - File Size Warning for {filename}"


def _normalize_app_url(app_url: str | None) -> str:
    return DEFAULT_APP_URL


def _build_patient_email(report: dict[str, Any], filename: str, app_url: str) -> str:
    result = report.get("result_label", "Unknown")
    risk = report.get("risk_level", "Unknown")
    event_count = report.get("event_count", 0) or 0
    confidence = report.get("confidence_score")
    confidence_text = f"{confidence:.1f}%" if isinstance(confidence, (int, float)) else "unknown"
    diagnostic_state = report.get("diagnostic_state", "")
    seizure_detected = diagnostic_state == "DETECTED" or result.lower() == "seizure detected" or (isinstance(event_count, int) and event_count > 0)
    is_suspicious = diagnostic_state == "SUSPICIOUS"

    if seizure_detected:
        opening = (
            f'Your EEG recording "{filename}" has been analysed by NeuroSentinel AI. '
            f"The analysis has detected seizure-like activity — {event_count} segment(s) were flagged "
            f"with an overall risk level of {risk} and model confidence of {confidence_text}."
        )
        action = (
            "We recommend sharing this report with your healthcare provider or neurologist as soon as possible. "
            "Please do not make any changes to your medication or treatment without consulting your doctor first."
        )
    elif is_suspicious:
        opening = (
            f'Your EEG recording "{filename}" has been analysed by NeuroSentinel AI. '
            f"The analysis found suspicious patterns that warrant attention — the model flagged candidate "
            f"seizure-like activity, but these patterns did not meet the strict criteria for confirmed seizure events. "
            f"The overall risk level is {risk} with model confidence of {confidence_text}."
        )
        action = (
            "We recommend sharing this report with your neurologist so they can evaluate whether further "
            "testing, such as a repeat or extended EEG, is appropriate. There is no need for emergency action."
        )
    else:
        opening = (
            f'Your EEG recording "{filename}" has been analysed by NeuroSentinel AI. '
            f"No seizure activity was detected in this recording. "
            f"The overall risk level is {risk} with model confidence of {confidence_text}."
        )
        action = (
            "This is a reassuring result. We still recommend sharing this report with your doctor "
            "at your next scheduled visit for their review."
        )

    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #00F0FF; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">EEG Analysis Report Ready</p>
    </div>

    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0 0 16px 0;">{opening}</p>
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0;">{action}</p>
    </div>

    <div style="background: rgba(0,240,255,0.06); border: 1px solid rgba(0,240,255,0.12); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <p style="font-size: 13px; color: #00F0FF; margin: 0 0 8px 0; font-weight: 600;">Your clinical PDF report is attached to this email.</p>
        <p style="font-size: 13px; color: #C8C8D4; margin: 0;">For a more detailed AI-powered summary with health tips, dietary recommendations, and personalised guidance based on your results, open your report in the NeuroSentinel AI application.</p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: linear-gradient(135deg, #00F0FF, #818CF8); color: #0A0A0F; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; letter-spacing: 0.5px;">View Full Report in App</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />

    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">
        This report is generated by an AI model and is intended for clinical decision support only. It does not constitute a medical diagnosis. Always consult your healthcare provider before making any medical decisions.
    </p>
</div>
"""


def _build_clinician_email(report: dict[str, Any], filename: str, app_url: str) -> str:
    result = report.get("result_label", "Unknown")
    risk = report.get("risk_level", "Unknown")
    event_count = report.get("event_count", 0) or 0
    confidence = report.get("confidence_score")
    confidence_text = f"{confidence:.1f}%" if isinstance(confidence, (int, float)) else "N/A"
    quality = report.get("quality_grade", "Unknown")
    result_color = "#FF3366" if "seizure" in result.lower() else "#00FF9D"

    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #00F0FF; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Clinical Report Notification</p>
    </div>

    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; font-size: 13px; color: #C8C8D4; border-collapse: collapse;">
            <tr><td style="padding: 4px 0; color: #8888A0;">File</td><td style="padding: 4px 0; text-align: right;">{filename}</td></tr>
            <tr><td style="padding: 4px 0; color: #8888A0;">Result</td><td style="padding: 4px 0; text-align: right; font-weight: 600; color: {result_color};">{result}</td></tr>
            <tr><td style="padding: 4px 0; color: #8888A0;">Risk</td><td style="padding: 4px 0; text-align: right;">{risk}</td></tr>
            <tr><td style="padding: 4px 0; color: #8888A0;">Events</td><td style="padding: 4px 0; text-align: right;">{event_count}</td></tr>
            <tr><td style="padding: 4px 0; color: #8888A0;">Confidence</td><td style="padding: 4px 0; text-align: right;">{confidence_text}</td></tr>
            <tr><td style="padding: 4px 0; color: #8888A0;">Quality</td><td style="padding: 4px 0; text-align: right;">{quality}</td></tr>
        </table>
    </div>

    <p style="font-size: 13px; color: #C8C8D4; margin: 0 0 16px 0;">Clinical PDF is attached. For full structured analysis with explainability outputs, probability timelines, and SCOUT AI summary, access the report in the application.</p>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: linear-gradient(135deg, #00F0FF, #818CF8); color: #0A0A0F; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; letter-spacing: 0.5px;">Open in NeuroSentinel AI</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">AI-generated report for clinical decision support. Not a standalone diagnosis. All [HEURISTIC] labels are rule-based estimates.</p>
</div>
"""


def _build_researcher_email(report: dict[str, Any], filename: str, app_url: str) -> str:
    result = report.get("result_label", "Unknown")
    risk = report.get("risk_level", "Unknown")
    event_count = report.get("event_count", 0) or 0
    confidence = report.get("confidence_score")
    confidence_text = f"{confidence:.1f}%" if isinstance(confidence, (int, float)) else "N/A"

    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #00F0FF; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Analysis Complete</p>
    </div>

    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0;">
            Analysis of <strong>{filename}</strong> is complete.
            Result: {result}, risk {risk}, confidence {confidence_text}, events {event_count}.
            The clinical PDF with structured findings is attached.
        </p>
    </div>

    <p style="font-size: 13px; color: #C8C8D4; margin: 0 0 16px 0;">For the full technical breakdown - including probability timelines, channel importance rankings, attention heatmaps, band power analysis, and SCOUT AI methodology notes - open the report in the application.</p>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: linear-gradient(135deg, #00F0FF, #818CF8); color: #0A0A0F; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; letter-spacing: 0.5px;">Open in NeuroSentinel AI</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">Model outputs are decision-support evidence. Cross-validate flagged segments against raw traces before drawing conclusions.</p>
</div>
"""


def _build_timeout_email(filename: str, app_url: str) -> str:
    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #00F0FF; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Analysis Halted</p>
    </div>

    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0 0 16px 0;">
            The analysis of your EEG recording <strong>{filename}</strong> has timed out after 1 hour of processing.
        </p>
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0;">
            This typically happens with exceptionally long or complex recordings that exceed our current automated processing limits.
            We recommend splitting the recording into smaller segments and re-uploading them, or contacting our technical support team for assistance.
        </p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: rgba(255,255,255,0.08); color: #00F0FF; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; border: 1px solid rgba(0,240,255,0.2);">Return to App</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">Automated notification from NeuroSentinel AI Clinical Intelligence System.</p>
</div>
"""


def _build_failure_email(filename: str, app_url: str, error_msg: str | None = None) -> str:
    error_detail = f"<p style='color: #FF3366; font-family: monospace; font-size: 12px;'>Error: {error_msg}</p>" if error_msg else ""
    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #FF3366; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Analysis Failed</p>
    </div>

    <div style="background: rgba(255,51,102,0.04); border: 1px solid rgba(255,51,102,0.12); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0 0 16px 0;">
            We encountered an unexpected error while processing your EEG recording <strong>{filename}</strong>.
        </p>
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0 0 16px 0;">
            This could be due to a corrupt file format, signal interference, or a temporary server issue. Please try re-uploading the file.
        </p>
        {error_detail}
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: rgba(255,255,255,0.08); color: #FF3366; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; border: 1px solid rgba(255,51,102,0.2);">Return to App</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">Automated notification from NeuroSentinel AI Clinical Intelligence System.</p>
</div>
"""


def _build_aborted_email(filename: str, app_url: str) -> str:
    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #00F0FF; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Analysis Aborted</p>
    </div>

    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0 0 16px 0;">
            The analysis for <strong>{filename}</strong> was manually aborted by a user.
        </p>
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0;">
            No report was generated for this file. You can start a new analysis at any time by uploading a new EDF file to the dashboard.
        </p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: rgba(0,240,255,0.08); color: #00F0FF; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; border: 1px solid rgba(0,240,255,0.2);">Back to App</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">Automated notification from NeuroSentinel AI Clinical Intelligence System.</p>
</div>
"""


def _build_size_email(filename: str, app_url: str, limit_mb: int) -> str:
    return f"""
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0F; color: #E8E8F0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
        <img src="{LOGO_URL}" alt="NeuroSentinel AI" style="width: 48px; height: 48px; margin-bottom: 12px; border-radius: 8px;" />
        <h1 style="font-size: 20px; color: #FFD700; margin: 0;">NeuroSentinel AI</h1>
        <p style="font-size: 11px; color: #565670; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Upload Size Exceeded</p>
    </div>

    <div style="background: rgba(255,215,0,0.04); border: 1px solid rgba(255,215,0,0.12); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0 0 16px 0;">
            Your EEG recording <strong>{filename}</strong> exceeded our maximum upload size limit of {limit_mb}MB.
        </p>
        <p style="font-size: 14px; line-height: 1.7; color: #C8C8D4; margin: 0;">
            To process this recording, please split the EDF file into smaller segments or use a lower sampling rate, then re-upload.
        </p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{app_url}" style="display: inline-block; background: rgba(255,255,255,0.08); color: #FFD700; font-size: 13px; font-weight: 700; padding: 12px 28px; border-radius: 12px; text-decoration: none; border: 1px solid rgba(255,215,0,0.2);">Return to App</a>
    </div>

    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
    <p style="font-size: 11px; color: #565670; text-align: center; line-height: 1.6; margin: 0;">Automated notification from NeuroSentinel AI Clinical Intelligence System.</p>
</div>
"""


def _build_email_html(report: dict[str, Any], filename: str, role: str | None, app_url: str) -> str:
    role_lower = (role or "").lower()
    if role_lower == "patient":
      return _build_patient_email(report, filename, app_url)
    if role_lower == "researcher":
      return _build_researcher_email(report, filename, app_url)
    return _build_clinician_email(report, filename, app_url)


def _get_subject(report: dict[str, Any], filename: str) -> str:
    result = report.get("result_label", "")
    event_count = report.get("event_count", 0) or 0
    diagnostic_state = report.get("diagnostic_state", "")
    if diagnostic_state == "DETECTED" or result.lower() == "seizure detected" or (isinstance(event_count, int) and event_count > 0):
        return _SUBJECT_SEIZURE.format(filename=filename)
    if diagnostic_state == "SUSPICIOUS":
        return _SUBJECT_SUSPICIOUS.format(filename=filename)
    return _SUBJECT_NO_SEIZURE.format(filename=filename)


def send_report_email_relay(
    *,
    api_url: str,
    secret: str,
    to_email: str,
    report: dict[str, Any],
    filename: str,
    role: str | None,
    app_url: str = DEFAULT_APP_URL,
    pdf_bytes: bytes | None = None,
) -> tuple[bool, str | None]:
    """Send report notification via Vercel proxy relay (HTTP)."""
    subject = _get_subject(report, filename)
    html = _build_email_html(report, filename, role, _normalize_app_url(app_url))

    payload: dict[str, Any] = {
        "to_email": to_email,
        "subject": subject,
        "html": html,
        "filename": f"NeuroSentinel_Report_{filename.replace('.edf', '')}.pdf",
    }

    if pdf_bytes:
        payload["pdf_base64"] = base64.b64encode(pdf_bytes).decode("ascii")

    try:
        response = httpx.post(
            api_url,
            headers={
                "x-internal-secret": secret,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=40.0,
        )
        if response.status_code == 200:
            logger.info("Report email sent to %s via Vercel Relay for file %s", to_email, filename)
            return True, None

        err = f"Vercel Relay returned {response.status_code}: {response.text[:200]}"
        logger.warning(err)
        return False, err
    except Exception as exc:
        err = f"Failed to send email via Vercel Relay: {exc}"
        logger.warning(err)
        return False, err


def send_report_email_resend(
    *,
    api_key: str,
    to_email: str,
    from_email: str,
    report: dict[str, Any],
    filename: str,
    role: str | None,
    app_url: str = DEFAULT_APP_URL,
    pdf_bytes: bytes | None = None,
) -> tuple[bool, str | None]:
    """Send report notification via Resend HTTP API."""
    subject = _get_subject(report, filename)
    html = _build_email_html(report, filename, role, _normalize_app_url(app_url))

    payload: dict[str, Any] = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    if pdf_bytes:
        payload["attachments"] = [
            {
                "filename": f"NeuroSentinel_Report_{filename.replace('.edf', '')}.pdf",
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
                "type": "application/pdf",
            }
        ]

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30.0,
        )
        if response.status_code in (200, 201):
            logger.info("Report email sent to %s via Resend for file %s", to_email, filename)
            return True, None
        err = f"Resend API returned {response.status_code}: {response.text[:200]}"
        logger.warning(err)
        return False, err
    except Exception as exc:
        err = f"Failed to send email via Resend: {exc}"
        logger.warning(err)
        return False, err


def send_report_email_smtp(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    from_email: str,
    to_email: str,
    report: dict[str, Any],
    filename: str,
    role: str | None,
    app_url: str = DEFAULT_APP_URL,
    pdf_bytes: bytes | None = None,
) -> tuple[bool, str | None]:
    """Send report notification via SMTP."""
    subject = _get_subject(report, filename)
    html = _build_email_html(report, filename, role, _normalize_app_url(app_url))

    msg = MIMEMultipart("mixed")
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html", "utf-8"))

    if pdf_bytes:
        pdf_part = MIMEApplication(pdf_bytes, _subtype="pdf")
        pdf_part.add_header(
            "Content-Disposition",
            "attachment",
            filename=f"NeuroSentinel_Report_{filename.replace('.edf', '')}.pdf",
        )
        msg.attach(pdf_part)

    clean_password = smtp_password.replace(" ", "") if smtp_password else ""

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(smtp_user, clean_password)
        server.send_message(msg)
        server.quit()
        logger.info("Report email sent to %s via SMTP (%s) for file %s", to_email, smtp_host, filename)
        return True, None
    except smtplib.SMTPAuthenticationError as exc:
        err = f"SMTP authentication failed for {smtp_host} (likely wrong credentials): {exc}"
        logger.error(err)
        return False, err
    except Exception as exc:
        err = f"Failed to send email via SMTP ({smtp_host}): {exc}"
        logger.warning(err)
        return False, err


def send_report_notification(
    *,
    to_email: str,
    report: dict[str, Any],
    filename: str,
    role: str | None,
    pdf_bytes: bytes | None = None,
    resend_api_key: str | None = None,
    resend_from_email: str = "NeuroSentinel AI <noreply@neurosentinel.app>",
    relay_api_url: str | None = None,
    internal_api_secret: str = "neurosentinel-internal-key-2026",
    smtp_host: str | None = None,
    smtp_port: int = 587,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    smtp_from_email: str | None = None,
    app_url: str = DEFAULT_APP_URL,
) -> tuple[bool, str | None]:
    """Send report completion notification. Tries Resend first, then relay, then SMTP."""
    if not to_email:
        err = "No email address provided - skipping report notification."
        logger.warning(err)
        return False, err

    normalized_app_url = _normalize_app_url(app_url)

    if resend_api_key:
        return send_report_email_resend(
            api_key=resend_api_key,
            to_email=to_email,
            from_email=resend_from_email,
            report=report,
            filename=filename,
            role=role,
            app_url=normalized_app_url,
            pdf_bytes=pdf_bytes,
        )

    if relay_api_url:
        return send_report_email_relay(
            api_url=relay_api_url,
            secret=internal_api_secret,
            to_email=to_email,
            report=report,
            filename=filename,
            role=role,
            app_url=normalized_app_url,
            pdf_bytes=pdf_bytes,
        )

    if smtp_host and smtp_user and smtp_password:
        return send_report_email_smtp(
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            from_email=smtp_from_email or smtp_user,
            to_email=to_email,
            report=report,
            filename=filename,
            role=role,
            app_url=normalized_app_url,
            pdf_bytes=pdf_bytes,
        )

    logger.info("No email provider configured (RESEND_API_KEY, RELAY_API_URL, or SMTP_*). Skipping email notification for %s.", filename)
    return False, "No email provider configured."


def send_timeout_notification(
    *,
    to_email: str,
    filename: str,
    app_url: str = DEFAULT_APP_URL,
    resend_api_key: str | None = None,
    resend_from_email: str = "NeuroSentinel AI <noreply@neurosentinel.app>",
    smtp_host: str | None = None,
    smtp_port: int = 587,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    smtp_from_email: str | None = None,
    relay_api_url: str | None = None,
    internal_api_secret: str = "neurosentinel-internal-key-2026",
) -> bool:
    if not to_email:
        return False

    subject = _SUBJECT_TIMEOUT.format(filename=filename)
    html = _build_timeout_email(filename, _normalize_app_url(app_url))
    return _send_generic_notification(
        to_email=to_email,
        subject=subject,
        html=html,
        resend_api_key=resend_api_key,
        resend_from_email=resend_from_email,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        smtp_from_email=smtp_from_email,
        relay_api_url=relay_api_url,
        internal_api_secret=internal_api_secret,
    )


def send_failure_notification(
    *,
    to_email: str,
    filename: str,
    error_msg: str | None = None,
    app_url: str = DEFAULT_APP_URL,
    resend_api_key: str | None = None,
    resend_from_email: str = "NeuroSentinel AI <noreply@neurosentinel.app>",
    smtp_host: str | None = None,
    smtp_port: int = 587,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    smtp_from_email: str | None = None,
    relay_api_url: str | None = None,
    internal_api_secret: str = "neurosentinel-internal-key-2026",
) -> bool:
    if not to_email:
        return False

    subject = _SUBJECT_FAILED.format(filename=filename)
    html = _build_failure_email(filename, _normalize_app_url(app_url), error_msg)
    return _send_generic_notification(
        to_email=to_email,
        subject=subject,
        html=html,
        resend_api_key=resend_api_key,
        resend_from_email=resend_from_email,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        smtp_from_email=smtp_from_email,
        relay_api_url=relay_api_url,
        internal_api_secret=internal_api_secret,
    )


def send_aborted_notification(
    *,
    to_email: str,
    filename: str,
    app_url: str = DEFAULT_APP_URL,
    resend_api_key: str | None = None,
    resend_from_email: str = "NeuroSentinel AI <noreply@neurosentinel.app>",
    smtp_host: str | None = None,
    smtp_port: int = 587,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    smtp_from_email: str | None = None,
    relay_api_url: str | None = None,
    internal_api_secret: str = "neurosentinel-internal-key-2026",
) -> bool:
    if not to_email:
        return False

    subject = _SUBJECT_ABORTED.format(filename=filename)
    html = _build_aborted_email(filename, _normalize_app_url(app_url))
    return _send_generic_notification(
        to_email=to_email,
        subject=subject,
        html=html,
        resend_api_key=resend_api_key,
        resend_from_email=resend_from_email,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        smtp_from_email=smtp_from_email,
        relay_api_url=relay_api_url,
        internal_api_secret=internal_api_secret,
    )


def send_size_exceeded_notification(
    *,
    to_email: str,
    filename: str,
    limit_mb: int,
    app_url: str = DEFAULT_APP_URL,
    resend_api_key: str | None = None,
    resend_from_email: str = "NeuroSentinel AI <noreply@neurosentinel.app>",
    smtp_host: str | None = None,
    smtp_port: int = 587,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    smtp_from_email: str | None = None,
    relay_api_url: str | None = None,
    internal_api_secret: str = "neurosentinel-internal-key-2026",
) -> bool:
    if not to_email:
        return False

    subject = _SUBJECT_SIZE.format(filename=filename)
    html = _build_size_email(filename, _normalize_app_url(app_url), limit_mb)
    return _send_generic_notification(
        to_email=to_email,
        subject=subject,
        html=html,
        resend_api_key=resend_api_key,
        resend_from_email=resend_from_email,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
        smtp_from_email=smtp_from_email,
        relay_api_url=relay_api_url,
        internal_api_secret=internal_api_secret,
    )


def _send_generic_notification(
    *,
    to_email: str,
    subject: str,
    html: str,
    resend_api_key: str | None,
    resend_from_email: str,
    smtp_host: str | None,
    smtp_port: int,
    smtp_user: str | None,
    smtp_password: str | None,
    smtp_from_email: str | None,
    relay_api_url: str | None = None,
    internal_api_secret: str = "neurosentinel-internal-key-2026",
) -> bool:
    if resend_api_key:
        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": resend_from_email,
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                },
                timeout=30.0,
            )
            if response.status_code in (200, 201):
                return True
        except Exception:
            pass

    if relay_api_url:
        payload = {
            "to_email": to_email,
            "subject": subject,
            "html": html,
        }
        try:
            response = httpx.post(
                relay_api_url,
                headers={
                    "x-internal-secret": internal_api_secret,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=40.0,
            )
            if response.status_code == 200:
                return True
        except Exception as exc:
            logger.warning(f"Failed to send email via Vercel Relay: {exc}")
            pass

    if smtp_host and smtp_user and smtp_password:
        try:
            msg = MIMEMultipart("mixed")
            msg["From"] = smtp_from_email or smtp_user
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html, "html", "utf-8"))

            if smtp_port == 465:
                server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
            else:
                server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                server.ehlo()
                server.starttls()
                server.ehlo()

            clean_password = smtp_password.replace(" ", "")
            server.login(smtp_user, clean_password)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as exc:
            logger.warning("SMTP send to %s failed: %s", to_email, exc)

    return False

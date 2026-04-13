from __future__ import annotations

import gc
import os
from typing import Any

import numpy as np
import torch

from app.pipeline.config import PIPELINE_CONFIG, SEIZURE_STRIDE_SAMPLES, WINDOW_SAMPLES
from app.pipeline.preprocessing import preprocess_any_edf, preprocess_edf_to_data


def _smooth(probabilities: np.ndarray, window: int = 7) -> np.ndarray:
    if window <= 1:
        return probabilities.copy()
    kernel = np.ones(window) / window
    return np.convolve(probabilities, kernel, mode="same").astype(np.float32)


def _hysteresis(probabilities: np.ndarray, high: float, low: float, stride_sec: float = 1.0) -> list[tuple[float, float]]:
    events: list[tuple[float, float]] = []
    in_event = False
    start_index = 0
    for index, probability in enumerate(probabilities):
        if not in_event and probability >= high:
            in_event = True
            start_index = index
        elif in_event and probability < low:
            in_event = False
            events.append((start_index * stride_sec, index * stride_sec))
    if in_event:
        events.append((start_index * stride_sec, len(probabilities) * stride_sec))
    return events


def _filter_min_duration(events: list[tuple[float, float]], min_sec: float) -> list[tuple[float, float]]:
    return [(start, end) for start, end in events if (end - start) >= min_sec]


def _merge_close(events: list[tuple[float, float]], gap_sec: float) -> list[tuple[float, float]]:
    if len(events) <= 1:
        return list(events)
    merged: list[list[float]] = [[events[0][0], events[0][1]]]
    for start, end in events[1:]:
        if start - merged[-1][1] <= gap_sec:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(start, end) for start, end in merged]


def _mean_filter(probabilities: np.ndarray, events: list[tuple[float, float]], min_mean: float, stride_sec: float = 1.0) -> list[tuple[float, float]]:
    filtered: list[tuple[float, float]] = []
    for onset, offset in events:
        start_index = int(onset / stride_sec)
        end_index = min(int(offset / stride_sec), len(probabilities))
        event_probabilities = probabilities[start_index:end_index]
        if len(event_probabilities) and float(event_probabilities.mean()) >= min_mean:
            filtered.append((onset, offset))
    return filtered


def _sustained_filter(
    probabilities: np.ndarray,
    events: list[tuple[float, float]],
    sustained_sec: float,
    sustained_threshold: float,
    stride_sec: float = 1.0,
) -> list[tuple[float, float]]:
    required = int(sustained_sec / stride_sec)
    filtered: list[tuple[float, float]] = []
    for onset, offset in events:
        start_index = int(onset / stride_sec)
        end_index = min(int(offset / stride_sec), len(probabilities))
        event_probabilities = probabilities[start_index:end_index]
        current_run = 0
        max_run = 0
        for value in event_probabilities >= sustained_threshold:
            if value:
                current_run += 1
                max_run = max(max_run, current_run)
            else:
                current_run = 0
        if max_run >= required:
            filtered.append((onset, offset))
    return filtered


def compute_output_domain_shift(raw_probabilities: np.ndarray) -> float:
    if raw_probabilities is None or len(raw_probabilities) == 0:
        return 0.0
    probability_median = float(np.median(raw_probabilities))
    if probability_median < 0.05:
        return 0.0
    if probability_median < 0.15:
        return 0.3
    if probability_median < 0.30:
        return 0.6
    return 0.9


def domain_adaptive_post_process(probabilities: np.ndarray, domain_shift: float, stride_sec: float = 1.0) -> tuple[list[tuple[float, float]], float, float, dict[str, Any]]:
    if domain_shift >= 0.7:
        smooth_window = 13
        min_duration = 20.0
        min_mean = 0.88
        sustained_seconds = 8
        sustained_threshold = 0.88
        smoothed = _smooth(probabilities, window=smooth_window)
        high = 0.90
        low = 0.75
    elif domain_shift >= 0.4:
        smooth_window = 11
        min_duration = 20.0
        min_mean = 0.93
        sustained_seconds = 8
        sustained_threshold = 0.90
        smoothed = _smooth(probabilities, window=smooth_window)
        high = max(float(np.percentile(smoothed, 99.5)), 0.5)
        low = high * 0.7
    elif domain_shift >= 0.15:
        smooth_window = 9
        min_duration = 18.0
        min_mean = 0.91
        sustained_seconds = 6
        sustained_threshold = 0.87
        smoothed = _smooth(probabilities, window=smooth_window)
        high = max(float(np.percentile(smoothed, 99.0)), 0.5)
        low = high * 0.7
    else:
        smooth_window = 7
        min_duration = 15.0
        min_mean = 0.90
        sustained_seconds = 5
        sustained_threshold = 0.85
        smoothed = _smooth(probabilities, window=smooth_window)
        high = max(float(np.percentile(smoothed, 99.0)), 0.5)
        low = high * 0.7

    config = {
        "smooth_window": smooth_window,
        "min_duration": min_duration,
        "min_mean_prob": min_mean,
        "sustained_sec": sustained_seconds,
        "sustained_thresh": sustained_threshold,
        "threshold_mode": "fixed" if domain_shift >= 0.7 else "percentile",
    }

    events = _hysteresis(smoothed, high, low, stride_sec)
    events = _filter_min_duration(events, min_duration)
    events = _merge_close(events, 5.0)
    events = _mean_filter(probabilities, events, min_mean, stride_sec)
    events = _sustained_filter(probabilities, events, sustained_seconds, sustained_threshold, stride_sec)
    return events, high, low, config


@torch.no_grad()
def infer_probabilities(model: torch.nn.Module, windows: np.ndarray, device: torch.device, batch_size: int = 64) -> np.ndarray:
    chunks: list[np.ndarray] = []
    model.eval()
    for start in range(0, len(windows), batch_size):
        batch = torch.from_numpy(windows[start : start + batch_size]).to(device)
        logits = model(batch)
        probabilities = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
        chunks.append(probabilities)
    return np.concatenate(chunks)


@torch.no_grad()
def analyze_preprocessed_windows(
    model: torch.nn.Module,
    windows: np.ndarray,
    channel_mask: np.ndarray,
    metadata: dict[str, Any],
    device: torch.device | None = None,
    batch_size: int = 64,
) -> dict[str, Any]:
    if device is None:
        device = next(model.parameters()).device

    raw_probabilities = infer_probabilities(model, windows, device=device, batch_size=batch_size)
    output_shift = compute_output_domain_shift(raw_probabilities)
    events, high, low, post_process_config = domain_adaptive_post_process(raw_probabilities, output_shift, stride_sec=1.0)

    shift_label = "NONE" if output_shift < 0.15 else "LOW" if output_shift < 0.4 else "MODERATE" if output_shift < 0.7 else "HIGH"
    duration_hours = metadata.get("duration_sec", 0.0) / 3600 if metadata.get("duration_sec") else 0.0
    return {
        "status": "ok",
        "raw_probabilities": raw_probabilities,
        "events": events,
        "n_events": len(events),
        "events_per_hour": round(len(events) / max(duration_hours, 0.001), 2),
        "output_domain_shift": round(output_shift, 3),
        "shift_label": shift_label,
        "post_process_config": post_process_config,
        "threshold_high": round(float(high), 4),
        "threshold_low": round(float(low), 4),
        "raw_prob_mean": round(float(raw_probabilities.mean()), 4),
        "raw_prob_median": round(float(np.median(raw_probabilities)), 4),
        "raw_prob_p99": round(float(np.percentile(raw_probabilities, 99)), 4),
        "raw_prob_max": round(float(raw_probabilities.max()), 4),
        "metadata": metadata,
        "channel_mask": channel_mask.astype(bool),
    }


@torch.no_grad()
def robust_inference(
    model: torch.nn.Module,
    edf_path: str,
    device: torch.device | None = None,
    batch_size: int = 64,
) -> dict[str, Any]:
    filename = os.path.basename(edf_path)
    windows, channel_mask, metadata = preprocess_any_edf(edf_path)
    if windows is None or len(windows) == 0:
        return {"status": "no_windows", "filename": filename, "metadata": metadata, "events": []}

    result = analyze_preprocessed_windows(model, windows, channel_mask, metadata, device=device, batch_size=batch_size)
    result["filename"] = filename
    del windows
    gc.collect()
    return result


@torch.no_grad()
def infer_from_data_chunked(
    model: torch.nn.Module,
    data: np.ndarray,
    channel_mask: np.ndarray,
    metadata: dict[str, Any],
    device: torch.device | None = None,
    batch_size: int = 64,
    max_windows_per_chunk: int = 300,
) -> dict[str, Any]:
    """Run inference on preprocessed data without materializing all windows at once.

    This is the memory-efficient path for large EDF files. Instead of extracting
    all windows into a single array (which can require 600+ MiB), this function
    extracts windows in small chunks of `max_windows_per_chunk` and streams them
    through the model. Only the probabilities (one float per window) are kept.

    The preprocessing pipeline, model, and post-processing logic are IDENTICAL
    to the non-chunked path — only memory management changes.
    """
    if device is None:
        device = next(model.parameters()).device
    model.eval()

    channels, total_samples = data.shape
    win = WINDOW_SAMPLES
    stride = SEIZURE_STRIDE_SAMPLES

    if total_samples < win:
        return {"status": "no_windows", "metadata": metadata, "events": []}

    n_windows = (total_samples - win) // stride + 1
    all_probs: list[np.ndarray] = []
    representative_window: np.ndarray | None = None
    max_prob = -1.0
    quality_samples: list[np.ndarray] = []

    for chunk_start in range(0, n_windows, max_windows_per_chunk):
        chunk_end = min(chunk_start + max_windows_per_chunk, n_windows)
        chunk_n = chunk_end - chunk_start

        # Extract this chunk of windows from data using stride tricks
        sample_start = chunk_start * stride
        sample_end = (chunk_end - 1) * stride + win
        chunk_data = data[:, sample_start:sample_end]

        stride0, stride1 = chunk_data.strides
        view = np.lib.stride_tricks.as_strided(
            chunk_data,
            shape=(chunk_n, channels, win),
            strides=(stride * stride1, stride0, stride1),
            writeable=False,
        )
        windows = view.copy().astype(np.float32)

        # Run inference on this chunk
        probs = infer_probabilities(model, windows, device, batch_size)
        all_probs.append(probs)

        # Track representative window (highest seizure probability)
        chunk_max_idx = int(np.argmax(probs))
        if probs[chunk_max_idx] > max_prob:
            max_prob = float(probs[chunk_max_idx])
            representative_window = windows[chunk_max_idx].copy()

        # Sample windows for quality assessment (keep up to 50)
        if len(quality_samples) < 50:
            for i in range(0, len(windows), max(1, len(windows) // 5)):
                if len(quality_samples) < 50:
                    quality_samples.append(windows[i].copy())

        del windows, chunk_data, view
        gc.collect()

    raw_probabilities = np.concatenate(all_probs)
    del all_probs
    gc.collect()

    # Post-processing (identical to non-chunked path)
    output_shift = compute_output_domain_shift(raw_probabilities)
    events, high, low, post_process_config = domain_adaptive_post_process(raw_probabilities, output_shift, stride_sec=1.0)

    shift_label = "NONE" if output_shift < 0.15 else "LOW" if output_shift < 0.4 else "MODERATE" if output_shift < 0.7 else "HIGH"
    duration_hours = metadata.get("duration_sec", 0.0) / 3600 if metadata.get("duration_sec") else 0.0

    result = {
        "status": "ok",
        "raw_probabilities": raw_probabilities,
        "events": events,
        "n_events": len(events),
        "events_per_hour": round(len(events) / max(duration_hours, 0.001), 2),
        "output_domain_shift": round(output_shift, 3),
        "shift_label": shift_label,
        "post_process_config": post_process_config,
        "threshold_high": round(float(high), 4),
        "threshold_low": round(float(low), 4),
        "raw_prob_mean": round(float(raw_probabilities.mean()), 4),
        "raw_prob_median": round(float(np.median(raw_probabilities)), 4),
        "raw_prob_p99": round(float(np.percentile(raw_probabilities, 99)), 4),
        "raw_prob_max": round(float(raw_probabilities.max()), 4),
        "metadata": metadata,
        "channel_mask": channel_mask.astype(bool),
        "representative_window": representative_window,
        "quality_samples": np.stack(quality_samples) if quality_samples else None,
    }
    return result

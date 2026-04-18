export type StatusType = 'seizure_detected' | 'no_seizure' | 'failed' | 'processing' | 'pending' | 'aborted' | 'uploading'

export interface StatusConfig {
  label: string
  color: string
  bg: string
  text: string
  border: string
}

export const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  seizure_detected: {
    label: 'Seizure Detected',
    color: 'orange',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-500',
  },
  no_seizure: {
    label: 'No Seizure',
    color: 'green',
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-500',
  },
  failed: {
    label: 'Analysis Failed',
    color: 'red',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-500',
  },
  aborted: {
    label: 'Analysis Aborted',
    color: 'red',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-500',
  },
  uploading: {
    label: 'Uploading',
    color: 'blue',
    bg: 'bg-sky-100',
    text: 'text-sky-700',
    border: 'border-sky-500',
  },
  processing: {
    label: 'Processing',
    color: 'blue',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-500',
  },
  pending: {
    label: 'Queued',
    color: 'slate',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-500',
  },
}

export type ReliabilityType = 'High' | 'Moderate' | 'Low'

export interface ReliabilityConfig {
  label: string
  color: string
  bg: string
  text: string
  border: string
  icon: string
}

export const RELIABILITY_CONFIG: Record<ReliabilityType, ReliabilityConfig> = {
  High: {
    label: 'Reliability: High',
    color: 'green',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: '✓',
  },
  Moderate: {
    label: 'Reliability: Moderate',
    color: 'orange',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: '',
  },
  Low: {
    label: 'Reliability: Low',
    color: 'red',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: '⚠️',
  },
}

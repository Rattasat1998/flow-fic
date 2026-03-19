'use client';

import type { NextWebVitalsMetric } from 'next/app';
import { useReportWebVitals } from 'next/web-vitals';

const WEB_VITALS_SAMPLE_RATE = 0.5;

type VitalMetricPayload = {
  id: string;
  name: string;
  label: string;
  value: number;
  rating: string;
  delta: number;
  startTime: number;
  navigationType: string;
  path: string;
};

function postMetric(payload: VitalMetricPayload) {
  const body = JSON.stringify(payload);
  const url = '/api/internal/perf/web-vitals';

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
    return;
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  });
}

export function WebVitalsReporter() {
  useReportWebVitals((metric: NextWebVitalsMetric) => {
    if (Math.random() > WEB_VITALS_SAMPLE_RATE) return;

    const metricWithRuntimeFields = metric as NextWebVitalsMetric & {
      rating?: string;
      delta?: number;
      navigationType?: string;
    };

    postMetric({
      id: metric.id,
      name: metric.name,
      label: metric.label,
      value: metric.value,
      rating: metricWithRuntimeFields.rating || 'unknown',
      delta: metricWithRuntimeFields.delta ?? metric.value,
      startTime: metric.startTime,
      navigationType: metricWithRuntimeFields.navigationType || 'unknown',
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
    });
  });

  return null;
}

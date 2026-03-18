'use client';

import { useReportWebVitals } from 'next/web-vitals';

const WEB_VITALS_SAMPLE_RATE = 0.5;

type VitalMetricPayload = {
  id: string;
  name: string;
  value: number;
  rating: string;
  delta: number;
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
  useReportWebVitals((metric) => {
    if (Math.random() > WEB_VITALS_SAMPLE_RATE) return;

    postMetric({
      id: metric.id,
      name: metric.name,
      value: metric.value,
      rating: metric.rating || 'unknown',
      delta: metric.delta,
      navigationType: metric.navigationType || 'unknown',
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
    });
  });

  return null;
}
